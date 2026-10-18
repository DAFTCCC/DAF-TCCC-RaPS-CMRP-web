'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(fetch,profile={user_id:'test-user',active:true,role:'enterprise'}){
 const storage=new Map();
 const events=[];
 const session={access_token:'test-token',user:{id:'test-user'}};
 const sessionStore=new Map([['FIELDREADY_SUPABASE_SESSION_V1',JSON.stringify(session)]]);
 const context={
  window:{FIELDREADY_BACKEND:{enabled:true,url:'https://example.invalid',anonKey:'public',tables:{events:'events',participants:'participants',evaluations:'evaluations',voids:'voids',profiles:'profiles',memberships:'memberships',accountRequests:'requests'}} ,addEventListener:()=>{},dispatchEvent:e=>events.push(e)},
  document:{getElementById:()=>null},navigator:{onLine:true},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  sessionStorage:{getItem:k=>sessionStore.get(k)||null,setItem:(k,v)=>sessionStore.set(k,v),removeItem:k=>sessionStore.delete(k)},
  fetch:async(url,options)=>url.includes('/profiles?')?response(profile?[profile]:[]):fetch(url,options),URLSearchParams,structuredClone,Date,console,
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  setTimeout:()=>0,clearTimeout:()=>{}
 };
 // Expose internals only in this isolated test context; production API stays private.
 const source=fs.readFileSync(require.resolve('../sync.js'),'utf8').replace('window.FieldReadySync=Object.freeze({','window.testHooks={getAll,flatten,rebuild,writePlan,applyPlan,push,evaluatorPushScope,managerPushScope};\nwindow.FieldReadySync=Object.freeze({');
 vm.runInNewContext(source,context);
 return {context,storage,events,sync:context.window.FieldReadySync,getAll:context.window.testHooks.getAll,hooks:context.window.testHooks};
}
const response=body=>({ok:true,text:async()=>JSON.stringify(body)});

test('username sign-in uses the public login function and retains the native account identity',async()=>{
 const calls=[];
 const h=harness(async(url,options)=>{
  calls.push({url,...options});
  return {ok:true,json:async()=>({access_token:'native-token',refresh_token:'native-refresh',user:{id:'test-user'}})};
 });
 await h.sync.signIn(' Nurse.One ','password');
 assert.equal(calls[0].url,'https://example.invalid/functions/v1/fieldready-login');
 assert.deepEqual(JSON.parse(calls[0].body),{username:'nurse.one',password:'password'});
 assert.equal(calls[0].headers.Authorization,'Bearer public');
 assert.equal(h.sync.session().user.id,'test-user');
});

test('existing email sign-in remains available before username deployment',async()=>{
 const calls=[];
 const h=harness(async(url,options)=>{
  calls.push({url,...options});
  return response({access_token:'native-token',user:{id:'test-user'}});
 });
 await h.sync.signIn(' Nurse@Example.Invalid ','password');
 assert.ok(calls[0].url.endsWith('/auth/v1/token?grant_type=password'));
 assert.deepEqual(JSON.parse(calls[0].body),{email:'nurse@example.invalid',password:'password'});
});

test('missing username function leaves signed-out users on the login gate with email fallback guidance',async()=>{
 const h=harness(async()=>({ok:false,status:404,json:async()=>({})}));
 await h.sync.signOut();
 await assert.rejects(h.sync.signIn('nurse.one','password'),/Use your account email/);
 assert.equal(h.sync.session(),null);
});

test('table reads continue through server-capped short pages without losing records',async()=>{
 const calls=[];
 const h=harness(async url=>{
  calls.push(url);
  const cursor=new URL(url).searchParams.get('id');
  return response(cursor===null?[{id:'a'},{id:'b'}]:cursor==='gt.b'?[{id:'c'}]:[]);
 });
 assert.equal(JSON.stringify(await h.getAll('participants')),JSON.stringify([{id:'a'},{id:'b'},{id:'c'}]));
 assert.equal(calls.length,3);
 assert.ok(calls.every(url=>new URL(url).searchParams.get('order')==='id.asc'));
});

test('pagination fails safely when a server ignores the cursor',async()=>{
 const h=harness(async()=>response([{id:'a'}]));
 await assert.rejects(h.getAll('events'),/Pagination did not advance/);
});

test('a failed later page never returns a partial table',async()=>{
 let calls=0;
 const h=harness(async()=>++calls===1?response([{id:'a'}]):{ok:false,status:503,text:async()=>JSON.stringify({message:'Unavailable'})});
 await assert.rejects(h.getAll('events'),/Unavailable/);
});

for(const changed of ['local edit','server reset']){
 test(`sync does not publish a stale snapshot after a ${changed} during the final epoch check`,async()=>{
  let epochCalls=0;
  let h;
  h=harness(async url=>{
   if(url.includes('/rpc/fr_get_data_epoch')){
    epochCalls++;
    if(epochCalls===2&&changed==='local edit')h.sync.noteLocalChange();
    return response(epochCalls===2&&changed==='server reset'?'new-epoch':'epoch');
   }
   return response([]);
  });
  h.storage.set('FIELDREADY_SYNC_META_V1',JSON.stringify({pending:1,dataEpoch:'epoch',userId:'test-user'}));
  h.sync.init({getDb:()=>({events:[]})});
  if(changed==='server reset')await assert.rejects(h.sync.syncNow(),/Server data changed/);
  else await h.sync.syncNow();
  assert.equal(h.events.length,0);
  assert.ok(JSON.parse(h.storage.get('FIELDREADY_SYNC_META_V1')).pending>0);
 });
}

 test('enrollment, dated exposures, and assessment identity survive the sync payload round-trip',()=>{
 const h=harness(async()=>response([]));
 const enrollment={id:'enrollment-id',arm:'Control',enrolledDate:'2026-01-01',trainingDate:'2026-01-02'};
 const trainingExposures=[{id:'exposure-id',date:'2026-04-02',minutes:20,repetitions:5}];
 const assessment={phase:'pre',date:'2026-04-02'};
 const db={events:[{id:'event-id',participants:[{id:'roster-id',participantId:'N001',enrollment,trainingExposures,evaluation:{id:'evaluation-id',assessment},voids:[]}]}]};
 const restored=h.hooks.rebuild(h.hooks.flatten(db),db).events[0].participants[0];
 assert.equal(JSON.stringify(restored.enrollment),JSON.stringify(enrollment));
 assert.equal(JSON.stringify(restored.trainingExposures),JSON.stringify(trainingExposures));
 assert.equal(JSON.stringify(restored.evaluation.assessment),JSON.stringify(assessment));
});

test('warning-only mode disables synchronization even with a saved authenticated session',async()=>{
 let requests=0;
 const h=harness(async()=>{requests++;return response([]);});
 h.context.window.FIELDREADY_ACCESS={mode:'warning-only'};
 assert.equal(h.sync.configured(),false);
 await h.sync.syncNow({events:[]});
 await assert.rejects(h.sync.currentProfile(),/Server access is disabled/);
 assert.equal(requests,0);
});

function sharedServer(){
 const tables={events:[{id:'e1',server_revision:1,created_by:'test-user',payload:{id:'e1',name:'Study',studyArm:'Control',skillId:'TQ',timepoint:'baseline'}}],participants:[{id:'p1',event_id:'e1',participant_code:'N001',server_revision:1,payload:{id:'p1',participantId:'N001',workSection:'Original'}}],evaluations:[],voids:[]};
 const writes=[];
 const fetch=async(url,options={})=>{
  const u=new URL(url),name=u.pathname.split('/').at(-1),method=options.method||'GET';
  if(name==='fr_get_data_epoch')return response('epoch');
  const rows=tables[name];
  if(!rows)throw new Error('Unexpected route: '+url);
  if(method==='GET'){
   const cursor=u.searchParams.get('id')?.slice(3);
   return response(rows.filter(r=>!cursor||r.id>cursor));
  }
  writes.push({name,method});
  if(method==='PATCH'){
   const row=rows.find(r=>r.id===u.searchParams.get('id')?.slice(3)&&String(r.server_revision)===u.searchParams.get('server_revision')?.slice(3));
   if(!row)return response([]);
   Object.assign(row,JSON.parse(options.body));row.server_revision++;
   return response([row]);
  }
  if(method==='POST'){
   for(const row of JSON.parse(options.body)){if(rows.some(r=>r.id===row.id))throw new Error('Duplicate insert');rows.push({...row,server_revision:1});}
   return response(null);
  }
  throw new Error('Unexpected method');
 };
 return {tables,writes,fetch};
}
async function device(server){
 const h=harness(server.fetch);let db={events:[]};
 h.context.window.dispatchEvent=e=>{h.events.push(e);if(e.type==='fieldready:remote-db')db=e.detail.db;};
 h.sync.init({getDb:()=>db});await h.sync.syncNow();
 return {...h,get db(){return db;}};
}
test('two devices pull updates without uploading stale unchanged records',async()=>{
 const server=sharedServer(),a=await device(server),b=await device(server);
 a.db.events[0].participants[0].workSection='Device A edit';a.sync.noteLocalChange();await a.sync.syncNow();
 assert.equal(server.tables.participants[0].payload.workSection,'Device A edit');
 const writes=server.writes.length;
 await b.sync.syncNow();
 assert.equal(b.db.events[0].participants[0].workSection,'Device A edit');
 assert.equal(server.writes.length,writes);
});
test('simultaneous edits to the same row produce a conflict and preserve local work',async()=>{
 const server=sharedServer(),a=await device(server),b=await device(server);
 a.db.events[0].participants[0].workSection='Device A';a.sync.noteLocalChange();await a.sync.syncNow();
 b.db.events[0].participants[0].workSection='Device B';b.sync.noteLocalChange();
 await assert.rejects(b.sync.syncNow(),/Sync conflict/);
 assert.equal(server.tables.participants[0].payload.workSection,'Device A');
 assert.equal(b.db.events[0].participants[0].workSection,'Device B');
 assert.ok(JSON.parse(b.storage.get('FIELDREADY_SYNC_META_V1')).pending>0);
});
test('conditional revision checks catch a write that races after preflight',async()=>{
 const server=sharedServer(),a=await device(server);
 const row=a.hooks.flatten(a.db).participants[0];row.payload.workSection='changed';
 const plan=a.hooks.writePlan([row],server.tables.participants,'participants');
 server.tables.participants[0].server_revision++;
 await assert.rejects(a.hooks.applyPlan(plan),/Sync conflict/);
 assert.equal(server.tables.participants[0].payload.workSection,'Original');
});
test('sync metadata never leaks into participant or evaluation payloads',()=>{
 const h=harness(async()=>response([]));
 const db={events:[{id:'e',participants:[{id:'p',_serverRevision:5,_syncBaseline:'old',evaluation:{id:'v',_serverRevision:7,_syncBaseline:'old'}}]}]};
 const x=h.hooks.flatten(db);
 assert.equal(x.participants[0].payload._syncBaseline,undefined);
 assert.equal(x.evaluations[0].payload._serverRevision,undefined);
});

for(const profile of [null,{user_id:'test-user',active:false,role:'enterprise'},{user_id:'test-user',active:true,role:'unexpected'}]){
 test('unauthorized profiles cannot synchronize: '+JSON.stringify(profile),async()=>{
  const h=harness(async()=>response([]),profile);
  await assert.rejects(h.sync.syncNow({events:[]}),/not authorized|Unsupported/);
  assert.equal(h.events.length,0);
 });
}
test('evaluator and scoped manager writes exclude unrelated events and data',()=>{
 const h=harness(async()=>response([]));
 const x={events:[{id:'allowed',home_installation_id:'base',majcom:'command'},{id:'other',home_installation_id:'other',majcom:'other'}],participants:[{id:'p1',event_id:'allowed'},{id:'p2',event_id:'other'}],evaluations:[],voids:[]};
 const evaluator=h.hooks.evaluatorPushScope({},x,[{id:'allowed'}],'test-user');
 assert.equal(evaluator.events.length,0);
 assert.equal(evaluator.participants.length,1);
 for(const [role,type,value] of [['program_manager','installation','base'],['majcom_manager','majcom','command']]){
  const scoped=h.hooks.managerPushScope(x,{role},{scope_type:type,scope_value:value},[],'test-user');
  assert.equal(scoped.events.length,1);assert.equal(scoped.participants.length,1);
  assert.equal(h.hooks.managerPushScope(x,{role},null,[],'test-user').events.length,0);
 }
});
test('fresh exports fail explicitly offline or during grading',async()=>{
 const h=harness(async()=>response([]));
 h.context.navigator.onLine=false;
 await assert.rejects(h.sync.syncNow({events:[]},{requireFresh:true}),/Connect/);
 h.context.navigator.onLine=true;
 h.sync.init({shouldDeferAutoSync:()=>true});
 await assert.rejects(h.sync.syncNow({events:[]},{requireFresh:true}),/Finish grading/);
});

test('voided attempts cannot replace the current evaluation during pull',()=>{
 const h=harness(async()=>response([]));
 const rows={events:[{id:'e',payload:{}}],participants:[{id:'p',event_id:'e',participant_code:'N001',payload:{}}],evaluations:[{id:'old',participant_id:'p',payload:{finalResult:'FAIL'}},{id:'new',participant_id:'p',payload:{finalResult:'PASS'}}],voids:[{id:'old',participant_id:'p',payload:{voidReason:'Invalid attempt'}}]};
 const rebuilt=h.hooks.rebuild(rows,{});
 assert.equal(rebuilt.events[0].participants[0].evaluation.id,'new');
 assert.equal(rebuilt.events[0].participants[0].voids.length,1);
 rows.voids=[];
 assert.throws(()=>h.hooks.rebuild(rows,{}),/Multiple active evaluations/);
});
test('concurrent authenticated calls share one token refresh',async()=>{
 let refreshes=0;
 const h=harness(async url=>{
  if(url.includes('grant_type=refresh_token')){refreshes++;await Promise.resolve();return response({access_token:'new-token',expires_in:3600,user:{id:'test-user'}});}
  return response([]);
 });
 h.context.sessionStorage.setItem('FIELDREADY_SUPABASE_SESSION_V1',JSON.stringify({access_token:'expired',refresh_token:'test-refresh',expires_at:1,user:{id:'test-user'}}));
 await Promise.all([h.sync.currentProfile(),h.sync.currentProfile()]);
 assert.equal(refreshes,1);
 assert.equal(h.sync.session().access_token,'new-token');
});

test('signing out during a pull cannot publish the previous account snapshot',async()=>{
 const server=sharedServer();let onRead;
 const h=harness(async(url,options)=>{
  if(url.includes('/events?')&&onRead){const action=onRead;onRead=null;action();}
  return server.fetch(url,options);
 });
 h.sync.init({getDb:()=>({events:[]})});
 onRead=()=>h.context.sessionStorage.removeItem('FIELDREADY_SUPABASE_SESSION_V1');
 await assert.rejects(h.sync.syncNow(),/Account changed|Sign in again/);
 assert.equal(h.events.length,0);assert.equal(server.writes.length,0);
});
test('first authoritative pull preserves pending legacy work in a recovery snapshot',async()=>{
 const server=sharedServer(),h=harness(server.fetch),pending={events:[{id:'unsynced',participants:[]}]};
 h.storage.set('FIELDREADY_SYNC_META_V1',JSON.stringify({pending:1,dataEpoch:'old-epoch',userId:'test-user'}));
 await h.sync.syncNow(pending);
 assert.equal(h.storage.get('FIELDREADY_SYNC_RECOVERY_test-user'),JSON.stringify(pending));
 assert.equal(h.events.length,1);
});
