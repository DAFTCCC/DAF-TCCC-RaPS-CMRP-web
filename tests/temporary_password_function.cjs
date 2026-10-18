'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const moduleUrl=pathToFileURL(path.resolve(__dirname,'../supabase/functions/fieldready-account-admin/index.ts')).href;
const env={get:k=>({SUPABASE_URL:'https://nuc.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-only-key'})[k]};
const json=(body,status=200)=>new Response(body===null?'':JSON.stringify(body),{status});
const request=body=>new Request('https://function.invalid',{method:'POST',headers:{Authorization:'Bearer caller-token'},body:JSON.stringify(body)});
function fake(profile={user_id:'admin',role:'enterprise',active:true,password_change_required:false},options={}){
 const calls=[];
 const send=async(url,init={})=>{
  const body=init.body?JSON.parse(init.body):null;calls.push({url,...init,body});
  if(url.endsWith('/auth/v1/user')&&!init.method)return json({id:profile.user_id,email:'caller@example.invalid'});
  if(url.includes('/fr_profiles?select=*&'))return json([profile]);
  if(url.includes('/fr_profiles?select=user_id&username='))return json(options.duplicate?[{user_id:'existing'}]:[]);
  if(url.endsWith('/rpc/fr_create_temporary_profile'))return json({userId:'new-user',username:'nurse.one',expiresAt:'2030-01-01T00:00:00Z'});
  if(url.endsWith('/rpc/fr_begin_temporary_password'))return json({username:'nurse.one',resetId:'reset',expiresAt:'2030-01-01T00:00:00Z'});
  if(url.endsWith('/rpc/fr_password_change_context'))return json(options.context||{resetId:'current-reset'});
  if(url.endsWith('/rpc/fr_complete_password_change'))return json(null,options.completeFails?409:200);
  if(url.endsWith('/auth/v1/admin/users')&&init.method==='POST')return json({id:'new-user'});
  if(url.includes('/auth/v1/admin/users/')&&init.method==='PUT')return json(options.authFails?{message:'Sensitive native failure'}:{id:'target'},options.authFails?500:200);
  if(url.includes('/auth/v1/token?'))return json(options.badCurrent?{}:{access_token:'fresh-token',refresh_token:'fresh-refresh',user:{id:profile.user_id}},options.badCurrent?400:200);
  if(url.endsWith('/auth/v1/user')&&init.method==='PUT')return json({id:profile.user_id});
  throw new Error('Unexpected test route '+url);
 };
 return {calls,send};
}
test('Enterprise creates a confirmed Auth identity and atomically provisions pending access; no invitation email',async()=>{
 const {handleAccountAdmin}=await import(moduleUrl);const f=fake();
 const r=await handleAccountAdmin(request({action:'create-temporary',email:'nurse@example.invalid',displayName:'Nurse',username:'Nurse.One',role:'program_manager',scopeType:'installation',scopeValue:'base',parentScope:'ACC'}),env,f.send);
 assert.equal(r.status,200);const body=await r.json();
 assert.match(body.temporaryPassword,/^Fr![A-Za-z0-9_-]{24}$/);assert.equal(body.username,'nurse.one');
 const auth=f.calls.find(c=>c.url.endsWith('/auth/v1/admin/users'));
 assert.equal(auth.body.email_confirm,true);assert.equal(auth.body.password,body.temporaryPassword);
 const provision=f.calls.find(c=>c.url.endsWith('/rpc/fr_create_temporary_profile'));
 assert.equal(provision.body.p_parent_scope,'ACC');assert.equal(provision.body.p_actor,'admin');
 assert.ok(!JSON.stringify(provision.body).includes(body.temporaryPassword));
 assert.ok(!f.calls.some(c=>c.url.endsWith('/invite')));assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('reset blocks study access before changing Auth and never changes role/scope',async()=>{
 const {handleAccountAdmin}=await import(moduleUrl);const f=fake();
 const r=await handleAccountAdmin(request({action:'reset-temporary',userId:'target'}),env,f.send);
 assert.equal(r.status,200);const body=await r.json();assert.ok(body.temporaryPassword);
 const lock=f.calls.findIndex(c=>c.url.endsWith('/rpc/fr_begin_temporary_password'));
 const change=f.calls.findIndex(c=>c.url.endsWith('/auth/v1/admin/users/target'));
 assert.ok(lock<change);assert.deepEqual(Object.keys(f.calls[change].body),['password']);
});
test('failed Auth resets stay locked and do not return a generated credential',async()=>{
 const {handleAccountAdmin}=await import(moduleUrl);const f=fake(undefined,{authFails:true});
 const r=await handleAccountAdmin(request({action:'reset-temporary',userId:'target'}),env,f.send);
 assert.equal(r.status,502);const body=await r.json();assert.equal(body.temporaryPassword,undefined);assert.match(body.message,/remains locked/);
});
test('evaluators, pending Enterprise accounts and self-reset cannot issue credentials',async()=>{
 const {handleAccountAdmin}=await import(moduleUrl);
 for(const p of [{user_id:'eval',role:'evaluator',active:true},{user_id:'pending',role:'enterprise',active:false,password_change_required:true}]){
  const f=fake(p);const r=await handleAccountAdmin(request({action:'reset-temporary',userId:'target'}),env,f.send);
  assert.equal(r.status,403);assert.equal(f.calls.length,2);
 }
 const f=fake();assert.equal((await handleAccountAdmin(request({action:'reset-temporary',userId:'admin'}),env,f.send)).status,400);
});
test('first password change verifies current credentials, updates Auth, then activates only the matching reset',async()=>{
 const {handleAccountAdmin}=await import(moduleUrl);const f=fake({user_id:'pending',active:false,password_change_required:true,password_resume_active:true});
 const r=await handleAccountAdmin(request({action:'change-temporary',temporaryPassword:'old-temporary',newPassword:'new-private-password'}),env,f.send);
 assert.equal(r.status,200);assert.equal((await r.json()).session.access_token,'fresh-token');
 const grant=f.calls.findIndex(c=>c.url.includes('/token?'));const changed=f.calls.findIndex(c=>c.url.endsWith('/auth/v1/user')&&c.method==='PUT');const complete=f.calls.findIndex(c=>c.url.endsWith('/rpc/fr_complete_password_change'));
 assert.ok(grant<changed&&changed<complete);
 assert.equal(f.calls[changed].headers.Authorization,'Bearer fresh-token');
 assert.deepEqual(f.calls[complete].body,{p_user_id:'pending',p_reset_id:'current-reset'});
 assert.ok(!f.calls.filter(c=>c.url.includes('/rpc/')).some(c=>JSON.stringify(c.body).includes('new-private-password')));
});
test('expired, throttled, wrong-current-password and stale-reset operations never activate access',async()=>{
 const {handleAccountAdmin}=await import(moduleUrl);const pending={user_id:'pending',active:false,password_change_required:true,password_resume_active:true};
 for(const [options,status] of [[{context:{error:'Expired'}},403],[{context:{limited:true}},429],[{badCurrent:true},400],[{completeFails:true},409]]){
  const f=fake(pending,options);const r=await handleAccountAdmin(request({action:'change-temporary',temporaryPassword:'old-temporary',newPassword:'new-private-password'}),env,f.send);
  assert.equal(r.status,status);
  if(!options.completeFails)assert.ok(!f.calls.some(c=>c.url.endsWith('/rpc/fr_complete_password_change')));
 }
});
test('missing migration and duplicate username fail before creating an Auth user',async()=>{
 const {handleAccountAdmin}=await import(moduleUrl);
 for(const [profile,options,status] of [[{user_id:'admin',role:'enterprise',active:true},{},503],[undefined,{duplicate:true},409]]){
  const f=fake(profile,options);const r=await handleAccountAdmin(request({action:'create-temporary',email:'nurse@example.invalid',username:'nurse.one',role:'evaluator'}),env,f.send);
  assert.equal(r.status,status);assert.ok(!f.calls.some(c=>c.url.endsWith('/auth/v1/admin/users')));
 }
});
