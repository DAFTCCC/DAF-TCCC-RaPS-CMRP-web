// Dedicated FieldReady runtime only. Never log credential request/response bodies.
const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
function json(status:number,body:unknown){
  return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
}
function temporaryPassword(){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return 'Fr!'+Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>alphabet[b%64]).join('');
}
export async function handleAccountAdmin(req:Request,env:{get:(key:string)=>string|undefined},send:typeof fetch=fetch){
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json(405,{message:'Method not allowed.'});
  const url=(env.get('SUPABASE_URL')||'').replace(/\/$/,'');
  const key=env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!url||!key)return json(503,{message:'FieldReady account administration is not configured.'});
  if(!token)return json(401,{message:'Authentication required.'});
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const rpc=async(name:string,args:unknown)=>{
    const res=await send(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args)});
    if(!res.ok)throw new Error('Account operation could not complete. Verify the NUC update and account settings, then retry.');
    const text=await res.text();return text?JSON.parse(text):null;
  };
  try{
    const auth=await send(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token}});
    const user=auth.ok?await auth.json():null;
    if(!user?.id)return json(401,{message:'Invalid or expired FieldReady session.'});
    const profileRes=await send(url+'/rest/v1/fr_profiles?select=*&user_id=eq.'+encodeURIComponent(user.id),{headers});
    const caller=profileRes.ok?(await profileRes.json())?.[0]:null;
    let body:any;try{body=await req.json();}catch{return json(400,{message:'Invalid request body.'});}
    if(!body||typeof body!=='object')return json(400,{message:'Invalid request body.'});

    if(body.action==='change-temporary'){
      if(!caller?.password_change_required||!caller.password_resume_active)
        return json(403,{message:'Password setup is not available. Contact Enterprise.'});
      const current=typeof body.temporaryPassword==='string'?body.temporaryPassword:'';
      const next=typeof body.newPassword==='string'?body.newPassword:'';
      if(!current||current.length>4096||next.length<12||next.length>128||next===current)
        return json(400,{message:'Choose a different password between 12 and 128 characters.'});
      const context=await rpc('fr_password_change_context',{p_user_id:user.id});
      if(context?.limited)return json(429,{message:'Too many password-change attempts. Try again later.'});
      if(context?.error)return json(403,{message:context.error});
      // Verify the current password again: a stale session alone cannot activate access.
      const grant=await send(url+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:current})
      });
      if(grant.status===429)return json(429,{message:'Too many attempts. Try again later.'});
      const fresh=grant.ok?await grant.json():null;
      if(!fresh?.access_token||fresh.user?.id!==user.id)return json(400,{message:'The current temporary password is incorrect.'});
      const changed=await send(url+'/auth/v1/user',{
        method:'PUT',headers:{apikey:key,Authorization:'Bearer '+fresh.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({password:next})
      });
      if(!changed.ok)return json(400,{message:'Auth could not accept that password. Choose a different strong password and retry.'});
      try{await rpc('fr_complete_password_change',{p_user_id:user.id,p_reset_id:context.resetId});}
      catch{return json(409,{message:'Your password changed, but account activation did not complete. Sign in using the new password and finish setup, or contact Enterprise.'});}
      return json(200,{ok:true,session:fresh});
    }

    if(!caller?.active||caller.role!=='enterprise'||caller.password_change_required)
      return json(403,{message:'Enterprise access required.'});
    if(!['invite','create-temporary','reset-temporary'].includes(body.action))return json(400,{message:'Unsupported account action.'});
    if(body.action!=='invite'&&typeof caller.password_change_required!=='boolean')
      return json(503,{message:'Install the FieldReady temporary-password NUC update first.'});

    if(body.action==='reset-temporary'){
      if(typeof body.userId!=='string'||!body.userId||body.userId===user.id)
        return json(400,{message:'Select another enabled account. Use recovery for your own password.'});
      // Lock study access before changing Auth. On failure it stays locked for retry.
      const pending=await rpc('fr_begin_temporary_password',{p_actor:user.id,p_user_id:body.userId});
      const password=temporaryPassword();
      const reset=await send(url+'/auth/v1/admin/users/'+encodeURIComponent(body.userId),{
        method:'PUT',headers,body:JSON.stringify({password})
      });
      if(!reset.ok)return json(502,{message:'The reset did not complete. Study access remains locked; retry issuing a temporary password.'});
      return json(200,{ok:true,userId:body.userId,username:pending.username,expiresAt:pending.expiresAt,temporaryPassword:password});
    }

    const email=String(body.email||'').trim().toLowerCase(),displayName=String(body.displayName||'').trim();
    const role=String(body.role||'evaluator'),scopeType=body.scopeType||null,scopeValue=String(body.scopeValue||'').trim()||null;
    const parentScope=String(body.parentScope||'').trim()||null;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{message:'A valid account email is required.'});
    if(!['evaluator','program_manager','majcom_manager'].includes(role))return json(400,{message:'Unsupported role.'});
    if(role==='program_manager'&&(scopeType!=='installation'||!scopeValue))return json(400,{message:'Program managers require an installation scope.'});
    if(role==='majcom_manager'&&(scopeType!=='majcom'||!scopeValue))return json(400,{message:'MAJCOM managers require a MAJCOM scope.'});

    if(body.action==='create-temporary'){
      const username=String(body.username||'').trim().toLowerCase();
      if(!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(username))return json(400,{message:'Choose a valid username with 3–48 characters.'});
      if(role==='program_manager'&&!parentScope)return json(400,{message:'Select the Program Manager MAJCOM.'});
      const existing=await send(url+'/rest/v1/fr_profiles?select=user_id&username=eq.'+encodeURIComponent(username),{headers});
      if(!existing.ok)throw new Error('Username lookup failed');
      if((await existing.json()).length)return json(409,{message:'This username is unavailable. Choose another.'});
      const password=temporaryPassword();
      const created=await send(url+'/auth/v1/admin/users',{
        method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{display_name:displayName}})
      });
      if(!created.ok)return json(400,{message:'Auth could not create this account. If the email already exists, manage that account and reset its password.'});
      const identity=await created.json(),id=identity?.id||identity?.user?.id;
      if(!id)throw new Error('Auth did not return a new identity');
      try{
        const result=await rpc('fr_create_temporary_profile',{
          p_actor:user.id,p_user_id:id,p_email:email,p_display_name:displayName,p_username:username,
          p_role:role,p_scope_type:scopeType,p_scope_value:scopeValue,p_parent_scope:parentScope
        });
        return json(200,{ok:true,...result,temporaryPassword:password});
      }catch{
        // Only remove an unprovisioned identity created by this request. Never delete
        // a profile or existing study records, including on ambiguous network failure.
        const check=await send(url+'/rest/v1/fr_profiles?select=user_id&user_id=eq.'+encodeURIComponent(id),{headers});
        if(check.ok&&(await check.json()).length===0)await send(url+'/auth/v1/admin/users/'+encodeURIComponent(id),{method:'DELETE',headers});
        return json(409,{message:'Account provisioning did not complete. Check the username and scopes; refresh Users before retrying.'});
      }
    }

    // Preserve the existing email-invitation workflow.
    const invited=await send(url+'/auth/v1/invite',{
      method:'POST',headers,body:JSON.stringify({email,data:{display_name:displayName,fieldready_invited:true}})
    });
    const identity=invited.ok?await invited.json():null,id=identity?.id||identity?.user?.id;
    if(!id)return json(400,{message:'Unable to invite this email. Check the account and Auth invitation settings.'});
    const profile=await send(url+'/rest/v1/fr_profiles?on_conflict=user_id',{
      method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify([{user_id:id,email,display_name:displayName,active:true,role}])
    });
    if(!profile.ok)throw new Error('Invitation profile failed');
    const removed=await send(url+'/rest/v1/fr_memberships?user_id=eq.'+encodeURIComponent(id),{method:'DELETE',headers});
    if(!removed.ok)throw new Error('Invitation membership failed');
    if(role!=='evaluator'){
      const membership=await send(url+'/rest/v1/fr_memberships',{
        method:'POST',headers,body:JSON.stringify([{user_id:id,scope_type:scopeType,scope_value:scopeValue,...(parentScope?{parent_scope_value:parentScope}:{})}])
      });
      if(!membership.ok)throw new Error('Invitation scope failed');
    }
    await send(url+'/rest/v1/fr_account_requests?user_id=eq.'+encodeURIComponent(id),{
      method:'PATCH',headers,body:JSON.stringify({status:'approved',requested_role:role,reviewed_by:user.id,reviewed_at:new Date().toISOString(),decision_note:'Enterprise invitation'})
    });
    return json(200,{ok:true,userId:id,email});
  }catch{
    return json(503,{message:'Account operation could not complete. Verify the NUC update and account settings, then retry.'});
  }
}
if(typeof Deno!=='undefined')Deno.serve((req:Request)=>handleAccountAdmin(req,Deno.env));
