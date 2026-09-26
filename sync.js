(() => {
'use strict';
const CFG=window.FIELDREADY_BACKEND||{enabled:false};
const META_KEY='FIELDREADY_SYNC_META_V1';
let getDb=null;
let busy=false;
let timer=null;
let changeGeneration=0;
let rerunAfterBusy=false;

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
 try{
  const profile=await requireAuthorizedProfile();
  return {...session(),profile};
 }catch(e){
  await signOut();
  throw e;
 }
}
async function signOut(){try{if(session()?.access_token)await api('/auth/v1/logout',{method:'POST'});}catch{}setSession(null);}

async function acceptAuthCallback(){
 const raw=location.hash.startsWith('#')?location.hash.slice(1):'';
 const q=new URLSearchParams(raw);
 const type=q.get('type');
 const access_token=q.get('access_token');
 const refresh_token=q.get('refresh_token');
 if(!access_token||!['invite','recovery','signup'].includes(type||''))return null;
 setSession({
  access_token,
  refresh_token:refresh_token||null,
  expires_at:q.get('expires_at')||((Date.now()/1000)+Number(q.get('expires_in')||3600)),
  user:null
 });
 const user=await api('/auth/v1/user',{method:'GET'});
 const current=session();
 setSession({...current,user:user?{id:user.id,email:user.email}:null});
 history.replaceState(null,document.title,location.pathname+location.search);
 return {type,user};
}
async function updatePassword(password){
 if(!session()?.access_token)throw new Error('Invitation session is missing or expired.');
 return api('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:String(password||'')})});
}

async function requestAccount({email,password,displayName,majcom,installationId}){
 if(!configured())throw new Error('FieldReady backend is not configured.');
 const r=await api('/auth/v1/signup',{
  method:'POST',
  body:JSON.stringify({
   email:String(email||'').trim().toLowerCase(),
   password:String(password||''),
   data:{
    display_name:String(displayName||'').trim(),
    majcom:String(majcom||'').trim(),
    installation_id:String(installationId||'').trim()
   }
  })
 });
 return r;
}

async function currentProfile(){
 const s=session();if(!s?.user?.id)return null;
 const rows=await api('/rest/v1/'+CFG.tables.profiles+'?user_id=eq.'+encodeURIComponent(s.user.id)+'&select=user_id,email,display_name,active,role',{method:'GET'});
 return rows?.[0]||null;
}
async function currentMembership(){
 const s=session();if(!s?.user?.id)return null;
 const rows=await api('/rest/v1/'+CFG.tables.memberships+'?user_id=eq.'+encodeURIComponent(s.user.id)+'&select=id,user_id,scope_type,scope_value,created_at',{method:'GET'});
 return rows?.[0]||null;
}

async function currentAccountRequest(){
 const s=session();if(!s?.user?.id)return null;
 const rows=await api('/rest/v1/'+CFG.tables.accountRequests+'?user_id=eq.'+encodeURIComponent(s.user.id)+'&select=id,user_id,email,display_name,requested_role,majcom,installation_id,status,decision_note,created_at,reviewed_at',{method:'GET'});
 return rows?.[0]||null;
}

async function requireAuthorizedProfile(){
 const p=await currentProfile();
 if(p?.active)return p;
 let req=null;
 try{req=await currentAccountRequest();}catch{}
 if(req?.status==='pending')throw new Error('Your FieldReady account request is pending administrator approval.');
 if(req?.status==='denied')throw new Error('Your FieldReady account request was denied. Contact the FieldReady administrator.');
 throw new Error('This account is not authorized for FieldReady.');
}

async function listAccountAdministration(){
 const p=await currentProfile();
 if(!p?.active||p.role!=='enterprise')throw new Error('Enterprise access required.');
 const [profiles,memberships,requests]=await Promise.all([
  api('/rest/v1/'+CFG.tables.profiles+'?select=user_id,email,display_name,active,role,created_at,updated_at&order=display_name.asc',{method:'GET'}),
  api('/rest/v1/'+CFG.tables.memberships+'?select=id,user_id,scope_type,scope_value,created_at',{method:'GET'}),
  api('/rest/v1/'+CFG.tables.accountRequests+'?select=id,user_id,email,display_name,requested_role,majcom,installation_id,status,decision_note,created_at,reviewed_at&order=created_at.desc',{method:'GET'})
 ]);
 return {profiles:profiles||[],memberships:memberships||[],requests:requests||[]};
}

async function rpc(name,args){
 return api('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args||{})});
}

async function approveAccountRequest(requestId,role,scopeType=null,scopeValue=null){
 return rpc('fr_approve_account_request',{p_request_id:requestId,p_role:role,p_scope_type:scopeType,p_scope_value:scopeValue});
}
async function denyAccountRequest(requestId,note=''){
 return rpc('fr_deny_account_request',{p_request_id:requestId,p_note:note||null});
}
async function setUserAccess(userId,active,role,scopeType=null,scopeValue=null){
 return rpc('fr_set_user_access',{p_user_id:userId,p_active:!!active,p_role:role,p_scope_type:scopeType,p_scope_value:scopeValue});
}
async function inviteUser({email,displayName,role,scopeType=null,scopeValue=null}){
 const fn=CFG.functions?.accountAdmin;
 if(!fn)throw new Error('FieldReady account invitation function is not configured.');
 return api('/functions/v1/'+fn,{
  method:'POST',
  body:JSON.stringify({action:'invite',email,displayName,role,scopeType,scopeValue})
 });
}

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
  events.push({id:e.id,event_date:e.date||null,timepoint:e.timepoint||null,study_arm:e.studyArm||null,majcom:e.majcom||null,home_installation_id:e.homeInstallationId||null,skill_id:e.skillId||null,deleted_at:e.deletedAt?new Date(e.deletedAt).toISOString():null,payload:omit(e,['participants','_syncOwnerId','_serverCreatedBy','_syncDirtyEvent']),_syncOwnerId:e._syncOwnerId||null,_serverCreatedBy:e._serverCreatedBy||null,_syncDirtyEvent:!!e._syncDirtyEvent});
  (e.participants||[]).forEach(p=>{
   participants.push({id:p.id,event_id:e.id,participant_code:String(p.participantId||'').trim().toUpperCase(),payload:omit(p,['evaluation','voids'])});
   if(p.evaluation){const v=p.evaluation;evaluations.push({id:v.id,participant_id:p.id,event_id:e.id,finalized_at:v.finalizedAt?new Date(v.finalizedAt).toISOString():null,final_result:v.finalResult||null,app_version:v.appVersion||null,evaluator_id:v.evaluatorId||null,payload:v});}
   (p.voids||[]).forEach(v=>{if(v?.id)voids.push({id:v.id,participant_id:p.id,event_id:e.id,voided_at:v.voidedAt?new Date(v.voidedAt).toISOString():new Date().toISOString(),reason:v.voidReason||'Administrative void',payload:v});});
  });
 });
 return {events,participants,evaluations,voids};
}
async function insertRows(table,rows){if(!rows.length)return;await api('/rest/v1/'+table,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});}
async function patchRowsById(table,rows){
 for(const row of rows){
  const id=row.id;
  const body=omit(row,['id']);
  await api('/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
 }
}
async function upsert(table,rows){if(!rows.length)return;await api('/rest/v1/'+table+'?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});}
async function getAll(table){return (await api('/rest/v1/'+table+'?select=*',{method:'GET'}))||[];}
function evaluatorPushScope(db,x,serverEvents,userId){
 const serverIds=new Set((serverEvents||[]).map(e=>e.id));
 const accessibleIds=new Set(
  x.events
   .filter(r=>serverIds.has(r.id))
   .map(r=>r.id)
 );
 const inAccessibleEvent=r=>accessibleIds.has(r.event_id||r.id);

 // Evaluators are assignment-scoped. They may grade/update participant-level
 // data for assigned events returned by RLS, but never create or edit event
 // metadata themselves.
 return {
  events:[],
  participants:x.participants.filter(inAccessibleEvent),
  evaluations:x.evaluations.filter(inAccessibleEvent),
  voids:x.voids.filter(inAccessibleEvent)
 };
}
function managerPushScope(x,profile,membership,serverEvents,userId){
 const role=profile?.role;
 const expectedType=role==='program_manager'?'installation':role==='majcom_manager'?'majcom':null;
 const scopeValue=(expectedType&&membership?.scope_type===expectedType)?String(membership.scope_value||''):'';
 if(!scopeValue)return {events:[],participants:[],evaluations:[],voids:[]};

 const serverIds=new Set((serverEvents||[]).map(e=>e.id));
 const allowedIds=new Set(
  x.events
   .filter(r=>expectedType==='installation'?r.home_installation_id===scopeValue:r.majcom===scopeValue)
   .map(r=>r.id)
 );
 const writableEventIds=new Set(
  x.events
   .filter(r=>allowedIds.has(r.id))
   .filter(r=>{
    const isNew=!serverIds.has(r.id);
    const locallyOwned=!!userId&&r._syncOwnerId===userId;
    return isNew||locallyOwned||r._syncDirtyEvent;
   })
   .map(r=>r.id)
 );
 const inAllowedEvent=r=>allowedIds.has(r.event_id||r.id);
 return {
  events:x.events.filter(r=>writableEventIds.has(r.id)),
  participants:x.participants.filter(inAllowedEvent),
  evaluations:x.evaluations.filter(inAllowedEvent),
  voids:x.voids.filter(inAllowedEvent)
 };
}
async function push(db,serverEvaluations=[],serverEvents=[],profile=null,membership=null){
 let x=flatten(db);
 const userId=session()?.user?.id||null;

 // Scoped accounts may have stale local events from a previous role/account.
 // Filter before every push so the client never attempts to write outside the
 // scope currently granted by FieldReady account governance.
 if(profile?.role==='evaluator')x=evaluatorPushScope(db,x,serverEvents,userId);
 else if(profile?.role==='program_manager'||profile?.role==='majcom_manager')x=managerPushScope(x,profile,membership,serverEvents,userId);

 const locked=new Set((serverEvaluations||[]).filter(r=>r.finalized_at).map(r=>r.id));
 const writableEvaluations=x.evaluations.filter(r=>!locked.has(r.id));
 const serverEventIds=new Set((serverEvents||[]).map(r=>r.id));
 const eventWireRows=x.events.map(r=>({
  raw:r,
  wire:omit(r,['_syncOwnerId','_serverCreatedBy','_syncDirtyEvent'])
 }));
 const newEvents=eventWireRows.filter(x=>!serverEventIds.has(x.raw.id)).map(x=>x.wire);
 const changedEvents=eventWireRows.filter(x=>serverEventIds.has(x.raw.id)&&x.raw._syncDirtyEvent).map(x=>x.wire);

 // fr_events intentionally avoids INSERT .. ON CONFLICT DO UPDATE.
 // PostgreSQL RLS evaluates that conflict-write path differently from a plain
 // INSERT and rejects otherwise-valid scoped-manager creations. New events use
 // a normal INSERT; existing explicitly edited events use PATCH by primary key.
 await insertRows(CFG.tables.events,newEvents);
 await patchRowsById(CFG.tables.events,changedEvents);
 await upsert(CFG.tables.participants,x.participants);
 await upsert(CFG.tables.evaluations,writableEvaluations);
 await upsert(CFG.tables.voids,x.voids);
}
function rebuild(x,fallback){
 const eMap=new Map();x.events.forEach(r=>eMap.set(r.id,{...(r.payload||{}),id:r.id,_serverCreatedBy:r.created_by||null,_syncDirtyEvent:false,participants:[]}));
 const pMap=new Map();x.participants.forEach(r=>{const e=eMap.get(r.event_id);if(!e)return;const p={...(r.payload||{}),id:r.id,participantId:(r.payload||{}).participantId||r.participant_code,voids:[],evaluation:null};e.participants.push(p);pMap.set(r.id,p);});
 x.evaluations.forEach(r=>{const p=pMap.get(r.participant_id);if(p)p.evaluation={...(r.payload||{}),id:r.id};});
 x.voids.forEach(r=>{const p=pMap.get(r.participant_id);if(p)p.voids.push({...(r.payload||{}),id:r.id});});
 return {schemaVersion:fallback?.schemaVersion||5,appVersion:fallback?.appVersion||window.FIELDREADY_BUILD?.versionName||'dev',events:[...eMap.values()]};
}
async function pull(fallback){const a=await Promise.all([getAll(CFG.tables.events),getAll(CFG.tables.participants),getAll(CFG.tables.evaluations),getAll(CFG.tables.voids)]);return rebuild({events:a[0],participants:a[1],evaluations:a[2],voids:a[3]},fallback);}
async function syncNow(dbArg){
 if(busy){rerunAfterBusy=true;return;}
 if(!configured()||!navigator.onLine)return;
 await ensureSession();if(!session()?.access_token){renderStatus();return;}
 busy=true;renderStatus();
 const startedGeneration=changeGeneration;
 try{
  const db=dbArg||getDb?.();
  if(!db)throw new Error('No local FieldReady database is available.');
  const profile=await currentProfile();
  const membership=(profile?.role==='program_manager'||profile?.role==='majcom_manager')?await currentMembership():null;
  const [serverEvaluations,serverEvents]=await Promise.all([
   getAll(CFG.tables.evaluations),
   getAll(CFG.tables.events)
  ]);
  await push(db,serverEvaluations,serverEvents,profile,membership);
  const remote=await pull(db);

  // A local edit occurred while this sync was in flight. Do not let the
  // older server snapshot overwrite that newer local change. Run again
  // after the current sync finishes using the latest local database.
  if(changeGeneration!==startedGeneration){
   rerunAfterBusy=true;
   return;
  }

  const m=readMeta();
  m.pending=0;
  m.lastError=null;
  m.lastSyncAt=Date.now();
  writeMeta(m);
  window.dispatchEvent(new CustomEvent('fieldready:remote-db',{detail:{db:remote}}));
 }
 catch(e){const m=readMeta();m.lastError=e?.message||String(e);writeMeta(m);throw e;}
 finally{
  busy=false;
  renderStatus();
  if(rerunAfterBusy){
   rerunAfterBusy=false;
   clearTimeout(timer);
   timer=setTimeout(()=>syncNow().catch(()=>{}),100);
  }
 }
}
function noteLocalChange(){
 changeGeneration++;
 const m=readMeta();
 m.pending=(m.pending||0)+1;
 m.lastError=null;
 writeMeta(m);
 if(!configured()||!navigator.onLine||!session()?.access_token)return;
 if(busy){rerunAfterBusy=true;return;}
 clearTimeout(timer);
 timer=setTimeout(()=>syncNow().catch(()=>{}),CFG.autoSyncDelayMs||1500);
}
function init(opts={}){getDb=opts.getDb||getDb;renderStatus();window.addEventListener('online',()=>{renderStatus();if(readMeta().pending&&session()?.access_token)syncNow().catch(()=>{});});window.addEventListener('offline',renderStatus);}
window.FieldReadySync=Object.freeze({
 init,configured,status,renderStatus,session,signIn,signOut,acceptAuthCallback,updatePassword,requestAccount,
 currentProfile,currentMembership,currentAccountRequest,requireAuthorizedProfile,listAccountAdministration,
 approveAccountRequest,denyAccountRequest,setUserAccess,inviteUser,
 syncNow,noteLocalChange
});
})();