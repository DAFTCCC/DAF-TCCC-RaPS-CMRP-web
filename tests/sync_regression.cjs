'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(fetch){
 const storage=new Map();
 const events=[];
 const session={access_token:'test-token',user:{id:'test-user'}};
 const context={
  window:{FIELDREADY_BACKEND:{enabled:true,url:'https://example.invalid',anonKey:'public',tables:{events:'events',participants:'participants',evaluations:'evaluations',voids:'voids',profiles:'profiles'}} ,addEventListener:()=>{},dispatchEvent:e=>events.push(e)},
  document:{getElementById:()=>null},navigator:{onLine:true},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  sessionStorage:{getItem:()=>JSON.stringify(session)},
  fetch,URLSearchParams,structuredClone,Date,console,
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  setTimeout:()=>0,clearTimeout:()=>{}
 };
 // Expose internals only in this isolated test context; production API stays private.
 const source=fs.readFileSync(require.resolve('../sync.js'),'utf8').replace('window.FieldReadySync=Object.freeze({','window.testHooks={getAll};\nwindow.FieldReadySync=Object.freeze({');
 vm.runInNewContext(source,context);
 return {context,storage,events,sync:context.window.FieldReadySync,getAll:context.window.testHooks.getAll};
}
const response=body=>({ok:true,text:async()=>JSON.stringify(body)});

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
  h.storage.set('FIELDREADY_SYNC_META_V1',JSON.stringify({pending:1,dataEpoch:'epoch'}));
  h.sync.init({getDb:()=>({events:[]})});
  if(changed==='server reset')await assert.rejects(h.sync.syncNow(),/Server data changed/);
  else await h.sync.syncNow();
  assert.equal(h.events.length,0);
  assert.ok(JSON.parse(h.storage.get('FIELDREADY_SYNC_META_V1')).pending>0);
 });
}
