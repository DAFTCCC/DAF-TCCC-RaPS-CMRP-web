// FieldReady secure account invitation endpoint.
// This runs only in the dedicated FieldReady Supabase Edge Runtime.
// The service-role key remains server-side and is never sent to GitHub Pages.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(status:number, body:unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...cors, 'Content-Type':'application/json'}
  });
}

Deno.serve(async (req:Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:cors});
  if (req.method !== 'POST') return json(405, {message:'Method not allowed.'});

  const supabaseUrl=(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,'');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const auth=req.headers.get('Authorization')||'';
  const callerToken=auth.startsWith('Bearer ')?auth.slice(7):'';

  if (!supabaseUrl || !serviceKey) return json(500,{message:'FieldReady account administration is not configured.'});
  if (!callerToken) return json(401,{message:'Authentication required.'});

  const userRes=await fetch(supabaseUrl+'/auth/v1/user',{
    headers:{apikey:serviceKey,Authorization:'Bearer '+callerToken}
  });
  const user=userRes.ok?await userRes.json():null;
  if(!user?.id)return json(401,{message:'Invalid or expired FieldReady session.'});

  const callerRes=await fetch(
    supabaseUrl+'/rest/v1/fr_profiles?select=user_id,role,active&user_id=eq.'+encodeURIComponent(user.id),
    {headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey}}
  );
  const callerRows=callerRes.ok?await callerRes.json():[];
  const caller=callerRows?.[0];
  if (!caller || !caller.active || caller.role!=='enterprise') {
    return json(403,{message:'Enterprise access required.'});
  }

  let body:any={};
  try { body=await req.json(); } catch { return json(400,{message:'Invalid request body.'}); }

  if (body.action!=='invite') return json(400,{message:'Unsupported account action.'});

  const email=String(body.email||'').trim().toLowerCase();
  const displayName=String(body.displayName||'').trim();
  const role=String(body.role||'evaluator');
  const scopeType=body.scopeType?String(body.scopeType):null;
  const scopeValue=body.scopeValue?String(body.scopeValue).trim():null;

  if (!email || !email.includes('@')) return json(400,{message:'A valid email is required.'});
  if (!['evaluator','program_manager','majcom_manager'].includes(role)) return json(400,{message:'Unsupported role.'});
  if (role==='program_manager' && (scopeType!=='installation'||!scopeValue)) return json(400,{message:'Program managers require an installation scope.'});
  if (role==='majcom_manager' && (scopeType!=='majcom'||!scopeValue)) return json(400,{message:'MAJCOM managers require a MAJCOM scope.'});

  const inviteRes=await fetch(supabaseUrl+'/auth/v1/invite',{
    method:'POST',
    headers:{
      apikey:serviceKey,
      Authorization:'Bearer '+serviceKey,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      email,
      data:{display_name:displayName, fieldready_invited:true}
    })
  });

  const inviteText=await inviteRes.text();
  let invited:any=null;
  try { invited=inviteText?JSON.parse(inviteText):null; } catch { invited=null; }
  if (!inviteRes.ok) {
    return json(inviteRes.status,{message:invited?.msg||invited?.message||inviteText||'Unable to invite user.'});
  }

  const userId=invited?.id||invited?.user?.id;
  if (!userId) return json(502,{message:'Auth invitation did not return a user ID.'});

  const profileRes=await fetch(supabaseUrl+'/rest/v1/fr_profiles?on_conflict=user_id',{
    method:'POST',
    headers:{
      apikey:serviceKey,
      Authorization:'Bearer '+serviceKey,
      'Content-Type':'application/json',
      Prefer:'resolution=merge-duplicates,return=minimal'
    },
    body:JSON.stringify([{user_id:userId,email,display_name:displayName,active:true,role}])
  });
  if (!profileRes.ok) return json(500,{message:'Invitation created, but FieldReady profile provisioning failed.'});

  await fetch(supabaseUrl+'/rest/v1/fr_memberships?user_id=eq.'+encodeURIComponent(userId),{
    method:'DELETE',
    headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey}
  });

  if (role==='program_manager'||role==='majcom_manager') {
    const membershipRes=await fetch(supabaseUrl+'/rest/v1/fr_memberships',{
      method:'POST',
      headers:{
        apikey:serviceKey,
        Authorization:'Bearer '+serviceKey,
        'Content-Type':'application/json',
        Prefer:'return=minimal'
      },
      body:JSON.stringify([{
        user_id:userId,
        scope_type:scopeType,
        scope_value:scopeValue
      }])
    });
    if (!membershipRes.ok) return json(500,{message:'Invitation created, but scope assignment failed.'});
  }

  await fetch(supabaseUrl+'/rest/v1/fr_account_requests?user_id=eq.'+encodeURIComponent(userId),{
    method:'PATCH',
    headers:{
      apikey:serviceKey,
      Authorization:'Bearer '+serviceKey,
      'Content-Type':'application/json',
      Prefer:'return=minimal'
    },
    body:JSON.stringify({
      status:'approved',
      requested_role:role,
      reviewed_by:caller.user_id,
      reviewed_at:new Date().toISOString(),
      decision_note:'Enterprise invitation'
    })
  });

  return json(200,{ok:true,userId,email});
});
