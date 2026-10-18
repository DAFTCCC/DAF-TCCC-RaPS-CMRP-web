(() => {
'use strict';
const CFG=window.FIELDREADY_BACKEND||{enabled:false};
const META_KEY=window.FIELDREADY_ACCESS?.mode==='warning-only'?'FIELDREADY_LOCAL_TEST_META_V1':'FIELDREADY_SYNC_META_V1';
let getDb=null;
let busy=false;
let timer=null;
let changeGeneration=0;
let rerunAfterBusy=false;
let shouldDeferAutoSync=()=>false;
let activeDataEpoch=null;
let refreshPromise=null;
let activeSyncUser=null;

function configured(){return window.FIELDREADY_ACCESS?.mode!=='warning-only'&&!!(CFG.enabled&&CFG.url&&CFG.anonKey&&!CFG.url.includes('FIELDREADY-BACKEND')&&!CFG.anonKey.includes('REPLACE_WITH'));}
function cachedUserId(){return readMeta().userId||null;}
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
 if(m.pending&&shouldDeferAutoSync())return {code:'pending',label:'GRADING · LOCAL',detail:'Changes are saved locally. Server sync will resume after grading is finalized.'};
 if(m.pending)return {code:'pending',label:'PENDING · '+m.pending,detail:'Local changes are waiting to sync.'};
 if(m.lastSyncAt)return {code:'synced',label:'SYNCED · '+new Date(m.lastSyncAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),detail:'Local and server records reconciled.'};
 return {code:'ready',label:'READY TO SYNC',detail:'Authenticated; no successful sync recorded yet.'};
}
function renderStatus(){const el=document.getElementById('syncStatusBtn');if(!el)return;const s=status();el.textContent=s.label;el.className='syncPill '+s.code;el.title=s.detail;}

async function api(path,options={}){
 if(window.FIELDREADY_ACCESS?.mode==='warning-only')throw new Error('Server access is disabled during local testing.');
 let s=session();
 if(path.startsWith('/rest/v1/')||path.startsWith('/functions/v1/')||path==='/auth/v1/user'){
  await ensureSession();s=session();
  if(!s?.access_token)throw new Error('Sign in again before accessing server records.');
 }
 if(busy&&activeSyncUser&&(path.startsWith('/rest/v1/')||path.startsWith('/functions/v1/'))&&s?.user?.id!==activeSyncUser)throw new Error('Account changed during synchronization. Retry after it stops.');
 const requestUser=s?.user?.id;
 const headers={'apikey':CFG.anonKey,'Content-Type':'application/json'};
 if(s?.access_token)headers.Authorization='Bearer '+s.access_token;
 if(activeDataEpoch&&path.startsWith('/rest/v1/'))headers['x-fieldready-epoch']=activeDataEpoch;
 Object.assign(headers,options.headers||{});
 const res=await fetch(CFG.url.replace(/\/$/,'')+path,{...options,headers});
 if((path.startsWith('/rest/v1/')||path.startsWith('/functions/v1/'))&&session()?.user?.id!==requestUser)throw new Error('Account changed during the request.');
 const txt=await res.text();let body=null;try{body=txt?JSON.parse(txt):null;}catch{body=txt;}
 if(!res.ok){const msg=typeof body==='string'?body:(body?.message||body?.error_description||body?.error||('HTTP '+res.status));const e=new Error(msg);e.status=res.status;throw e;}
 return body;
}

async function signIn(identifier,password){
 if(!configured())throw new Error('FieldReady backend is not configured.');
 identifier=String(identifier||'').trim().toLowerCase();
 let r;
 if(identifier.includes('@')){
  // Keep existing accounts accessible while the NUC username migration rolls out.
  r=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:identifier,password})});
 }else{
  const res=await fetch(CFG.url.replace(/\/$/,'')+'/functions/v1/'+(CFG.functions?.login||'fieldready-login'),{
   method:'POST',headers:{apikey:CFG.anonKey,Authorization:'Bearer '+CFG.anonKey,'Content-Type':'application/json'},
   body:JSON.stringify({username:identifier,password})
  });
  try{r=await res.json();}catch{r=null;}
  if(!res.ok)throw new Error(r?.message||(res.status===404?'Username sign-in is not installed yet. Use your account email for now.':'Unable to sign in.'));
 }
 if(!r?.access_token)throw new Error('No access token returned.');
 setSession({access_token:r.access_token,refresh_token:r.refresh_token,expires_at:r.expires_at||((Date.now()/1000)+Number(r.expires_in||3600)),user:r.user?{id:r.user.id,email:r.user.email}:null});
 try{
  const profile=await requireAuthorizedProfile();
  return {...session(),profile};
 }catch(e){
  await signOut();
  throw e;
 }
}
async function signOut(){
 const old=session();
 clearTimeout(timer);rerunAfterBusy=false;activeDataEpoch=null;setSession(null);
 try{if(old?.access_token)await api('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+old.access_token}});}catch{}
}

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
 const rows=await api('/rest/v1/'+CFG.tables.profiles+'?user_id=eq.'+encodeURIComponent(s.user.id)+'&select=*',{method:'GET'});
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
  api('/rest/v1/'+CFG.tables.profiles+'?select=*&order=display_name.asc',{method:'GET'}),
  api('/rest/v1/'+CFG.tables.memberships+'?select=id,user_id,scope_type,scope_value,created_at',{method:'GET'}),
  api('/rest/v1/'+CFG.tables.accountRequests+'?select=id,user_id,email,display_name,requested_role,majcom,installation_id,status,decision_note,created_at,reviewed_at&order=created_at.desc',{method:'GET'})
 ]);
 return {profiles:profiles||[],memberships:memberships||[],requests:requests||[]};
}

async function rpc(name,args){
 return api('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args||{})});
}
async function dataEpoch(){return String(await rpc('fr_get_data_epoch',{}));}

async function approveAccountRequest(requestId,role,scopeType=null,scopeValue=null){
 return rpc('fr_approve_account_request',{p_request_id:requestId,p_role:role,p_scope_type:scopeType,p_scope_value:scopeValue});
}
async function denyAccountRequest(requestId,note=''){
 return rpc('fr_deny_account_request',{p_request_id:requestId,p_note:note||null});
}
async function setUserAccess(userId,active,role,scopeType=null,scopeValue=null){
 return rpc('fr_set_user_access',{p_user_id:userId,p_active:!!active,p_role:role,p_scope_type:scopeType,p_scope_value:scopeValue});
}
async function setUsername(userId,username){return rpc('fr_set_username',{p_user_id:userId,p_username:username});}
async function managerTeam(){return rpc('fr_manager_team',{});}
async function appointEvaluator(userId,majcom=null){return rpc('fr_appoint_evaluator',{p_evaluator_id:userId,p_majcom:majcom});}
async function removeAppointedEvaluator(userId,majcom=null){return rpc('fr_remove_appointed_evaluator',{p_evaluator_id:userId,p_majcom:majcom});}
async function assignProgramManager(userId,installationId,majcom){return rpc('fr_assign_program_manager',{p_user_id:userId,p_installation:installationId,p_majcom:majcom});}
async function eligibleEvaluators(majcom,installationId=null){return rpc('fr_eligible_evaluators',{p_majcom:majcom,p_installation:installationId});}
async function getEventEvaluators(eventId){return rpc('fr_get_event_evaluators',{p_event_id:eventId});}
async function setEventEvaluators(eventId,userIds){return rpc('fr_set_event_evaluators',{p_event_id:eventId,p_user_ids:userIds||[]});}
async function closeEvent(eventId,csv,fileName){return rpc('fr_close_event',{p_event_id:eventId,p_csv:csv,p_file_name:fileName});}
async function deleteEvent(eventId){return rpc('fr_delete_event',{p_event_id:eventId});}
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
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{
  try{
   const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})});
   if(session()?.user?.id!==s.user?.id)throw new Error('Account changed while refreshing the session.');
   setSession({access_token:r.access_token,refresh_token:r.refresh_token||s.refresh_token,expires_at:r.expires_at||((Date.now()/1000)+Number(r.expires_in||3600)),user:r.user?{id:r.user.id,email:r.user.email}:s.user});
   return session();
  }catch(e){if(session()?.user?.id===s.user?.id)setSession(null);throw e;}
  finally{refreshPromise=null;}
 })();
 return refreshPromise;
}

function omit(o,keys){const x={};Object.entries(o||{}).forEach(([k,v])=>{if(!keys.includes(k))x[k]=v;});return x;}
const SYNC_FIELDS=['_syncBaseline','_serverRevision'];
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
}
function fingerprint(value){return JSON.stringify(stable(value));}
function captureBaseline(db){
 (db?.events||[]).forEach(e=>{
  e._syncBaseline=fingerprint(omit(e,['participants','_syncOwnerId','_serverCreatedBy','_syncDirtyEvent','closedAt','closedBy','deletedAt',...SYNC_FIELDS]));
  (e.participants||[]).forEach(p=>{
   p._syncBaseline=fingerprint(omit(p,['evaluation','voids',...SYNC_FIELDS]));
   if(p.evaluation)p.evaluation._syncBaseline=fingerprint(omit(p.evaluation,SYNC_FIELDS));
  });
 });
 return db;
}
function writePlan(rows,serverRows,table){
 const server=new Map(serverRows.map(r=>[r.id,r]));
 const inserts=[],updates=[];
 for(const row of rows){
  const wire=omit(row,['_syncOwnerId','_serverCreatedBy','_syncDirtyEvent',...SYNC_FIELDS]);
  const remote=server.get(row.id);
  if(!remote){
   if(row._serverRevision!=null)throw new Error('Record is no longer accessible: '+table+'. Back up pending work and refresh.');
   inserts.push(wire);continue;
  }
  const localPayload=fingerprint(row.payload);
  if(row._syncBaseline===localPayload)continue;
  if(localPayload===fingerprint(remote.payload))continue;
  if(!row._syncBaseline||row._serverRevision==null||String(row._serverRevision)!==String(remote.server_revision)||remote.finalized_at){
   throw new Error('Sync conflict in '+table+' ('+row.id+'). Another device changed this record. Back up local work before reloading; no automatic overwrite was performed.');
  }
  updates.push({wire,revision:row._serverRevision});
 }
 return {table,inserts,updates};
}
async function applyPlan(plan){
 await insertRows(plan.table,plan.inserts);
 for(const {wire,revision} of plan.updates){
  const rows=await api('/rest/v1/'+plan.table+'?id=eq.'+encodeURIComponent(wire.id)+'&server_revision=eq.'+encodeURIComponent(revision),{
   method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(omit(wire,['id']))
  });
  if(!Array.isArray(rows)||rows.length!==1)throw new Error('Sync conflict in '+plan.table+'. The record changed during synchronization. Back up local work before reloading.');
 }
}

function flatten(db){
 const events=[],participants=[],evaluations=[],voids=[];
 (db?.events||[]).forEach(e=>{
  events.push({id:e.id,event_date:e.date||null,timepoint:e.timepoint||null,study_arm:e.studyArm||null,majcom:e.majcom||null,home_installation_id:e.homeInstallationId||null,skill_id:e.skillId||null,closed_at:e.closedAt?new Date(e.closedAt).toISOString():null,closed_by:e.closedBy||null,deleted_at:e.deletedAt?new Date(e.deletedAt).toISOString():null,payload:omit(e,['participants','_syncOwnerId','_serverCreatedBy','_syncDirtyEvent','closedAt','closedBy','deletedAt',...SYNC_FIELDS]),_syncBaseline:e._syncBaseline,_serverRevision:e._serverRevision,_syncOwnerId:e._syncOwnerId||null,_serverCreatedBy:e._serverCreatedBy||null,_syncDirtyEvent:!!e._syncDirtyEvent});
  (e.participants||[]).forEach(p=>{
   participants.push({id:p.id,event_id:e.id,participant_code:String(p.participantId||'').trim().toUpperCase(),payload:omit(p,['evaluation','voids',...SYNC_FIELDS]),_syncBaseline:p._syncBaseline,_serverRevision:p._serverRevision});
   if(p.evaluation){const v=p.evaluation;evaluations.push({id:v.id,participant_id:p.id,event_id:e.id,finalized_at:v.finalizedAt?new Date(v.finalizedAt).toISOString():null,final_result:v.finalResult||null,app_version:v.appVersion||null,evaluator_id:v.evaluatorId||null,payload:omit(v,SYNC_FIELDS),_syncBaseline:v._syncBaseline,_serverRevision:v._serverRevision});}
   (p.voids||[]).forEach(v=>{if(v?.id)voids.push({id:v.id,participant_id:p.id,event_id:e.id,voided_at:v.voidedAt?new Date(v.voidedAt).toISOString():new Date().toISOString(),reason:v.voidReason||'Administrative void',payload:v});});
  });
 });
 return {events,participants,evaluations,voids};
}
async function insertRows(table,rows){if(!rows.length)return;await api('/rest/v1/'+table,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});}
async function getAll(table){
 // PostgREST caps each response. Advance by the last primary key, rather
 // than assuming a short page means the table is complete.
 const rows=[];
 let lastId=null;
 while(true){
  const cursor=lastId===null?'':'&id=gt.'+encodeURIComponent(lastId);
  const page=await api('/rest/v1/'+table+'?select=*&order=id.asc&limit=1000'+cursor,{method:'GET'});
  if(!Array.isArray(page))throw new Error('Invalid table response for '+table);
  if(!page.length)return rows;
  const nextId=page[page.length-1]?.id;
  if(!nextId||nextId===lastId)throw new Error('Pagination did not advance for '+table);
  rows.push(...page);
  lastId=nextId;
 }
}
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

 const closedEventIds=new Set((serverEvents||[]).filter(r=>r.closed_at).map(r=>r.id));
 const inOpenEvent=r=>!closedEventIds.has(r.event_id||r.id);
 x={
  events:x.events.filter(inOpenEvent),
  participants:x.participants.filter(inOpenEvent),
  evaluations:x.evaluations.filter(inOpenEvent),
  voids:x.voids.filter(inOpenEvent)
 };
 const serverParticipants=await getAll(CFG.tables.participants);
 // Validate every changed row before writing any table. Unchanged snapshots
 // never overwrite records updated on another device.
 const plans=[
  writePlan(x.events,serverEvents,CFG.tables.events),
  writePlan(x.participants,serverParticipants,CFG.tables.participants),
  writePlan(x.evaluations,serverEvaluations,CFG.tables.evaluations)
 ];
 for(const plan of plans)await applyPlan(plan);
 // fr_voids is append-only audit history. Do not use any ON CONFLICT path:
 // PostgreSQL may still evaluate conflict visibility through RLS. Read the
 // existing IDs first and plain-INSERT only genuinely new void records.
 const serverVoids=await getAll(CFG.tables.voids);
 const existingVoidIds=new Set(serverVoids.map(r=>r.id));
 const newVoids=x.voids.filter(r=>!existingVoidIds.has(r.id));
 await insertRows(CFG.tables.voids,newVoids);
}
function rebuild(x,fallback){
 const eMap=new Map();x.events.forEach(r=>eMap.set(r.id,{...(r.payload||{}),id:r.id,closedAt:r.closed_at?Date.parse(r.closed_at):null,closedBy:r.closed_by||null,deletedAt:r.deleted_at?Date.parse(r.deleted_at):null,_serverCreatedBy:r.created_by||null,_serverRevision:r.server_revision,_syncDirtyEvent:false,participants:[]}));
 const pMap=new Map();x.participants.forEach(r=>{const e=eMap.get(r.event_id);if(!e)return;const p={...(r.payload||{}),id:r.id,participantId:(r.payload||{}).participantId||r.participant_code,voids:[],evaluation:null,_serverRevision:r.server_revision};e.participants.push(p);pMap.set(r.id,p);});
 const voidedIds=new Set(x.voids.map(r=>r.id));
 x.evaluations.forEach(r=>{
  if(voidedIds.has(r.id))return;
  const p=pMap.get(r.participant_id);if(!p)return;
  if(p.evaluation)throw new Error('Multiple active evaluations for participant '+p.participantId+'. Controlled record review is required; no attempt was selected automatically.');
  p.evaluation={...(r.payload||{}),id:r.id,_serverRevision:r.server_revision};
 });
 x.voids.forEach(r=>{const p=pMap.get(r.participant_id);if(p)p.voids.push({...(r.payload||{}),id:r.id});});
 return {schemaVersion:fallback?.schemaVersion||5,appVersion:fallback?.appVersion||window.FIELDREADY_BUILD?.versionName||'dev',events:[...eMap.values()]};
}
async function pull(fallback){const a=await Promise.all([getAll(CFG.tables.events),getAll(CFG.tables.participants),getAll(CFG.tables.evaluations),getAll(CFG.tables.voids)]);return captureBaseline(rebuild({events:a[0],participants:a[1],evaluations:a[2],voids:a[3]},fallback));}
async function syncNow(dbArg,opts={}){
 if(!opts.force&&shouldDeferAutoSync()){if(opts.requireFresh)throw new Error('Finish grading before refreshing an export. Use Backup to save pending local work.');renderStatus();return;}
 if(busy){if(opts.requireFresh)throw new Error('Synchronization is already in progress. Retry the export when it finishes.');rerunAfterBusy=true;return;}
 if(!configured()||!navigator.onLine){if(opts.requireFresh)throw new Error('Connect to the study server before exporting synchronized data. Use Backup for an offline copy.');return;}

 const source=dbArg||getDb?.();
 if(!source)throw new Error('No local FieldReady database is available.');

 await ensureSession();
 if(busy){if(opts.requireFresh)throw new Error('Synchronization is already in progress. Retry the export.');rerunAfterBusy=true;return;}
 if(!session()?.access_token){if(opts.requireFresh)throw new Error('Sign in before exporting synchronized data.');renderStatus();return;}
 if(!opts.force&&shouldDeferAutoSync()){if(opts.requireFresh)throw new Error('Finish grading before refreshing an export. Use Backup to save pending local work.');renderStatus();return;}

 busy=true;activeSyncUser=session()?.user?.id;renderStatus();
 const startedGeneration=changeGeneration;
 try{
  // Server generation is authoritative. A client that predates a reset must
  // pull the current server state before it is ever allowed to push.
  const syncUserId=session()?.user?.id;
  const profile=await requireAuthorizedProfile();
  if(!['evaluator','program_manager','majcom_manager','enterprise'].includes(profile.role))throw new Error('Unsupported FieldReady role.');
  const serverEpoch=await dataEpoch();
  activeDataEpoch=serverEpoch;
  const metaBefore=readMeta();
  if(metaBefore.dataEpoch!==serverEpoch||metaBefore.userId!==syncUserId){
   const remote=await pull(source);
   if(session()?.user?.id!==syncUserId)throw new Error('Account changed during synchronization.');
   const completedEpoch=await dataEpoch();
   if(completedEpoch!==serverEpoch)throw new Error('Server data changed during synchronization. Retry.');
   if(session()?.user?.id!==syncUserId)throw new Error('Account changed during synchronization.');
   if(shouldDeferAutoSync()){
    if(opts.requireFresh)throw new Error('Grading started during synchronization. Retry the export after grading.');
    return;
   }
   if(metaBefore.pending||changeGeneration!==startedGeneration){
    const owner=metaBefore.userId||syncUserId;
    localStorage.setItem('FIELDREADY_SYNC_RECOVERY_'+owner,JSON.stringify(source));
   }
   const m=readMeta();
   m.pending=0;
   m.lastError=null;
   m.lastSyncAt=Date.now();
   m.dataEpoch=serverEpoch;
   m.userId=syncUserId;
   writeMeta(m);
   window.dispatchEvent(new CustomEvent('fieldready:remote-db',{detail:{db:remote,epochReset:true}}));
   return;
  }

  // Snapshot only after the epoch gate passes. Later local edits cannot leak
  // into an in-flight sync.
  const db=typeof structuredClone==='function'
   ?structuredClone(source)
   :JSON.parse(JSON.stringify(source));

  const membership=(profile?.role==='program_manager'||profile?.role==='majcom_manager')?await currentMembership():null;
  if(!opts.force&&shouldDeferAutoSync())return;
  const [serverEvaluations,serverEvents]=await Promise.all([
   getAll(CFG.tables.evaluations),
   getAll(CFG.tables.events)
  ]);
  if(!opts.force&&shouldDeferAutoSync())return;
  await push(db,serverEvaluations,serverEvents,profile,membership);
  if(!opts.force&&shouldDeferAutoSync())return;
  const remote=await pull(db);

  const completedEpoch=await dataEpoch();
  if(completedEpoch!==serverEpoch)throw new Error('Server data changed during synchronization. Retry to load the current records.');

  // A local edit occurred while this sync was in flight. Do not let the
  // older server snapshot overwrite that newer local change. Run again
  // after the current sync finishes using the latest local database.
  if(session()?.user?.id!==syncUserId)throw new Error('Account changed during synchronization.');
  if(changeGeneration!==startedGeneration){
   if(opts.requireFresh)throw new Error('Local data changed during synchronization. Retry the export.');
   rerunAfterBusy=true;
   return;
  }

  const m=readMeta();
  m.pending=0;
  m.lastError=null;
  m.lastSyncAt=Date.now();
  m.dataEpoch=completedEpoch;
  m.userId=syncUserId;
  writeMeta(m);
  window.dispatchEvent(new CustomEvent('fieldready:remote-db',{detail:{db:remote}}));
 }
 catch(e){const m=readMeta();m.lastError=e?.message||String(e);writeMeta(m);throw e;}
 finally{
  busy=false;activeSyncUser=null;
  renderStatus();
  if(rerunAfterBusy){
   rerunAfterBusy=false;
   clearTimeout(timer);
   if(!shouldDeferAutoSync())timer=setTimeout(()=>syncNow().catch(()=>{}),100);
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
 if(shouldDeferAutoSync()){clearTimeout(timer);renderStatus();return;}
 if(busy){rerunAfterBusy=true;return;}
 clearTimeout(timer);
 timer=setTimeout(()=>syncNow().catch(()=>{}),CFG.autoSyncDelayMs||1500);
}
function pauseAutoSync(){
 changeGeneration++;
 rerunAfterBusy=false;
 clearTimeout(timer);
 timer=null;
 renderStatus();
}
function resumeAutoSync(){
 if(shouldDeferAutoSync())return;
 const m=readMeta();
 if(!m.pending||!configured()||!navigator.onLine||!session()?.access_token||busy)return;
 clearTimeout(timer);
 timer=setTimeout(()=>syncNow().catch(()=>{}),100);
}
function init(opts={}){
 getDb=opts.getDb||getDb;
 shouldDeferAutoSync=typeof opts.shouldDeferAutoSync==='function'?opts.shouldDeferAutoSync:(()=>false);
 renderStatus();
 window.addEventListener('online',()=>{renderStatus();if(readMeta().pending&&session()?.access_token&&!shouldDeferAutoSync())syncNow().catch(()=>{});});
 window.addEventListener('offline',renderStatus);
 const refresh=()=>{if(configured()&&navigator.onLine&&session()?.access_token&&!busy&&!shouldDeferAutoSync())syncNow().catch(()=>{});};
 window.addEventListener('focus',refresh);
 if(typeof setInterval==='function')setInterval(refresh,30000);
}
window.FieldReadySync=Object.freeze({
 cachedUserId,captureBaseline,init,configured,status,renderStatus,session,signIn,signOut,acceptAuthCallback,updatePassword,requestAccount,
 currentProfile,currentMembership,currentAccountRequest,requireAuthorizedProfile,listAccountAdministration,dataEpoch,
 approveAccountRequest,denyAccountRequest,setUserAccess,setUsername,managerTeam,appointEvaluator,removeAppointedEvaluator,assignProgramManager,eligibleEvaluators,getEventEvaluators,setEventEvaluators,closeEvent,deleteEvent,inviteUser,
 syncNow,noteLocalChange,pauseAutoSync,resumeAutoSync
});
})();
