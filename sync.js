(() => {
'use strict';
const CFG=window.FIELDREADY_BACKEND||{enabled:false};
const META_KEY='FIELDREADY_SYNC_META_V1';
let getDb=null;
let busy=false;
let timer=null;

function configured(){return !!(CFG.enabled&&CFG.url&&CFG.anonKey&&!CFG.url.includes('FIELDREADY-BACKEND')&&!CFG.anonKey.includes('REPLACE_WITH'));}
function readMeta(){try{return JSON.parse(localStorage.getItem(META_KEY))||{pending:0,lastSyncAt:null,lastError:null};}catch{return {pending:0,lastSyncAt:null,lastError:null};}}
function writeMeta(m){localStorage.setItem(META_KEY,JSON.stringify(m));renderStatus();}
function sessionKey(){return CFG.auth?.sessionKey||'FIELDREADY_SUPABASE_SESSION_V1';}
function session(){try{return JSON.parse(sessionStorage.getItem(sessionKey()))||null;}catch{return null;}}
function setSession(s){if(s)sessionStorage.setItem(sessionKey(),JSON.stringify(s));else sessionStorage.removeItem(sessionKey());renderStatus();}
function status(){
 const m=readMeta();
 if(!configured())return {code:'local',label:'LOCAL ONLY',detail:'NUC backend is not enabled.'};
 if(!navigator.onLine)return {code:'offline',label:m.pending?'OFFLINE · '+m.pending:'OFFLINE',detail:'Changes remain local until connectivity returns.'};
 if(!session()?.access_token)return {code:'signin',label:'SIGN IN',detail:'Backend configured; sign in to synchronize.'};
 if(busy)return {code:'syncing',label:'SYNCING…',detail:'Synchronizing with the FieldReady NUC.'};
 if(m.lastError)return {code:'error',label:'SYNC ERROR',detail:m.lastError};
 if(m.pending)return {code:'pending',label:'PENDING · '+m.pending,detail:'Local changes are waiting to sync.'};
 if(m.lastSyncAt)return {code:'synced',label:'SYNCED · '+new Date(m.lastSyncAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),detail:'Local and server records reconciled.'};
 return {code:'ready',label:'READY TO SYNC',detail:'Authenticated; no successful sync recorded yet.'};
}
function renderStatus(){const el=document.getElementById('syncStatusBtn');if(!el)return;const s=status();el.textContent=s.label;el.className='syncPill '+s.code;el.title=s.detail;}

async function api(path,options={}){
 const s=session();
 const headers={'apikey':CFG.anonKey,'Content-Type':'application/json'};
 if(s?.access_token)headers.Authorization='Bearer '+s.access_token;
 Object.assign(headers,options.headers||{});
 const res=await fetch(CFG.url.replace(/\/$/,'')+path,{...options,headers});
 const txt=await res.text();let body=null;try{body=txt?JSON.parse(txt):null;}catch{body=txt;}
 if(!res.ok){const msg=typeof body==='string'?body:(body?.message||body?.error_description||body?.error||('HTTP '+res.status));const e=new Error(msg);e.status=res.status;throw e;}
 return body;
}

async function signIn(email,password){
 if(!configured())throw new Error('FieldReady backend is not configured.');
 const r=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
 if(!r?.access_token)throw new Error('No access token returned.');
 setSession({access_token:r.access_token,refresh_token:r.refresh_token,expires_at:r.expires_at,user:r.user?{id:r.user.id,email:r.user.email}:null});
 return session();
}
async function signOut(){try{if(session()?.access_token)await api('/auth/v1/logout',{method:'POST'});}catch{}setSession(null);}
async function ensureSession(){
 const s=session();if(!s?.access_token)return null;
 if(!s.expires_at||Date.now()/1000<Number(s.expires_at)-90)return s;
 if(!s.refresh_token){setSession(null);return null;}
 try{const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})});setSession({access_token:r.access_token,refresh_token:r.refresh_token||s.refresh_token,expires_at:r.expires_at,user:r.user?{id:r.user.id,email:r.user.email}:s.user});return session();}catch(e){setSession(null);throw e;}
}

function omit(o,keys){const x={};Object.entries(o||{}).forEach(([k,v])=>{if(!keys.includes(k))x[k]=v;});return x;}
function flatten(db){
 const events=[],participants=[],evaluations=[],voids=[];
 (db?.events||[]).forEach(e=>{
  events.push({id:e.id,event_date:e.date||null,timepoint:e.timepoint||null,study_arm:e.studyArm||null,majcom:e.majcom||null,home_installation_id:e.homeInstallationId||null,skill_id:e.skillId||null,deleted_at:e.deletedAt?new Date(e.deletedAt).toISOString():null,payload:omit(e,['participants'])});
  (e.participants||[]).forEach(p=>{
   participants.push({id:p.id,event_id:e.id,participant_code:String(p.participantId||'').trim().toUpperCase(),payload:omit(p,['evaluation','voids'])});
   if(p.evaluation){const v=p.evaluation;evaluations.push({id:v.id,participant_id:p.id,event_id:e.id,finalized_at:v.finalizedAt?new Date(v.finalizedAt).toISOString():null,final_result:v.finalResult||null,app_version:v.appVersion||null,evaluator_id:v.evaluatorId||null,payload:v});}
   (p.voids||[]).forEach(v=>{if(v?.id)voids.push({id:v.id,participant_id:p.id,event_id:e.id,voided_at:v.voidedAt?new Date(v.voidedAt).toISOString():new Date().toISOString(),reason:v.voidReason||'Administrative void',payload:v});});
  });
 });
 return {events,participants,evaluations,voids};
}
async function upsert(table,rows){if(!rows.length)return;await api('/rest/v1/'+table+'?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});}
async function getAll(table){return (await api('/rest/v1/'+table+'?select=*',{method:'GET'}))||[];}
async function push(db){const x=flatten(db);await upsert(CFG.tables.events,x.events);await upsert(CFG.tables.participants,x.participants);await upsert(CFG.tables.evaluations,x.evaluations);await upsert(CFG.tables.voids,x.voids);}
function rebuild(x,fallback){
 const eMap=new Map();x.events.forEach(r=>eMap.set(r.id,{...(r.payload||{}),id:r.id,participants:[]}));
 const pMap=new Map();x.participants.forEach(r=>{const e=eMap.get(r.event_id);if(!e)return;const p={...(r.payload||{}),id:r.id,participantId:(r.payload||{}).participantId||r.participant_code,voids:[],evaluation:null};e.participants.push(p);pMap.set(r.id,p);});
 x.evaluations.forEach(r=>{const p=pMap.get(r.participant_id);if(p)p.evaluation={...(r.payload||{}),id:r.id};});
 x.voids.forEach(r=>{const p=pMap.get(r.participant_id);if(p)p.voids.push({...(r.payload||{}),id:r.id});});
 return {schemaVersion:fallback?.schemaVersion||5,appVersion:fallback?.appVersion||window.FIELDREADY_BUILD?.versionName||'dev',events:[...eMap.values()]};
}
async function pull(fallback){const a=await Promise.all([getAll(CFG.tables.events),getAll(CFG.tables.participants),getAll(CFG.tables.evaluations),getAll(CFG.tables.voids)]);return rebuild({events:a[0],participants:a[1],evaluations:a[2],voids:a[3]},fallback);}
async function syncNow(dbArg){
 if(busy||!configured()||!navigator.onLine)return;
 await ensureSession();if(!session()?.access_token){renderStatus();return;}
 busy=true;renderStatus();
 try{const db=dbArg||getDb?.();if(!db)throw new Error('No local FieldReady database is available.');await push(db);const remote=await pull(db);const m=readMeta();m.pending=0;m.lastError=null;m.lastSyncAt=Date.now();writeMeta(m);window.dispatchEvent(new CustomEvent('fieldready:remote-db',{detail:{db:remote}}));}
 catch(e){const m=readMeta();m.lastError=e?.message||String(e);writeMeta(m);throw e;}
 finally{busy=false;renderStatus();}
}
function noteLocalChange(db){const m=readMeta();m.pending=(m.pending||0)+1;m.lastError=null;writeMeta(m);if(!configured()||!navigator.onLine||!session()?.access_token)return;clearTimeout(timer);timer=setTimeout(()=>syncNow(db).catch(()=>{}),CFG.autoSyncDelayMs||1500);}
function init(opts={}){getDb=opts.getDb||getDb;renderStatus();window.addEventListener('online',()=>{renderStatus();if(readMeta().pending&&session()?.access_token)syncNow().catch(()=>{});});window.addEventListener('offline',renderStatus);}
window.FieldReadySync=Object.freeze({init,configured,status,renderStatus,session,signIn,signOut,syncNow,noteLocalChange});
})();