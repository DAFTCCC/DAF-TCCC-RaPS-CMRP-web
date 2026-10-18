// Password verification and sessions remain native Supabase Auth. Never log bodies.
const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
function json(status:number,body:unknown) {
  return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
}
export async function handleLogin(req:Request,env:{get:(key:string)=>string|undefined},send:typeof fetch=fetch) {
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json(405,{message:'Method not allowed.'});
  const url=(env.get('SUPABASE_URL')||'').replace(/\/$/,'');
  const key=env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return json(503,{message:'Username sign-in is not configured. Use your account email for now.'});
  let body:any;
  try { body=await req.json(); } catch { return json(400,{message:'Invalid username or password.'}); }
  const username=typeof body?.username==='string'?body.username.trim().toLowerCase():'';
  const password=typeof body?.password==='string'?body.password:'';
  if(!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(username)||!password||password.length>4096)
    return json(400,{message:'Invalid username or password.'});
  try {
    const lookup=await send(url+'/rest/v1/rpc/fr_resolve_login',{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({p_username:username})
    });
    if(!lookup.ok)throw new Error('Login lookup unavailable');
    const resolved=await lookup.json();
    if(resolved?.limited)return json(429,{message:'Too many sign-in attempts. Please try again later.'});
    // Unknown and inactive names still pass through Auth; do not reveal email mappings.
    const token=await send(url+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({email:resolved?.email||'unknown-fieldready-user@example.invalid',password})
    });
    if(token.status===429)return json(429,{message:'Too many sign-in attempts. Please try again later.'});
    if(token.status>=500)throw new Error('Auth unavailable');
    const session=await token.json();
    if(!resolved?.email||!token.ok||!session?.access_token)
      return json(400,{message:'Invalid username or password.'});
    // Forward the native session, never the service credential or lookup response.
    return json(200,session);
  } catch {
    return json(503,{message:'Username sign-in is temporarily unavailable. Use your account email or try again later.'});
  }
}
// The guard permits isolated Node tests without starting a server.
if(typeof Deno!=='undefined')Deno.serve((req:Request)=>handleLogin(req,Deno.env));
