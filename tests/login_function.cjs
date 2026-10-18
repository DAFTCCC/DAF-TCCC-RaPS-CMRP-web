'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const moduleUrl=pathToFileURL(path.resolve(__dirname,'../supabase/functions/fieldready-login/index.ts')).href;
const env={get:k=>({SUPABASE_URL:'https://nuc.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-only-key'})[k]};
const request=(username='Nurse.One',password='secret-password')=>new Request('https://function.invalid',{method:'POST',body:JSON.stringify({username,password})});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});

test('username login passes the password to native Auth and returns only its session',async()=>{
 const {handleLogin}=await import(moduleUrl);const calls=[];
 const session={access_token:'native-token',refresh_token:'native-refresh',user:{id:'same-user'}};
 const r=await handleLogin(request(),env,async(url,options)=>{
  calls.push({url,...options});
  return json(calls.length===1?{email:'private@example.invalid'}:session);
 });
 assert.equal(r.status,200);assert.deepEqual(await r.json(),session);
 assert.deepEqual(JSON.parse(calls[0].body),{p_username:'nurse.one'});
 assert.deepEqual(JSON.parse(calls[1].body),{email:'private@example.invalid',password:'secret-password'});
 assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('unknown, inactive, and wrong-password accounts return the same public error',async()=>{
 const {handleLogin}=await import(moduleUrl);
 for(const email of [null,'private@example.invalid']){
  let count=0;
  const r=await handleLogin(request(),env,async()=>++count===1?json({email}):json({error:'Sensitive Auth failure'},400));
  assert.equal(count,2);assert.equal(r.status,400);
  assert.deepEqual(await r.json(),{message:'Invalid username or password.'});
 }
});
test('database throttle is enforced before password verification',async()=>{
 const {handleLogin}=await import(moduleUrl);let calls=0;
 const r=await handleLogin(request(),env,async()=>{calls++;return json({limited:true});});
 assert.equal(calls,1);assert.equal(r.status,429);
});
test('bad input and backend errors never expose server credentials or lookup responses',async()=>{
 const {handleLogin}=await import(moduleUrl);
 for(const username of ['',"user'or'1",'a'.repeat(49)]){
  const r=await handleLogin(request(username),env,async()=>{throw new Error('Must not call backend');});assert.equal(r.status,400);
 }
 const r=await handleLogin(request(),env,async()=>{throw new Error('server-only-key');});
 assert.equal(r.status,503);assert.ok(!(await r.text()).includes('server-only-key'));
});
