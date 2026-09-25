(() => {
'use strict';
const $ = id => document.getElementById(id);
const SKILLS = window.FIELDREADY_SKILLS || {};
const LOC = window.FIELDREADY_LOCATION_DATA || {commands:[],installations:[]};
const BUILD = window.FIELDREADY_BUILD || {versionName:'dev'};
const SYNC = window.FieldReadySync || null;
const DB_KEY='FIELDREADY_LONGITUDINAL_STUDY_V4'; // retained for v4.0 local-data continuity
const uuid=()=>crypto.randomUUID?crypto.randomUUID():`id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>Date.now();
const pct=v=>v==null?'—':`${Math.round(v*100)}%`;
const fmtMs=ms=>{const s=Math.max(0,Math.floor((ms||0)/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
const isoDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const deep=x=>JSON.parse(JSON.stringify(x));

const FAILURE_MODES=[
 {id:'not-performed-incomplete',label:'Not performed / incomplete',desc:'Required action was omitted, never initiated, or only partly completed.'},
 {id:'incorrect-technique',label:'Incorrect technique',desc:'Action was attempted, but method, placement, equipment use, or technique did not meet the criterion.'},
 {id:'timing-sequence',label:'Timing / sequence',desc:'Action was delayed, out of clinically required order, or exceeded an explicit time standard.'},
 {id:'unsafe-action',label:'Unsafe action',desc:'Action created unacceptable patient, provider, or mission risk or violated a safety-critical requirement.'},
 {id:'other-unclear',label:'Other / unclear',desc:'Failure does not fit the four categories above. Objective comment is required.'}
];
const CONTRIBUTORS=[
 {id:'knowledge-cue',label:'Knowledge / cue recognition',desc:'Required knowledge was absent/incorrect, or the clinical/tactical cue was not recognized.'},
 {id:'judgment-prioritization',label:'Judgment / prioritization',desc:'Relevant information was recognized, but the wrong intervention, priority, or sequence was selected.'},
 {id:'psychomotor',label:'Psychomotor execution',desc:'Participant appeared to know what to do but could not physically perform the skill to standard.'},
 {id:'communication-teamwork',label:'Communication / teamwork',desc:'Communication, delegation, coordination, role clarity, or closed-loop teamwork primarily contributed.'},
 {id:'system-context',label:'System / performance context',desc:'Equipment/resources, workload/stress, scenario conditions, or environment materially contributed.'}
];

let db=loadDb();
let currentEventId=null,currentParticipantId=null,currentSection=0,currentRecordKey='',currentRecordSkill='',recordCriterionFilter='all';
let filters={majcom:'',base:'',skill:'',arm:'',timepoint:''};
let ticker=null;
let currentAccessProfile=null;

function scopeOptions(role,majcom='',installationId=''){
 if(role==='majcom_manager'){
  return `<label class="full"><span>MAJCOM scope</span><select name="scopeValue" required><option value="">Select MAJCOM</option>${LOC.commands.map(c=>`<option value="${esc(c.id)}" ${c.id===majcom?'selected':''}>${esc(c.name)}</option>`).join('')}</select><input type="hidden" name="scopeType" value="majcom"></label>`;
 }
 if(role==='program_manager'){
  return `<label class="full"><span>Installation scope</span><select name="scopeValue" required><option value="">Select installation</option>${LOC.installations.slice().sort((x,y)=>x.name.localeCompare(y.name)).map(i=>`<option value="${esc(i.id)}" ${i.id===installationId?'selected':''}>${esc(installationLabel(i))}</option>`).join('')}</select><input type="hidden" name="scopeType" value="installation"></label>`;
 }
 return '';
}
function setAccountUi(profile){
 currentAccessProfile=profile||null;
 const admin=$('adminBtn');
 if(admin)admin.classList.toggle('hidden',profile?.role!=='enterprise');
}

function defaultDb(){return {schemaVersion:5,appVersion:BUILD.versionName,events:[]};}
function normalizeDb(x){
 if(!x||!Array.isArray(x.events)) return null;
 x.schemaVersion=5;x.appVersion=BUILD.versionName;
 x.events.forEach(e=>{
  e.participants=e.participants||[];e.eventType=e.eventType||'study';e.studyArm=e.studyArm||'Control';e.timepoint=e.timepoint||'baseline';e.trainingLocation=e.trainingLocation||e.homeInstallationName||'';
  e.participants.forEach(p=>{p.voids=p.voids||[];p.intervention=p.intervention||{sessions:0,repetitions:0,coachingEvents:0,trialsToMastery:0,trainingMinutes:0};if(p.evaluation){normalizeEvaluation(p.evaluation,e);migrateLegacyCmcEvaluation(p.evaluation,e);}});
 });
 return x;
}
function normalizeEvaluation(ev,e){
 ev.ratings=ev.ratings||{};ev.failureDetails=ev.failureDetails||{};ev.ntReasons=ev.ntReasons||{};ev.timers=ev.timers||{};ev.stopwatch=ev.stopwatch||{elapsedMs:0,running:false,startedAt:null,completed:false,stoppedAt:null};ev.notes=ev.notes||'';ev.finalizedAt=ev.finalizedAt||null;ev.finalResult=ev.finalResult||null;ev.evaluatorName=ev.evaluatorName||e?.leadEvaluator||'';ev.evaluatorId=ev.evaluatorId||e?.evaluatorId||'';
}
function legacyCmcId(id){
 const m=String(id||'').match(/^CMC-(CUF|TFC|M|A|R|C|H|P|ABX|W|S|CPR|COMMS|DOC|EVAC)-(\d+)$/);if(!m)return id;
 const offsets={CUF:0,TFC:5,M:9,A:16,R:26,C:41,H:63,P:93,ABX:99,W:103,S:112,CPR:114,COMMS:115,DOC:118,EVAC:119};
 const n=Number(m[2]);return `CMC-${String(offsets[m[1]]+n).padStart(3,'0')}`;
}
function migrateLegacyCmcEvaluation(ev,e){
 if(e?.skillId!=='CMC'||ev.cmcRaPSMigration===1)return;
 const migrateObj=obj=>{const out={};Object.entries(obj||{}).forEach(([k,v])=>out[legacyCmcId(k)]=v);return out;};
 ev.ratings=migrateObj(ev.ratings);ev.failureDetails=migrateObj(ev.failureDetails);ev.ntReasons=migrateObj(ev.ntReasons);
 const timerMap={'CMC-30MIN':'cmc_overall','CMC-WOUND-3MIN':'cmc_wound_pressure','CMC-NDC-HOLD':'cmc_ndc_hold'};const nt={};Object.entries(ev.timers||{}).forEach(([k,v])=>nt[timerMap[k]||k]=v);ev.timers=nt;
 // v4.0 merged the three antibiotic decision rows into one. Preserve that historical rating at CMC-101; the two restored route-specific rows remain ungraded until a new assessment.
 ev.cmcRaPSMigration=1;
}
function normPid(v){return String(v||'').trim().toUpperCase();}
function itemsForSkill(s){return s?s.sections.flatMap(sec=>sec.items.map(i=>({...i,section:sec.code,sectionTitle:sec.title}))):[];}
function loadDb(){try{return normalizeDb(JSON.parse(localStorage.getItem(DB_KEY)))||defaultDb();}catch{return defaultDb();}}
function saveDb(){db.appVersion=BUILD.versionName;localStorage.setItem(DB_KEY,JSON.stringify(db));SYNC?.noteLocalChange?.(db);}
function event(){return db.events.find(e=>e.id===currentEventId)||null;}
function participant(){return event()?.participants.find(p=>p.id===currentParticipantId)||null;}
function skill(e=event()){return e?SKILLS[e.skillId]:null;}
function allItems(s=skill()){return itemsForSkill(s);}
function itemById(id){return allItems().find(i=>i.id===id);}
function commandName(id){return LOC.commands.find(c=>c.id===id)?.name||id||'—';}
function installation(id){return LOC.installations.find(i=>i.id===id)||null;}
function installationLabel(i){if(!i)return '';const suffix=i.state?`, ${i.state}`:(i.country&&i.country!=='USA'?`, ${i.country}`:'');return `${i.name}${suffix}`;}
function eventHomeName(e){return installation(e.homeInstallationId)?.name||e.homeInstallationName||'—';}
function getEval(){return participant()?.evaluation||null;}
function showView(id){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');window.scrollTo({top:0,behavior:'instant'});}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2200);}
function openModal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.remove('hidden');$('modal').setAttribute('aria-hidden','false');}
function closeModal(){$('modal').classList.add('hidden');$('modal').setAttribute('aria-hidden','true');$('modalBody').innerHTML='';}

function openAccountRequest(){
 const majcomOptions=LOC.commands.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
 openModal('Request a FieldReady evaluator account',`
  <p>Requests require administrator approval before study data can be accessed. Use your authorized work email and do not enter participant or patient information.</p>
  <form id="accountRequestForm">
   <div class="formGrid">
    <label><span>Name</span><input name="displayName" required autocomplete="name"></label>
    <label><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
    <label><span>Password</span><input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
    <label><span>Confirm password</span><input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password"></label>
    <label><span>MAJCOM</span><select name="majcom" id="requestMajcom" required><option value="">Select MAJCOM</option>${majcomOptions}</select></label>
    <label><span>Installation</span><select name="installationId" id="requestInstallation" required><option value="">Select MAJCOM first</option></select></label>
   </div>
   <div id="accountRequestError" class="accessError hidden" role="alert"></div>
   <div class="actionsRow spaced"><button class="btn primary" type="submit">Submit request</button></div>
  </form>`);
 const maj=$('requestMajcom'),base=$('requestInstallation');
 const fillBases=()=>{const selected=maj.value;base.innerHTML='<option value="">Select installation</option>'+LOC.installations.filter(i=>(i.commands||[]).includes(selected)).sort((x,y)=>x.name.localeCompare(y.name)).map(i=>`<option value="${esc(i.id)}">${esc(installationLabel(i))}</option>`).join('');};
 maj.onchange=fillBases;
 $('accountRequestForm').onsubmit=async e=>{
  e.preventDefault();
  const fd=new FormData(e.target),pw=String(fd.get('password')||''),confirm=String(fd.get('confirmPassword')||''),err=$('accountRequestError');
  err.classList.add('hidden');
  if(pw!==confirm){err.textContent='Passwords do not match.';err.classList.remove('hidden');return;}
  const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;
  try{
   await SYNC.requestAccount({
    email:fd.get('email'),password:pw,displayName:fd.get('displayName'),
    majcom:fd.get('majcom'),installationId:fd.get('installationId')
   });
   closeModal();
   toast('Account request submitted. Administrator approval is required before sign-in.');
  }catch(ex){err.textContent=ex?.message||'Unable to submit account request.';err.classList.remove('hidden');}
  finally{btn.disabled=false;}
 };
}

async function renderAdmin(){
 if(currentAccessProfile?.role!=='enterprise')return renderHome();
 showView('adminView');
 $('accountRequestsTable').innerHTML='<div class="empty">Loading account requests…</div>';
 $('accountUsersTable').innerHTML='<div class="empty">Loading users…</div>';
 try{
  const data=await SYNC.listAccountAdministration();
  const memberships=new Map((data.memberships||[]).map(m=>[m.user_id,m]));
  const pending=(data.requests||[]).filter(r=>r.status==='pending');
  $('accountRequestsTable').innerHTML=pending.length?`<table class="dataTable"><thead><tr><th>Name</th><th>Email</th><th>Requested location</th><th>Requested</th><th></th></tr></thead><tbody>${pending.map(r=>`<tr><td><b>${esc(r.display_name||'—')}</b></td><td>${esc(r.email)}</td><td>${esc(r.majcom||'—')} · ${esc(installation(r.installation_id)?.name||r.installation_id||'—')}</td><td>${r.created_at?esc(new Date(r.created_at).toLocaleString()):'—'}</td><td><div class="actionsRow"><button class="btn primary compactBtn" data-approve-request="${r.id}">Approve</button><button class="btn danger ghost compactBtn" data-deny-request="${r.id}">Deny</button></div></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No pending account requests.</div>';

  $('accountUsersTable').innerHTML=(data.profiles||[]).length?`<table class="dataTable"><thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Status</th><th></th></tr></thead><tbody>${data.profiles.map(p=>{const m=memberships.get(p.user_id);const scope=m?(m.scope_type==='majcom'?commandName(m.scope_value):(installation(m.scope_value)?.name||m.scope_value)):'Enterprise / event assignment';return `<tr><td><b>${esc(p.display_name||'—')}</b><div class="tiny">${esc(p.email||p.user_id)}</div></td><td>${esc(p.role)}</td><td>${esc(scope)}</td><td><span class="status ${p.active?'pass':'fail'}">${p.active?'ACTIVE':'INACTIVE'}</span></td><td><button class="btn ghost compactBtn" data-edit-user="${p.user_id}">Manage</button></td></tr>`;}).join('')}</tbody></table>`:'<div class="empty">No FieldReady users found.</div>';

  document.querySelectorAll('[data-approve-request]').forEach(b=>b.onclick=()=>openApproveRequest((data.requests||[]).find(r=>r.id===b.dataset.approveRequest)));
  document.querySelectorAll('[data-deny-request]').forEach(b=>b.onclick=async()=>{const note=prompt('Reason for denial (optional):')||'';try{await SYNC.denyAccountRequest(b.dataset.denyRequest,note);toast('Account request denied.');renderAdmin();}catch(ex){alert(ex?.message||'Unable to deny request.');}});
  document.querySelectorAll('[data-edit-user]').forEach(b=>b.onclick=()=>openManageUser((data.profiles||[]).find(p=>p.user_id===b.dataset.editUser),memberships.get(b.dataset.editUser)));
 }catch(ex){
  $('accountRequestsTable').innerHTML=`<div class="empty bad">${esc(ex?.message||'Unable to load account administration.')}</div>`;
  $('accountUsersTable').innerHTML='';
 }
}

function adminRoleForm(role='evaluator',membership=null){
 return `<label><span>Role</span><select name="role" id="adminRole"><option value="evaluator" ${role==='evaluator'?'selected':''}>Evaluator</option><option value="program_manager" ${role==='program_manager'?'selected':''}>Program Manager</option><option value="majcom_manager" ${role==='majcom_manager'?'selected':''}>MAJCOM Manager</option><option value="enterprise" ${role==='enterprise'?'selected':''}>Enterprise</option></select></label><div id="adminScopeFields" class="full">${scopeOptions(role,membership?.scope_type==='majcom'?membership.scope_value:'',membership?.scope_type==='installation'?membership.scope_value:'')}</div>`;
}
function wireAdminRoleScope(form,membership=null){
 const role=form.querySelector('#adminRole'),scope=form.querySelector('#adminScopeFields');
 const refresh=()=>{scope.innerHTML=scopeOptions(role.value,membership?.scope_type==='majcom'?membership.scope_value:'',membership?.scope_type==='installation'?membership.scope_value:'');};
 role.onchange=()=>{membership=null;refresh();};
}
function openApproveRequest(r){
 if(!r)return;
 openModal('Approve FieldReady account',`<p><b>${esc(r.display_name||r.email)}</b><br>${esc(r.email)}</p><form id="approveAccountForm"><div class="formGrid">${adminRoleForm('evaluator')}</div><div class="actionsRow spaced"><button class="btn primary" type="submit">Approve account</button></div></form>`);
 const form=$('approveAccountForm');wireAdminRoleScope(form);
 form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);try{await SYNC.approveAccountRequest(r.id,fd.get('role'),fd.get('scopeType')||null,fd.get('scopeValue')||null);closeModal();toast('Account approved.');renderAdmin();}catch(ex){alert(ex?.message||'Unable to approve account.');}};
}
function openManageUser(p,membership){
 if(!p)return;
 openModal('Manage FieldReady user',`<p><b>${esc(p.display_name||'FieldReady user')}</b><br>${esc(p.email||p.user_id)}</p><form id="manageAccountForm"><div class="formGrid">${adminRoleForm(p.role,membership)}<label class="checkLine full"><input type="checkbox" name="active" ${p.active?'checked':''}> Account active</label></div><div class="actionsRow spaced"><button class="btn primary" type="submit">Save access</button></div></form>`);
 const form=$('manageAccountForm');wireAdminRoleScope(form,membership);
 form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);try{await SYNC.setUserAccess(p.user_id,fd.get('active')==='on',fd.get('role'),fd.get('scopeType')||null,fd.get('scopeValue')||null);closeModal();toast('User access updated.');renderAdmin();}catch(ex){alert(ex?.message||'Unable to update access.');}};
}
function openInviteUser(){
 openModal('Invite FieldReady user',`<p>The invitation email is sent by the dedicated FieldReady Auth service. The invited user sets their own password; no administrator password is created or exposed.</p><form id="inviteAccountForm"><div class="formGrid"><label><span>Name</span><input name="displayName" required></label><label><span>Email</span><input name="email" type="email" required></label>${adminRoleForm('evaluator')}</div><div id="inviteAccountError" class="accessError hidden"></div><div class="actionsRow spaced"><button class="btn primary" type="submit">Send invitation</button></div></form>`);
 const form=$('inviteAccountForm');wireAdminRoleScope(form);
 form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),err=$('inviteAccountError'),btn=form.querySelector('button[type="submit"]');err.classList.add('hidden');btn.disabled=true;try{await SYNC.inviteUser({email:fd.get('email'),displayName:fd.get('displayName'),role:fd.get('role'),scopeType:fd.get('scopeType')||null,scopeValue:fd.get('scopeValue')||null});closeModal();toast('Invitation sent and FieldReady access provisioned.');renderAdmin();}catch(ex){err.textContent=ex?.message||'Unable to send invitation.';err.classList.remove('hidden');}finally{btn.disabled=false;}};
}

function download(name,text,type='text/plain'){const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}

function makeEvaluation(e){
 const s=SKILLS[e.skillId];const timers={};(s.timers||[]).forEach(t=>timers[t.id]={elapsedMs:0,running:false,startedAt:null,completed:false,valid:null});
 return {id:uuid(),startedAt:now(),finalizedAt:null,finalResult:null,ratings:{},failureDetails:{},ntReasons:{},timers,stopwatch:{elapsedMs:0,running:false,startedAt:null,completed:false,stoppedAt:null},evaluatorName:e.leadEvaluator||'',evaluatorId:e.evaluatorId||'',notes:'',appVersion:BUILD.versionName,skillSource:s.source,scenarioVersion:e.scenarioVersion||'1'};
}
function scoring(ev=getEval(),s=skill()){
 if(!ev||!s)return {pass:0,fail:0,nt:0,no:0,ungraded:0,denom:0,percent:null,criticalFail:0,missingClass:0,unresolved:0,result:'IN PROGRESS'};
 const items=allItems(s);let pass=0,fail=0,nt=0,no=0,ungraded=0,criticalFail=0,missingClass=0;
 items.forEach(i=>{const r=ev.ratings[i.id];if(r==='pass')pass++;else if(r==='fail'){fail++;if(i.critical)criticalFail++;const d=ev.failureDetails[i.id];if(!d?.mode||!d?.contributor||(d.mode==='other-unclear'&&!String(d.comment||'').trim()))missingClass++;}else if(r==='nt')nt++;else if(r==='no')no++;else ungraded++;});
 const denom=pass+fail,percent=denom?pass/denom:null;const unresolved=no+ungraded+items.filter(i=>i.critical&&ev.ratings[i.id]==='nt').length+missingClass;
 const swDef=s.stopwatch||{},sw=ev.stopwatch||{};const stopwatchInvalid=!!(sw.completed&&swDef.requiredForPass&&!timerValidity(swDef,sw.elapsedMs||0));
 let result='IN PROGRESS';if(ev.finalizedAt)result=ev.finalResult;else if(unresolved===0)result=(criticalFail===0&&percent!=null&&percent>=s.threshold&&!stopwatchInvalid)?'PASS':'FAIL';
 return {pass,fail,nt,no,ungraded,denom,percent,criticalFail,missingClass,unresolved,result,stopwatchInvalid};
}
function finalizable(ev=getEval(),s=skill()){
 const score=scoring(ev,s);const running=!!ev?.stopwatch?.running||Object.values(ev?.timers||{}).some(t=>t.running);const stopwatchReady=!s?.stopwatch?.requiredForFinalization||!!ev?.stopwatch?.completed;return {ok:score.unresolved===0&&!running&&stopwatchReady,score,running,stopwatchReady};
}

function renderHome(){
 showView('homeView');populateFilters();renderManagement();renderParticipantIndex();renderEvents();
}
function scopedEvents(){return db.events.filter(e=>(!filters.majcom||e.majcom===filters.majcom)&&(!filters.base||e.homeInstallationId===filters.base)&&(!filters.skill||e.skillId===filters.skill)&&(!filters.arm||e.studyArm===filters.arm)&&(!filters.timepoint||e.timepoint===filters.timepoint));}
function finalizedRows(events=scopedEvents()){
 const rows=[];events.forEach(e=>e.participants.forEach(p=>{if(p.evaluation?.finalizedAt)rows.push({e,p,ev:p.evaluation,s:SKILLS[e.skillId],score:scoring(p.evaluation,SKILLS[e.skillId])});}));return rows;
}
function populateFilters(){
 $('filterMajcom').innerHTML='<option value="">All MAJCOMs</option>'+LOC.commands.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');$('filterMajcom').value=filters.majcom;
 const bases=LOC.installations.filter(i=>!filters.majcom||(i.commands||[]).includes(filters.majcom)).sort((a,b)=>a.name.localeCompare(b.name));$('filterBase').innerHTML='<option value="">All installations</option>'+bases.map(i=>`<option value="${esc(i.id)}">${esc(installationLabel(i))}</option>`).join('');$('filterBase').value=filters.base;
 $('filterSkill').innerHTML='<option value="">All skills</option>'+Object.values(SKILLS).map(s=>`<option value="${s.id}">${esc(s.shortName)}</option>`).join('');$('filterSkill').value=filters.skill;$('filterArm').value=filters.arm;$('filterTime').value=filters.timepoint;
}
function renderManagement(){
 const events=scopedEvents(),rows=finalizedRows(events),parts=events.reduce((n,e)=>n+e.participants.length,0),passes=rows.filter(r=>r.ev.finalResult==='PASS').length,crit=rows.filter(r=>r.score.criticalFail>0).length,avg=rows.length?rows.reduce((a,r)=>a+(r.score.percent||0),0)/rows.length:null;
 let failedObs=0,classed=0;const contrib={},gaps={};rows.forEach(r=>allItems(r.s).forEach(i=>{const rate=r.ev.ratings[i.id];if(rate==='fail'){failedObs++;const d=r.ev.failureDetails[i.id];if(d?.contributor){classed++;contrib[d.contributorLabel||d.contributor]=(contrib[d.contributorLabel||d.contributor]||0)+1;}const k=`${r.e.skillId}:${i.id}`;gaps[k]=gaps[k]||{skill:r.s.shortName,id:i.id,text:i.text,critical:i.critical,fail:0,tested:0};gaps[k].fail++;}if(rate==='pass'||rate==='fail'){const k=`${r.e.skillId}:${i.id}`;gaps[k]=gaps[k]||{skill:r.s.shortName,id:i.id,text:i.text,critical:i.critical,fail:0,tested:0};gaps[k].tested++;}}));
 const kpis=[['Events',events.length,'current scope'],['Participants',parts,'rostered'],['Finalized',rows.length,'formal evaluations'],['Pass rate',pct(rows.length?passes/rows.length:null),`${passes}/${rows.length}`],['Critical fail',pct(rows.length?crit/rows.length:null),`${crit} evaluations`],['Mean score',pct(avg),'NT excluded'],['Failure classified',pct(failedObs?classed/failedObs:null),`${classed}/${failedObs}`]];
 $('managementKpis').innerHTML=kpis.map(([a,b,c])=>`<div class="kpi"><small>${esc(a)}</small><strong>${esc(b)}</strong><span>${esc(c)}</span></div>`).join('');
 renderLocationTable(events);renderFailurePattern(contrib,failedObs);renderGapTable(gaps,'gapTable');renderRetention(rows);
}
function renderLocationTable(events){
 const groups={};events.forEach(e=>{const k=`${e.majcom}|${e.homeInstallationId||e.homeInstallationName}`;const g=groups[k]||(groups[k]={maj:e.majcom,base:eventHomeName(e),events:0,participants:0,rows:[]});g.events++;g.participants+=e.participants.length;e.participants.forEach(p=>{if(p.evaluation?.finalizedAt)g.rows.push({ev:p.evaluation,score:scoring(p.evaluation,SKILLS[e.skillId])});});});
 const html=Object.values(groups).sort((a,b)=>b.participants-a.participants).map(g=>{const pass=g.rows.filter(r=>r.ev.finalResult==='PASS').length,crit=g.rows.filter(r=>r.score.criticalFail).length;return `<tr><td><b>${esc(commandName(g.maj))}</b></td><td>${esc(g.base)}</td><td>${g.events}</td><td>${g.participants}</td><td>${pct(g.rows.length?pass/g.rows.length:null)}</td><td>${pct(g.rows.length?crit/g.rows.length:null)}</td></tr>`;}).join('');
 $('locationTable').innerHTML=html?`<table class="dataTable"><thead><tr><th>MAJCOM</th><th>Installation</th><th>Events</th><th>Participants</th><th>Pass</th><th>Critical fail</th></tr></thead><tbody>${html}</tbody></table>`:'<div class="empty">No study events in this scope.</div>';
}
function renderFailurePattern(contrib,total){const rows=Object.entries(contrib).sort((a,b)=>b[1]-a[1]);$('failurePattern').innerHTML=rows.length?rows.map(([k,n])=>`<div class="rootRow"><div><div><b>${esc(k)}</b> <span class="tiny">${n}</span></div><div class="rootRowBar"><i style="width:${Math.max(5,Math.round(n/total*100))}%"></i></div></div><b>${Math.round(n/total*100)}%</b></div>`).join(''):'<div class="empty">No classified failures.</div>';}
function renderGapTable(gaps,id){const rows=Object.values(gaps).filter(g=>g.fail>0).sort((a,b)=>(b.fail/b.tested)-(a.fail/a.tested)).slice(0,10);$(id).innerHTML=rows.length?`<table class="dataTable"><thead><tr><th>Skill / criterion</th><th>Tested</th><th>Fail rate</th></tr></thead><tbody>${rows.map(g=>`<tr><td><b>${esc(g.skill)} · ${esc(g.id)}</b>${g.critical?' <span class="critBadge">CRITICAL</span>':''}<div class="tiny">${esc(g.text)}</div></td><td>${g.tested}</td><td class="${g.fail/g.tested>=.25?'bad':''}">${pct(g.fail/g.tested)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No failed criteria.</div>';}
function renderRetention(rows){
 const arms=['Control','Frequency-Based','Deliberate Practice'],times=['baseline','3-month','6-month'];const groups={};rows.forEach(r=>{const k=`${r.e.studyArm}|${r.e.timepoint}`;const g=groups[k]||(groups[k]={n:0,pass:0,sum:0});g.n++;if(r.ev.finalResult==='PASS')g.pass++;g.sum+=r.score.percent||0;});
 $('retentionTable').innerHTML=`<table class="dataTable"><thead><tr><th>Study arm</th>${times.map(t=>`<th>${t==='baseline'?'Baseline':t==='3-month'?'3-Month':'6-Month'}</th>`).join('')}</tr></thead><tbody>${arms.map(a=>`<tr><td><b>${a}</b></td>${times.map(t=>{const g=groups[`${a}|${t}`];return `<td>${g?`n=${g.n}<br><b>${pct(g.sum/g.n)}</b> mean · ${pct(g.pass/g.n)} pass`:'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
}
function allParticipantInstances(){const out=[];db.events.filter(e=>!e.deletedAt).forEach(e=>e.participants.forEach(p=>out.push({e,p,ev:p.evaluation,s:SKILLS[e.skillId],key:normPid(p.participantId)})));return out;}
function renderParticipantIndex(){const box=$('participantIndex');if(!box)return;const groups={};allParticipantInstances().forEach(r=>{if(!r.key)return;const g=groups[r.key]||(groups[r.key]={participantId:r.p.participantId,rows:[],latest:r});g.rows.push(r);if(String(r.e.date||'')>String(g.latest.e.date||''))g.latest=r;});const rows=Object.values(groups).sort((a,b)=>a.participantId.localeCompare(b.participantId));box.innerHTML=rows.length?`<table class="dataTable"><thead><tr><th>Participant ID</th><th>Profile</th><th>Measurements</th><th>Timepoints</th><th></th></tr></thead><tbody>${rows.map(g=>{const finals=g.rows.filter(r=>r.ev?.finalizedAt).length;const tps=['baseline','3-month','6-month'].map(t=>g.rows.some(r=>r.e.timepoint===t&&r.ev?.finalizedAt)?`<span class="tpChip done">${t==='baseline'?'B':t==='3-month'?'3M':'6M'}</span>`:`<span class="tpChip">${t==='baseline'?'B':t==='3-month'?'3M':'6M'}</span>`).join(' ');const p=g.latest.p;return `<tr><td><b>${esc(g.participantId)}</b></td><td>${esc(p.afsc||'—')} · ${esc(p.workSection||'—')}<div class="tiny">${esc(p.clinicalYears??'—')} clinical years</div></td><td>${finals} finalized / ${g.rows.length} rostered</td><td>${tps}</td><td><button class="btn ghost" data-open-record="${esc(g.participantId)}">Open record</button></td></tr>`;}).join('')}</tbody></table>`:'<div class="empty">No longitudinal participant records yet.</div>';document.querySelectorAll('[data-open-record]').forEach(b=>b.onclick=()=>openLongitudinalRecord(b.dataset.openRecord));}
function recordRows(key=currentRecordKey){return allParticipantInstances().filter(r=>r.key===key);}
function openLongitudinalRecord(pid,preferredSkill=''){currentRecordKey=normPid(pid);const rows=recordRows();const skills=[...new Set(rows.map(r=>r.e.skillId))];currentRecordSkill=(preferredSkill&&skills.includes(preferredSkill))?preferredSkill:(currentRecordSkill&&skills.includes(currentRecordSkill)?currentRecordSkill:(skills[0]||''));recordCriterionFilter='all';renderLongitudinalRecord();}
function chooseTimepointRow(rows,timepoint){const x=rows.filter(r=>r.e.timepoint===timepoint).sort((a,b)=>{const af=a.ev?.finalizedAt?1:0,bf=b.ev?.finalizedAt?1:0;if(af!==bf)return bf-af;return String(b.e.date||'').localeCompare(String(a.e.date||''))||(b.ev?.finalizedAt||0)-(a.ev?.finalizedAt||0);});return x[0]||null;}
function ratingLabel(r){return r==='pass'?'PASS':r==='fail'?'FAIL':r==='nt'?'NT':r==='no'?'N/O':'—';}
function ratingClass(r){return r==='pass'?'pass':r==='fail'?'fail':r==='nt'?'nt':r==='no'?'no':'';}
function renderLongitudinalRecord(){const rows=recordRows();if(!rows.length)return renderHome();showView('participantView');const latest=[...rows].sort((a,b)=>String(b.e.date||'').localeCompare(String(a.e.date||'')))[0];$('recordTitle').textContent=`Participant ${latest.p.participantId}`;$('recordSub').textContent=`${latest.p.afsc||'—'} · ${latest.p.clinicalYears??'—'} clinical years · ${latest.p.workSection||'—'}`;const skillIds=[...new Set(rows.map(r=>r.e.skillId))];$('recordSkillSelect').innerHTML=skillIds.map(id=>`<option value="${id}">${esc(SKILLS[id]?.name||id)}</option>`).join('');$('recordSkillSelect').value=currentRecordSkill;$('recordSkillSelect').onchange=e=>{currentRecordSkill=e.target.value;recordCriterionFilter='all';renderLongitudinalRecord();};
 const sr=rows.filter(r=>r.e.skillId===currentRecordSkill),s=SKILLS[currentRecordSkill],times=['baseline','3-month','6-month'],picked=Object.fromEntries(times.map(t=>[t,chooseTimepointRow(sr,t)]));
 const cards=times.map(t=>{const r=picked[t],label=t==='baseline'?'Baseline':t==='3-month'?'3-Month':'6-Month';if(!r)return `<div class="timepointCard missing"><small>${label}</small><h3>Not recorded</h3><p>No ${esc(s?.shortName||'')} measurement found.</p></div>`;const sc=r.ev?scoring(r.ev,s):null,sw=r.ev?.stopwatch?.completed?fmtMs(r.ev.stopwatch.elapsedMs):'—',status=r.ev?.finalizedAt?r.ev.finalResult:r.ev?'IN PROGRESS':'NOT STARTED';return `<div class="timepointCard ${status==='PASS'?'passCard':status==='FAIL'?'failCard':''}"><small>${label}</small><h3>${esc(status)}</h3><div class="recordMetric"><span>Score</span><b>${sc?.percent==null?'—':pct(sc.percent)}</b></div><div class="recordMetric"><span>Critical fails</span><b>${sc?.criticalFail??'—'}</b></div><div class="recordMetric"><span>Assessment time</span><b>${sw}</b></div><div class="tiny">${esc(r.e.date||'—')} · ${esc(r.e.name||'')}</div><button class="btn ghost compactBtn" data-open-measure="${r.e.id}|${r.p.id}">Open measurement</button></div>`;}).join('');$('timepointCards').innerHTML=cards;document.querySelectorAll('[data-open-measure]').forEach(b=>b.onclick=()=>{const [eid,pid]=b.dataset.openMeasure.split('|');currentEventId=eid;currentParticipantId=pid;currentSection=0;renderEvaluation();});
 const filters=[['all','All criteria'],['fail','Any failure'],['changed','Changed over time'],['critical','Critical only']];$('recordFilterRow').innerHTML=filters.map(([v,l])=>`<button class="btn ${recordCriterionFilter===v?'primary':'ghost'}" data-record-filter="${v}">${l}</button>`).join('');document.querySelectorAll('[data-record-filter]').forEach(b=>b.onclick=()=>{recordCriterionFilter=b.dataset.recordFilter;renderLongitudinalRecord();});
 let items=itemsForSkill(s);items=items.filter(i=>{const vals=times.map(t=>picked[t]?.ev?.ratings?.[i.id]||'');if(recordCriterionFilter==='fail')return vals.includes('fail');if(recordCriterionFilter==='critical')return i.critical;if(recordCriterionFilter==='changed'){const v=vals.filter(Boolean);return v.length>1&&new Set(v).size>1;}return true;});
 $('criterionComparison').innerHTML=items.length?`<table class="dataTable comparisonTable"><thead><tr><th>Criterion</th>${times.map(t=>`<th>${t==='baseline'?'Baseline':t==='3-month'?'3-Month':'6-Month'}</th>`).join('')}</tr></thead><tbody>${items.map(i=>`<tr><td><b>${esc(i.id)}</b>${i.critical?' <span class="critBadge">CRITICAL</span>':''}<div class="tiny">${esc(i.text)}</div></td>${times.map(t=>{const ev=picked[t]?.ev,r=ev?.ratings?.[i.id]||'',d=ev?.failureDetails?.[i.id];return `<td><span class="compareRating ${ratingClass(r)}">${ratingLabel(r)}</span>${r==='fail'&&d?`<div class="tiny">${esc(d.modeLabel||'')}<br>${esc(d.contributorLabel||'')}</div>`:''}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`:'<div class="empty">No criteria match this comparison filter.</div>';
 $('exportRecordBtn').onclick=exportLongitudinalRecord;
}
function exportLongitudinalRecord(){const rows=recordRows(),headers=['participant_id','skill_id','timepoint','date','event','study_arm','majcom','installation','final_result','score_percent','critical_fail_count','assessment_stopwatch_seconds','criterion_id','criterion_text','critical','rating','failure_mode','primary_contributor'];const out=[headers];rows.filter(r=>r.ev).forEach(r=>{const sc=scoring(r.ev,r.s);itemsForSkill(r.s).forEach(i=>{const d=r.ev.failureDetails?.[i.id]||{};out.push([r.p.participantId,r.e.skillId,r.e.timepoint,r.e.date,r.e.name,r.e.studyArm,r.e.majcom,eventHomeName(r.e),r.ev.finalResult||'',sc.percent==null?'':(sc.percent*100).toFixed(1),sc.criticalFail,r.ev.stopwatch?.completed?Math.round((r.ev.stopwatch.elapsedMs||0)/1000):'',i.id,i.text,i.critical?'Y':'N',r.ev.ratings?.[i.id]||'',d.modeLabel||'',d.contributorLabel||'']);});});download(`FieldReady_${safeName(rows[0]?.p.participantId||'Participant')}_Longitudinal.csv`,out.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');}
function renderEvents(){const es=db.events.filter(e=>!e.deletedAt).sort((a,b)=>String(b.date).localeCompare(String(a.date)));$('eventsList').innerHTML=es.length?es.map(e=>{const finals=e.participants.filter(p=>p.evaluation?.finalizedAt).length;return `<div class="eventCard" data-event="${e.id}"><div><h3>${esc(e.name)}</h3><div class="eventMetaLine">${esc(SKILLS[e.skillId]?.shortName||e.skillId)} · ${esc(e.studyArm)} · ${esc(e.timepoint)} · ${esc(commandName(e.majcom))} · ${esc(eventHomeName(e))}</div></div><div><span class="status">${finals}/${e.participants.length} finalized</span></div></div>`;}).join(''):'<div class="empty">No study events yet. Create an event for a skill, timepoint, study arm, MAJCOM, and installation.</div>';document.querySelectorAll('[data-event]').forEach(x=>x.onclick=()=>openEvent(x.dataset.event));}

function showEventForm(existing=null){
 const commands=LOC.commands.map(c=>`<option value="${c.id}" ${(existing?.majcom||'')===c.id?'selected':''}>${esc(c.name)}</option>`).join('');const skills=Object.values(SKILLS).map(s=>`<option value="${s.id}" ${(existing?.skillId||'CMC')===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
 openModal(existing?'Edit Study Event':'New Study Event',`<form id="eventForm"><div class="formGrid">
 <label><span>Event / class name *</span><input name="name" required value="${esc(existing?.name||'')}"></label><label><span>Date *</span><input name="date" type="date" required value="${esc(existing?.date||isoDate())}"></label>
 <label><span>Skill / assessment *</span><select name="skillId" ${existing?'disabled':''}>${skills}</select></label><label><span>Event type</span><select name="eventType"><option value="study" ${existing?.eventType!=='calibration'?'selected':''}>Study measurement</option><option value="calibration" ${existing?.eventType==='calibration'?'selected':''}>Evaluator calibration</option></select></label>
 <label><span>Study timepoint *</span><select name="timepoint"><option value="baseline">Baseline</option><option value="3-month">3-Month</option><option value="6-month">6-Month</option></select></label><label><span>Study arm *</span><select name="studyArm"><option>Control</option><option>Frequency-Based</option><option>Deliberate Practice</option></select></label>
 <label class="full"><span>Supported MAJCOM / Command *</span><select name="majcom" required><option value="">Select command</option>${commands}</select></label>
 <label class="full"><span>Home installation *</span><select name="homeInstallationId" required></select></label>
 <label class="full"><span>Unit / organization</span><input name="unit" value="${esc(existing?.unit||'')}" placeholder="e.g., 15 MDG"></label>
 <label class="full"><span>Training location</span><input name="trainingLocation" value="${esc(existing?.trainingLocation||'')}" placeholder="Defaults to home installation; expeditionary locations may be entered here"></label>
 <label><span>Lead evaluator</span><input name="leadEvaluator" value="${esc(existing?.leadEvaluator||'')}"></label><label><span>Evaluator ID</span><input name="evaluatorId" value="${esc(existing?.evaluatorId||'')}"></label>
 <label><span>Scenario name</span><input name="scenario" value="${esc(existing?.scenario||'')}"></label><label><span>Scenario version</span><input name="scenarioVersion" value="${esc(existing?.scenarioVersion||'1')}"></label>
 <label class="full"><span>Study / scenario notes</span><textarea name="notes" rows="2">${esc(existing?.notes||'')}</textarea></label>
 </div><div class="actionsRow spaced"><button class="btn primary" type="submit">${existing?'Save Event':'Create Event'}</button></div></form>`);
 const f=$('eventForm');f.elements.timepoint.value=existing?.timepoint||'baseline';f.elements.studyArm.value=existing?.studyArm||'Control';
 function fillBases(){const maj=f.elements.majcom.value;const list=LOC.installations.filter(i=>i.active!==false&&(!maj||(i.commands||[]).includes(maj))).sort((a,b)=>a.name.localeCompare(b.name));f.elements.homeInstallationId.innerHTML='<option value="">Select installation</option>'+list.map(i=>`<option value="${i.id}">${esc(installationLabel(i))}</option>`).join('')+'<option value="__OTHER__">Other / expeditionary / not listed</option>';if(existing?.homeInstallationId&&list.some(i=>i.id===existing.homeInstallationId))f.elements.homeInstallationId.value=existing.homeInstallationId;}
 f.elements.majcom.onchange=fillBases;fillBases();
 f.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f).entries());if(d.homeInstallationId==='__OTHER__'){const custom=prompt('Enter home installation / location name:');if(!custom)return;d.homeInstallationName=custom;d.homeInstallationId='';}else d.homeInstallationName=installation(d.homeInstallationId)?.name||'';d.trainingLocation=String(d.trainingLocation||'').trim()||d.homeInstallationName;d.skillId=existing?.skillId||d.skillId;if(existing){Object.assign(existing,d);saveDb();closeModal();renderEvent();renderHomeSilently();}else{const ev={id:uuid(),...d,createdAt:now(),participants:[]};db.events.push(ev);saveDb();closeModal();openEvent(ev.id);}};
}
function openEvent(id){currentEventId=id;currentParticipantId=null;renderEvent();}
function renderEvent(){const e=event();if(!e)return renderHome();showView('eventView');const s=skill(e);$('eventKicker').textContent=`${e.timepoint.toUpperCase()} · ${e.studyArm.toUpperCase()}`;$('eventTitle').textContent=e.name;$('eventSub').textContent=`${s.name} · ${s.source}`;const home=installation(e.homeInstallationId);const vals=[['Study arm',e.studyArm],['Timepoint',e.timepoint],['MAJCOM',commandName(e.majcom)],['Home installation',eventHomeName(e)],['Host command',home?commandName(home.hostCommand):'—'],['Unit',e.unit||'—'],['Training location',e.trainingLocation||'—'],['Scenario',e.scenario||'—'],['Scenario version',e.scenarioVersion||'1'],['Date',e.date||'—'],['Evaluator',e.leadEvaluator||'—'],['App version',BUILD.versionName]];$('eventMeta').innerHTML=vals.map(([a,b])=>`<div class="metaCell"><small>${esc(a)}</small><b>${esc(b)}</b></div>`).join('');renderRoster();renderEventAnalytics();}
function renderHomeSilently(){populateFilters();renderManagement();renderParticipantIndex();renderEvents();}
function renderRoster(){const e=event();$('rosterTable').innerHTML=e.participants.length?`<table class="dataTable"><thead><tr><th>Participant ID</th><th>AFSC</th><th>Clinical years</th><th>Work section</th><th>Exposure</th><th>Status</th><th></th></tr></thead><tbody>${e.participants.map(p=>{const ev=p.evaluation,score=ev?scoring(ev,skill(e)):null,status=ev?.finalizedAt?ev.finalResult:ev?'IN PROGRESS':'NOT STARTED';return `<tr><td><b>${esc(p.participantId)}</b><div class="tiny">${esc(p.rank||'')}</div></td><td>${esc(p.afsc||'—')}</td><td>${esc(p.clinicalYears??'—')}</td><td>${esc(p.workSection||'—')}</td><td class="tiny">${p.intervention?.sessions||0} sessions · ${p.intervention?.repetitions||0} reps · ${p.intervention?.coachingEvents||0} coaching</td><td><span class="status ${status==='PASS'?'pass':status==='FAIL'?'fail':''}">${status}</span>${ev?`<div class="tiny">${score.percent==null?'—':pct(score.percent)}</div>`:''}</td><td><button class="btn ${ev?.finalizedAt?'ghost':'primary'}" data-grade="${p.id}">${ev?.finalizedAt?'Review':'Grade'}</button> <button class="btn ghost" data-longitudinal="${esc(p.participantId)}">Longitudinal</button> <button class="btn ghost" data-editp="${p.id}">Edit</button></td></tr>`;}).join('')}</tbody></table>`:'<div class="empty">No participants rostered.</div>';document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>openEvaluation(b.dataset.grade));document.querySelectorAll('[data-longitudinal]').forEach(b=>b.onclick=()=>openLongitudinalRecord(b.dataset.longitudinal,e.skillId));document.querySelectorAll('[data-editp]').forEach(b=>b.onclick=()=>showParticipantForm(e.participants.find(p=>p.id===b.dataset.editp)));}
function showParticipantForm(existing=null){const e=event();openModal(existing?'Edit Participant':'Add Participant',`<form id="participantForm"><div class="formGrid">
 <label><span>Participant ID *</span><input name="participantId" required value="${esc(existing?.participantId||'')}"></label><label><span>Rank (optional)</span><input name="rank" value="${esc(existing?.rank||'')}"></label>
 <label><span>AFSC *</span><input name="afsc" required value="${esc(existing?.afsc||'46NX')}"></label><label><span>Clinical years experience *</span><input name="clinicalYears" type="number" min="0" step="0.5" required value="${esc(existing?.clinicalYears??'')}"></label>
 <label class="full"><span>Current work section *</span><input name="workSection" required value="${esc(existing?.workSection||'')}"></label>
 <label><span>Practice sessions</span><input name="sessions" type="number" min="0" value="${existing?.intervention?.sessions||0}"></label><label><span>Practice repetitions</span><input name="repetitions" type="number" min="0" value="${existing?.intervention?.repetitions||0}"></label>
 <label><span>Feedback / coaching events</span><input name="coachingEvents" type="number" min="0" value="${existing?.intervention?.coachingEvents||0}"></label><label><span>Trials to mastery</span><input name="trialsToMastery" type="number" min="0" value="${existing?.intervention?.trialsToMastery||0}"></label>
 <label><span>Intervention minutes</span><input name="trainingMinutes" type="number" min="0" step="1" value="${existing?.intervention?.trainingMinutes||0}"></label>
 </div><p class="tiny spaced">Exposure fields are intervention/fidelity data only. They do not alter formal evaluation scoring.</p><div class="actionsRow"><button class="btn primary" type="submit">${existing?'Save':'Add Participant'}</button></div></form>`);const f=$('participantForm');f.onsubmit=x=>{x.preventDefault();const d=Object.fromEntries(new FormData(f).entries());const base={participantId:d.participantId.trim(),rank:d.rank.trim(),afsc:d.afsc.trim(),clinicalYears:Number(d.clinicalYears),workSection:d.workSection.trim(),intervention:{sessions:Number(d.sessions)||0,repetitions:Number(d.repetitions)||0,coachingEvents:Number(d.coachingEvents)||0,trialsToMastery:Number(d.trialsToMastery)||0,trainingMinutes:Number(d.trainingMinutes)||0}};if(existing)Object.assign(existing,base);else e.participants.push({id:uuid(),...base,evaluation:null,voids:[]});saveDb();closeModal();renderRoster();renderEventAnalytics();};}
function eventAnalytics(e=event()){const rows=e.participants.filter(p=>p.evaluation?.finalizedAt).map(p=>({p,ev:p.evaluation,score:scoring(p.evaluation,SKILLS[e.skillId])}));const pass=rows.filter(r=>r.ev.finalResult==='PASS').length,crit=rows.filter(r=>r.score.criticalFail).length,avg=rows.length?rows.reduce((a,r)=>a+(r.score.percent||0),0)/rows.length:null;const gaps={},contrib={};rows.forEach(r=>allItems(SKILLS[e.skillId]).forEach(i=>{const v=r.ev.ratings[i.id],k=i.id;if(v==='pass'||v==='fail'){gaps[k]=gaps[k]||{skill:SKILLS[e.skillId].shortName,id:i.id,text:i.text,critical:i.critical,fail:0,tested:0};gaps[k].tested++;if(v==='fail'){gaps[k].fail++;const d=r.ev.failureDetails[i.id];if(d?.contributor)contrib[d.contributorLabel]=(contrib[d.contributorLabel]||0)+1;}}}));return {rows,pass,crit,avg,gaps,contrib};}
function renderEventAnalytics(){const a=eventAnalytics();$('eventKpis').innerHTML=[['Roster',event().participants.length,'participants'],['Finalized',a.rows.length,'formal measures'],['Pass rate',pct(a.rows.length?a.pass/a.rows.length:null),`${a.pass}/${a.rows.length}`],['Mean score',pct(a.avg),'NT excluded'],['Critical fail',pct(a.rows.length?a.crit/a.rows.length:null),`${a.crit} evaluations`]].map(([x,y,z])=>`<div class="kpi"><small>${x}</small><strong>${y}</strong><span>${z}</span></div>`).join('');renderGapTable(a.gaps,'eventGapTable');const total=Object.values(a.contrib).reduce((x,y)=>x+y,0);$('eventContributors').innerHTML=total?Object.entries(a.contrib).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="rootRow"><div><b>${esc(k)}</b><div class="rootRowBar"><i style="width:${Math.max(5,Math.round(n/total*100))}%"></i></div></div><b>${n}</b></div>`).join(''):'<div class="empty">No classified failures.</div>';}

function openEvaluation(pid){currentParticipantId=pid;const p=participant(),e=event();if(!p.evaluation){p.evaluation=makeEvaluation(e);saveDb();}currentSection=0;renderEvaluation();}
function renderEvaluation(){const e=event(),p=participant(),s=skill(e),ev=getEval();if(!e||!p||!s||!ev)return renderEvent();showView('evalView');$('evalKicker').textContent=`${s.shortName.toUpperCase()} · ${e.timepoint.toUpperCase()}`;$('evalTitle').textContent=`Participant ${p.participantId}`;$('evalSub').textContent=`${s.source} · Study arm hidden during scoring`;$('sectionSelect').innerHTML=s.sections.map((sec,i)=>`<option value="${i}">${esc(sec.code)} — ${esc(sec.title)}</option>`).join('');$('sectionSelect').value=String(currentSection);$('evalName').value=ev.evaluatorName||'';$('evalId').value=ev.evaluatorId||'';$('overallNotes').value=ev.notes||'';$('recordFromEvalBtn').onclick=()=>openLongitudinalRecord(p.participantId,e.skillId);renderStopwatch();renderTimers();renderCriteria();renderEvalKpis();clearInterval(ticker);ticker=setInterval(()=>{if($('evalView').classList.contains('active')){renderStopwatch(true);renderTimers(true);}},250);}
function renderEvalKpis(){const st=scoring();$('scoreKpi').textContent=st.percent==null?'—':`${(st.percent*100).toFixed(1)}%`;$('critKpi').textContent=st.criticalFail;$('unresolvedKpi').textContent=st.unresolved;}
function currentStopwatchElapsed(sw){return sw?.running?(sw.elapsedMs||0)+(now()-sw.startedAt):(sw?.elapsedMs||0);}
function renderStopwatch(tickOnly=false){
 const s=skill(),ev=getEval();if(!s||!ev)return;const def=s.stopwatch||{label:'Assessment Stopwatch'},sw=ev.stopwatch||(ev.stopwatch={elapsedMs:0,running:false,startedAt:null,completed:false,stoppedAt:null});const ms=currentStopwatchElapsed(sw);const valid=sw.completed?timerValidity(def,ms):null;
 const standard=def.standard||'';const state=sw.running?'RUNNING':sw.completed?'RECORDED':'READY';
 $('assessmentStopwatch').innerHTML=`<div class="stopwatchCard ${valid===false?'fail':valid===true&&def.requiredForPass?'ok':''}"><div><small>ASSESSMENT STOPWATCH</small><h3>${esc(def.label||'Assessment Stopwatch')}</h3><span class="tiny">${esc(standard)}${standard?' · ':''}${esc(state)}</span></div><div class="stopwatchValue">${fmtMs(ms)}</div><div class="stopwatchActions">${!ev.finalizedAt?`${sw.running?`<button class="btn danger" id="stopwatchToggle">${esc(def.stopLabel||'STOP')}</button>`:sw.completed?'':`<button class="btn primary" id="stopwatchToggle">${esc(def.startLabel||'START')}</button>`}<button class="btn ghost" id="stopwatchReset">Reset</button>`:''}</div></div>`;
 const tog=$('stopwatchToggle');if(tog)tog.onclick=toggleStopwatch;const rst=$('stopwatchReset');if(rst)rst.onclick=resetStopwatch;
}
function toggleStopwatch(){const ev=getEval();if(!ev||ev.finalizedAt)return;const sw=ev.stopwatch||(ev.stopwatch={elapsedMs:0,running:false,startedAt:null,completed:false,stoppedAt:null});if(!sw.running&&!sw.completed){sw.running=true;sw.startedAt=now();}else if(sw.running){sw.elapsedMs+=(now()-sw.startedAt);sw.running=false;sw.startedAt=null;sw.completed=true;sw.stoppedAt=now();}saveDb();renderStopwatch();}
function resetStopwatch(){const ev=getEval();if(!ev||ev.finalizedAt)return;if(!confirm('Reset the assessment stopwatch? This removes the recorded assessment duration for this in-progress evaluation.'))return;ev.stopwatch={elapsedMs:0,running:false,startedAt:null,completed:false,stoppedAt:null};saveDb();renderStopwatch();}
function currentTimerElapsed(t){return t.running?t.elapsedMs+(now()-t.startedAt):t.elapsedMs;}
function timerValidity(def,ms){if(def.minMs!=null&&ms<def.minMs)return false;if(def.maxMs!=null&&ms>def.maxMs)return false;return true;}
function renderTimers(tickOnly=false){const s=skill(),ev=getEval();if(!s||!ev)return;const defs=s.timers||[];$('timerStrip').innerHTML=defs.length?defs.map(def=>{const t=ev.timers[def.id]||(ev.timers[def.id]={elapsedMs:0,running:false,startedAt:null,completed:false,valid:null}),ms=currentTimerElapsed(t),valid=t.completed?timerValidity(def,ms):null;const standard=def.standard||(def.minMs!=null&&def.maxMs!=null?`${def.minMs/1000}–${def.maxMs/1000}s`:def.maxMs!=null?`≤ ${def.maxMs/1000}s`:def.minMs!=null?`≥ ${def.minMs/1000}s`:'');return `<div class="timerCard ${valid===true?'ok':valid===false?'fail':''}"><header><b>${esc(def.label)}</b><span class="tiny">${esc(standard)}</span></header><div class="timerValue">${fmtMs(ms)}</div><div class="timerBtns">${!ev.finalizedAt?`<button class="btn ${t.running?'danger':'primary'}" data-timer-toggle="${def.id}">${esc(t.running?(def.stopLabel||'STOP'):(def.startLabel||'START'))}</button><button class="btn ghost" data-timer-reset="${def.id}">Reset</button>`:''}</div><div class="tiny">${esc(def.description||'')}</div></div>`;}).join(''):'';document.querySelectorAll('[data-timer-toggle]').forEach(b=>b.onclick=()=>toggleTimer(b.dataset.timerToggle));document.querySelectorAll('[data-timer-reset]').forEach(b=>b.onclick=()=>resetTimer(b.dataset.timerReset));}
function toggleTimer(id){const ev=getEval(),def=skill().timers.find(t=>t.id===id),t=ev.timers[id];if(ev.finalizedAt)return;if(!t.running){t.running=true;t.startedAt=now();t.completed=false;t.valid=null;}else{t.elapsedMs+=now()-t.startedAt;t.running=false;t.startedAt=null;t.completed=true;t.valid=timerValidity(def,t.elapsedMs);if(def.autoFail&&def.linkedItemId&&!t.valid){saveDb();renderTimers();return beginFailureClassification(def.linkedItemId,{forcedMode:'timing-sequence',timerId:id});}}saveDb();renderTimers();renderEvalKpis();}
function resetTimer(id){const ev=getEval();if(ev.finalizedAt)return;if(!confirm('Reset this timer? This is an evaluator action and should only be used before finalization.'))return;ev.timers[id]={elapsedMs:0,running:false,startedAt:null,completed:false,valid:null};saveDb();renderTimers();}
function renderCriteria(){const s=skill(),ev=getEval(),sec=s.sections[currentSection];const locked=!!ev.finalizedAt;$('criteriaList').innerHTML=sec.items.map(i=>{const r=ev.ratings[i.id]||'',d=ev.failureDetails[i.id];return `<div class="criterion ${i.critical?'critical ':''}${r}" id="crit-${i.id}"><div><div class="criterionCode">${esc(i.id)}${i.critical?'<span class="critBadge">CRITICAL</span>':''}</div><p>${esc(i.text)}</p></div><div class="ratingBtns">${['pass','fail','nt','no'].map(v=>{const lab=v==='pass'?'PASS':v==='fail'?'FAIL':v==='nt'?'NT':'N/O';const disabled=locked||(v==='nt'&&i.critical);return `<button class="ratingBtn ${v} ${r===v?'active':''}" data-rate="${v}" data-item="${i.id}" ${disabled?'disabled':''}>${lab}</button>`;}).join('')}</div>${r==='fail'&&d?`<div class="failureDetail"><b>${esc(d.modeLabel)}</b> → ${esc(d.contributorLabel)}${d.comment?` · ${esc(d.comment)}`:''}</div>`:''}</div>`;}).join('');document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>setRating(b.dataset.item,b.dataset.rate));$('prevSectionBtn').disabled=currentSection===0;$('nextSectionBtn').disabled=currentSection===s.sections.length-1;}
function setRating(id,rating){const ev=getEval(),i=itemById(id);if(!ev||ev.finalizedAt||!i)return;if(rating==='fail')return beginFailureClassification(id);if(rating==='nt'&&i.critical){alert('Critical criteria cannot be marked NT.');return;}if(rating==='nt')return requestNt(id);ev.ratings[id]=rating;if(rating!=='fail')delete ev.failureDetails[id];saveDb();renderCriteria();renderEvalKpis();}
function requestNt(id){openModal('Not Tested — scenario did not elicit criterion',`<p>NT may be used only for a <b>noncritical criterion</b> that the approved scenario did not elicit. It may not excuse an observed error or omission.</p><form id="ntForm"><div class="formGrid"><label class="full"><span>Objective scenario note (optional)</span><textarea name="detail" rows="3" placeholder="Briefly document why the approved scenario did not elicit this criterion"></textarea></label></div><div class="actionsRow spaced"><button class="btn primary" type="submit">Apply NT</button></div></form>`);$('ntForm').onsubmit=e=>{e.preventDefault();const ev=getEval();ev.ratings[id]='nt';ev.ntReasons[id]={code:'scenario-not-elicited',label:'Approved scenario did not elicit criterion',detail:new FormData(e.target).get('detail')||'',at:now()};delete ev.failureDetails[id];saveDb();closeModal();renderCriteria();renderEvalKpis();};}
function beginFailureClassification(id,opts={}){const ev=getEval(),i=itemById(id);if(!ev||ev.finalizedAt||!i)return;const prior=ev.failureDetails[id]||{};chooseFailureMode(id,opts.forcedMode||prior.mode||'');}
function chooseFailureMode(id,selected=''){
 openModal(`FAIL — ${id}`,`<div class="progressSteps">Step 1 of 2 · Failure mode</div><p>Select <b>one</b> observed failure mode. Exactly five live choices are available.</p><div class="choiceGrid">${FAILURE_MODES.map(x=>`<button class="choiceBtn" type="button" data-mode="${x.id}"><b>${esc(x.label)}</b><span>${esc(x.desc)}</span></button>`).join('')}</div>`);
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>chooseContributor(id,b.dataset.mode));
}
function chooseContributor(id,mode){
 const m=FAILURE_MODES.find(x=>x.id===mode);openModal(`FAIL — ${id}`,`<div class="progressSteps">Step 2 of 2 · Primary contributor</div><p><b>${esc(m.label)}</b> selected. Now choose <b>one</b> primary contributor.</p><div class="choiceGrid">${CONTRIBUTORS.map(x=>`<button class="choiceBtn" type="button" data-contributor="${x.id}"><b>${esc(x.label)}</b><span>${esc(x.desc)}</span></button>`).join('')}</div>`);document.querySelectorAll('[data-contributor]').forEach(b=>b.onclick=()=>failureCommentStep(id,mode,b.dataset.contributor));
}
function failureCommentStep(id,mode,contributor){const m=FAILURE_MODES.find(x=>x.id===mode),c=CONTRIBUTORS.find(x=>x.id===contributor),required=mode==='other-unclear';openModal(`Record FAIL — ${id}`,`<div class="reviewBox"><b>${esc(m.label)}</b><br>${esc(c.label)}</div><form id="failureSaveForm"><div class="formGrid"><label class="full"><span>Objective evaluator comment ${required?'*':'(optional)'}</span><textarea name="comment" rows="3" ${required?'required':''} placeholder="Document concise observable facts; avoid speculative labels"></textarea></label></div><div class="actionsRow spaced"><button class="btn primary" type="submit">Record FAIL</button></div></form>`);$('failureSaveForm').onsubmit=e=>{e.preventDefault();const comment=String(new FormData(e.target).get('comment')||'').trim();if(required&&!comment){alert('Other / unclear requires a brief objective comment.');return;}const ev=getEval();ev.ratings[id]='fail';ev.failureDetails[id]={mode,modeLabel:m.label,contributor,contributorLabel:c.label,comment,at:now()};saveDb();closeModal();renderCriteria();renderEvalKpis();};}
function nextUnresolved(){const ev=getEval(),s=skill();const items=allItems(s);const start=items.findIndex(i=>s.sections[currentSection].items.some(x=>x.id===i.id));const ordered=items.slice(start).concat(items.slice(0,start));const hit=ordered.find(i=>{const r=ev.ratings[i.id],d=ev.failureDetails[i.id];return !r||r==='no'||(i.critical&&r==='nt')||(r==='fail'&&(!d?.mode||!d?.contributor||(d.mode==='other-unclear'&&!d.comment)));});if(!hit){toast('No unresolved criteria.');return;}currentSection=s.sections.findIndex(sec=>sec.items.some(i=>i.id===hit.id));renderCriteria();$('sectionSelect').value=String(currentSection);setTimeout(()=>document.getElementById(`crit-${hit.id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),0);}
function reviewFinalize(){const ev=getEval(),s=skill(),fin=finalizable(ev,s),st=fin.score;if(!fin.ok){const issues=[];if(st.unresolved)issues.push(`${st.unresolved} criterion/classification issue(s)`);if(fin.running)issues.push('stop all running clocks');if(!fin.stopwatchReady)issues.push('start and stop the assessment stopwatch');alert(`Cannot finalize. ${issues.join('; ')}.`);return;}const predicted=(st.criticalFail===0&&st.percent>=s.threshold&&!st.stopwatchInvalid)?'PASS':'FAIL';const swMs=ev.stopwatch?.elapsedMs||0;openModal('Evaluation Review',`<div class="reviewBox"><h3>${predicted}</h3><p>Score: <b>${st.pass}/${st.denom} (${pct(st.percent)})</b> · NT excluded</p><p>Critical failures: <b>${st.criticalFail}</b></p><p>Assessment duration: <b>${fmtMs(swMs)}</b>${st.stopwatchInvalid?' · <b>time standard not met</b>':''}</p><p>PASS requires ≥ ${Math.round(s.threshold*100)}%, no failed critical criteria${s.stopwatch?.requiredForPass?', and the overall time standard':''}.</p></div><p>Finalization locks this formal measurement. Educational remediation should occur only after the measurement record is complete.</p><button id="finalizeConfirm" class="btn primary">Finalize ${predicted}</button>`);$('finalizeConfirm').onclick=()=>{ev.evaluatorName=$('evalName').value.trim();ev.evaluatorId=$('evalId').value.trim();ev.notes=$('overallNotes').value.trim();ev.finalizedAt=now();ev.finalResult=predicted;saveDb();closeModal();renderEvaluation();toast(`Evaluation finalized: ${predicted}`);};}
function voidAttempt(){const p=participant(),ev=getEval();if(!p||!ev||ev.finalizedAt){alert('Only an in-progress evaluation may be voided here. Finalized corrections require controlled data management outside this prototype.');return;}const reason=prompt('Administrative reason for void/retest:');if(!reason)return;p.voids.push({...deep(ev),voidedAt:now(),voidReason:reason});p.evaluation=null;saveDb();renderEvent();toast('Attempt voided; audit copy retained.');}

function exportEventCsv(){const e=event(),s=skill(e),headers=['event_id','event_name','date','timepoint','study_arm','majcom','home_installation_id','home_installation_name','unit','training_location','skill_id','skill_source','participant_id','afsc','clinical_years','work_section','practice_sessions','repetitions','coaching_events','trials_to_mastery','training_minutes','assessment_stopwatch_seconds','finalized_at','final_result','score_percent','critical_fail_count','criterion_id','criterion_text','critical','rating','failure_mode','primary_contributor','comment','evaluator_id','app_version'];const rows=[headers];e.participants.forEach(p=>{const ev=p.evaluation,sc=ev?scoring(ev,s):null;allItems(s).forEach(i=>{const d=ev?.failureDetails?.[i.id]||{};rows.push([e.id,e.name,e.date,e.timepoint,e.studyArm,e.majcom,e.homeInstallationId,eventHomeName(e),e.unit,e.trainingLocation,e.skillId,s.source,p.participantId,p.afsc,p.clinicalYears,p.workSection,p.intervention?.sessions||0,p.intervention?.repetitions||0,p.intervention?.coachingEvents||0,p.intervention?.trialsToMastery||0,p.intervention?.trainingMinutes||0,ev?.stopwatch?.completed?Math.round((ev.stopwatch.elapsedMs||0)/1000):'',ev?.finalizedAt?new Date(ev.finalizedAt).toISOString():'',ev?.finalResult||'',sc?.percent==null?'':(sc.percent*100).toFixed(1),sc?.criticalFail??'',i.id,i.text,i.critical?'Y':'N',ev?.ratings?.[i.id]||'',d.modeLabel||'',d.contributorLabel||'',d.comment||'',ev?.evaluatorId||'',BUILD.versionName]);});});download(`FieldReady_${safeName(e.name)}_${e.date}.csv`,rows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');}
function safeName(s){return String(s||'export').replace(/[^a-z0-9_-]+/gi,'_');}
function managementSummaryCsv(){const events=scopedEvents(),headers=['event_id','event_name','date','timepoint','study_arm','majcom','home_installation','skill','participants','finalized','pass','mean_score','critical_fail'];const rows=[headers];events.forEach(e=>{const a=eventAnalytics(e);rows.push([e.id,e.name,e.date,e.timepoint,e.studyArm,e.majcom,eventHomeName(e),SKILLS[e.skillId]?.shortName||e.skillId,e.participants.length,a.rows.length,a.pass,a.avg==null?'':(a.avg*100).toFixed(1),a.crit]);});download('FieldReady_Management_Summary.csv',rows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');}
function enterpriseCsv(){const saved=currentEventId;const events=scopedEvents();const out=[];events.forEach(e=>{currentEventId=e.id;const s=SKILLS[e.skillId],headers=['event_id','event_name','date','timepoint','study_arm','majcom','installation','skill','participant_id','afsc','clinical_years','work_section','final_result','score_percent','assessment_stopwatch_seconds','criterion_id','critical','rating','failure_mode','primary_contributor'];e.participants.forEach(p=>{const ev=p.evaluation,sc=ev?scoring(ev,s):null;allItems(s).forEach(i=>{const d=ev?.failureDetails?.[i.id]||{};out.push([e.id,e.name,e.date,e.timepoint,e.studyArm,e.majcom,eventHomeName(e),e.skillId,p.participantId,p.afsc,p.clinicalYears,p.workSection,ev?.finalResult||'',sc?.percent==null?'':(sc.percent*100).toFixed(1),ev?.stopwatch?.completed?Math.round((ev.stopwatch.elapsedMs||0)/1000):'',i.id,i.critical?'Y':'N',ev?.ratings?.[i.id]||'',d.modeLabel||'',d.contributorLabel||'']);});});});currentEventId=saved;const headers=['event_id','event_name','date','timepoint','study_arm','majcom','installation','skill','participant_id','afsc','clinical_years','work_section','final_result','score_percent','assessment_stopwatch_seconds','criterion_id','critical','rating','failure_mode','primary_contributor'];download('FieldReady_Enterprise_Detail.csv',[headers,...out].map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');}

function openSyncPanel(){
 const s=SYNC?.status?.()||{code:'local',label:'LOCAL ONLY',detail:'Backend sync is unavailable.'};
 const sess=SYNC?.session?.();
 if(!SYNC?.configured?.()){
  openModal('FieldReady synchronization',`<div class="reviewBox"><b>${esc(s.label)}</b><p>${esc(s.detail)}</p></div><p>The NUC backend is intentionally disabled until the dedicated FieldReady Supabase endpoint and public anon key are configured.</p><p class="tiny">RaPS remains separate and is not modified by this FieldReady configuration.</p>`);
  return;
 }
 if(!sess?.access_token){
  closeModal();
  $('safeguard').classList.remove('hidden');
  $('accessError').textContent='Your FieldReady session ended. Sign in again.';
  $('accessError').classList.remove('hidden');
  syncAccessButton();
  setTimeout(()=>$('accessEmail')?.focus(),50);
  return;
 }
 openModal('FieldReady synchronization',`<div class="reviewBox"><b>${esc(s.label)}</b><p>${esc(s.detail)}</p></div><p>Signed in as <b>${esc(sess.user?.email||'FieldReady user')}</b>.</p><div class="actionsRow"><button id="syncNowBtn" class="btn primary">Sync now</button><button id="syncSignOutBtn" class="btn ghost">Sign out</button></div>`);
 $('syncNowBtn').onclick=async()=>{try{await SYNC.syncNow(db);closeModal();toast('FieldReady synchronized.');renderHome();}catch(x){alert('Sync failed: '+(x.message||x));}};
 $('syncSignOutBtn').onclick=async()=>{closeModal();await lockFieldReady();};
}
function backupAll(){download(`FieldReady_Backup_${isoDate()}.json`,JSON.stringify(db,null,2),'application/json');}
function restoreAll(file){const r=new FileReader();r.onload=()=>{try{const x=normalizeDb(JSON.parse(r.result));if(!x)throw new Error('Invalid backup');if(!confirm(`Restore ${x.events.length} study event(s)? This replaces current local data.`))return;db=x;saveDb();renderHome();toast('Backup restored.');}catch(err){alert(`Restore failed: ${err.message}`);}};r.readAsText(file);}

function syncAccessButton(){
  const ack=$('ackCheck').checked;
  const email=String($('accessEmail')?.value||'').trim();
  const pw=String($('accessPassword')?.value||'');
  $('enterBtn').disabled=!ack||!email||!pw||!SYNC?.configured?.();
}
async function unlockFieldReady(){
  const err=$('accessError');
  err?.classList.add('hidden');
  if(!$('ackCheck').checked){syncAccessButton();return;}
  if(!SYNC?.configured?.()){
    err.textContent='FieldReady backend is not configured.';
    err.classList.remove('hidden');
    return;
  }
  const email=String($('accessEmail')?.value||'').trim();
  const password=String($('accessPassword')?.value||'');
  try{
    $('enterBtn').disabled=true;
    const auth=await SYNC.signIn(email,password);
    setAccountUi(auth?.profile||await SYNC.currentProfile());
    await SYNC.syncNow(db);
    $('safeguard').classList.add('hidden');
    $('accessPassword').value='';
    renderHome();
    toast('Signed in and synchronized.');
  }catch(e){
    err.textContent=e?.message||'Unable to sign in.';
    err.classList.remove('hidden');
    $('accessPassword').select();
  }finally{
    syncAccessButton();
  }
}
async function lockFieldReady(){
  try{await SYNC?.signOut?.();}catch{}
  setAccountUi(null);
  $('ackCheck').checked=false;
  $('accessPassword').value='';
  $('safeguard').classList.remove('hidden');
  syncAccessButton();
  setTimeout(()=>$('accessEmail')?.focus(),50);
  toast('FieldReady signed out.');
}
$('ackCheck').onchange=syncAccessButton;
$('accessEmail').oninput=syncAccessButton;
$('accessPassword').oninput=syncAccessButton;
$('accessEmail').onkeydown=e=>{if(e.key==='Enter'&&!$('enterBtn').disabled)unlockFieldReady();};
$('accessPassword').onkeydown=e=>{if(e.key==='Enter'&&!$('enterBtn').disabled)unlockFieldReady();};
$('enterBtn').onclick=unlockFieldReady;
$('requestAccountBtn').onclick=openAccountRequest;
$('lockBtn').onclick=lockFieldReady;
async function handleAuthCallback(){
 let cb=null;
 try{cb=await SYNC?.acceptAuthCallback?.();}catch(e){
  const err=$('accessError');err.textContent=e?.message||'Unable to process FieldReady authentication link.';err.classList.remove('hidden');return false;
 }
 if(!cb)return false;

 if(cb.type==='invite'||cb.type==='recovery'){
  openModal('Set your FieldReady password',`
   <p>Your identity has been verified. Create the password you will use for FieldReady.</p>
   <form id="invitePasswordForm">
    <div class="formGrid">
     <label><span>New password</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
     <label><span>Confirm password</span><input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label>
    </div>
    <div id="invitePasswordError" class="accessError hidden"></div>
    <div class="actionsRow spaced"><button class="btn primary" type="submit">Set password & enter FieldReady</button></div>
   </form>`);
  $('invitePasswordForm').onsubmit=async e=>{
   e.preventDefault();const fd=new FormData(e.target),pw=String(fd.get('password')||''),confirm=String(fd.get('confirm')||''),err=$('invitePasswordError');err.classList.add('hidden');
   if(pw!==confirm){err.textContent='Passwords do not match.';err.classList.remove('hidden');return;}
   const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;
   try{
    await SYNC.updatePassword(pw);
    const profile=await SYNC.requireAuthorizedProfile();
    setAccountUi(profile);
    $('safeguard').classList.add('hidden');
    closeModal();
    await SYNC.syncNow(db);
    renderHome();
    toast('FieldReady account activated.');
   }catch(ex){err.textContent=ex?.message||'Unable to set password.';err.classList.remove('hidden');}
   finally{btn.disabled=false;}
  };
  return true;
 }

 if(cb.type==='signup'){
  try{await SYNC.signOut();}catch{}
  setAccountUi(null);
  $('safeguard').classList.remove('hidden');
  const err=$('accessError');err.textContent='Email confirmed. Your FieldReady account request is waiting for administrator approval.';err.classList.remove('hidden');
  return true;
 }
 return false;
}

async function restoreAuthorizedSession(){
 if(!SYNC?.session?.()?.access_token){
  setAccountUi(null);
  setTimeout(()=>{$('accessEmail')?.focus();syncAccessButton();},50);
  return;
 }
 try{
  const profile=await SYNC.requireAuthorizedProfile();
  setAccountUi(profile);
  $('safeguard').classList.add('hidden');
 }catch(e){
  try{await SYNC.signOut();}catch{}
  setAccountUi(null);
  $('safeguard').classList.remove('hidden');
  const err=$('accessError');err.textContent=e?.message||'This account is not authorized for FieldReady.';err.classList.remove('hidden');
 }
}
handleAuthCallback().then(handled=>{if(!handled)restoreAuthorizedSession();});
$('versionBadge').textContent=`v${BUILD.versionName}`;$('adminBtn').onclick=renderAdmin;$('inviteUserBtn').onclick=openInviteUser;$('homeBrand').onclick=renderHome;document.querySelectorAll('[data-home]').forEach(b=>b.onclick=renderHome);$('newEventBtn').onclick=()=>showEventForm();$('editEventBtn').onclick=()=>showEventForm(event());$('addParticipantBtn').onclick=()=>showParticipantForm();$('exportEventBtn').onclick=exportEventCsv;$('backupAllBtn').onclick=backupAll;$('restoreBtn').onclick=()=>$('restoreInput').click();$('restoreInput').onchange=e=>{if(e.target.files[0])restoreAll(e.target.files[0]);e.target.value='';};$('modalClose').onclick=closeModal;$('modal').onclick=e=>{if(e.target===$('modal'))closeModal();};
$('filterMajcom').onchange=e=>{filters.majcom=e.target.value;filters.base='';renderHomeSilently();};$('filterBase').onchange=e=>{filters.base=e.target.value;renderManagement();};$('filterSkill').onchange=e=>{filters.skill=e.target.value;renderManagement();};$('filterArm').onchange=e=>{filters.arm=e.target.value;renderManagement();};$('filterTime').onchange=e=>{filters.timepoint=e.target.value;renderManagement();};$('resetFiltersBtn').onclick=()=>{filters={majcom:'',base:'',skill:'',arm:'',timepoint:''};renderHomeSilently();};$('managementCsvBtn').onclick=managementSummaryCsv;$('enterpriseCsvBtn').onclick=enterpriseCsv;
$('backRosterBtn').onclick=renderEvent;$('backParticipantsBtn').onclick=renderHome;$('sectionSelect').onchange=e=>{currentSection=Number(e.target.value);renderCriteria();};$('prevSectionBtn').onclick=()=>{if(currentSection>0){currentSection--;renderCriteria();$('sectionSelect').value=String(currentSection);}};$('nextSectionBtn').onclick=()=>{if(currentSection<skill().sections.length-1){currentSection++;renderCriteria();$('sectionSelect').value=String(currentSection);}};$('nextUnresolvedBtn').onclick=nextUnresolved;$('evalName').onchange=e=>{getEval().evaluatorName=e.target.value;saveDb();};$('evalId').onchange=e=>{getEval().evaluatorId=e.target.value;saveDb();};$('overallNotes').onchange=e=>{getEval().notes=e.target.value;saveDb();};$('reviewFinalizeBtn').onclick=reviewFinalize;$('voidAttemptBtn').onclick=voidAttempt;

$('syncStatusBtn').onclick=openSyncPanel;
window.addEventListener('fieldready:remote-db',e=>{
 const remote=normalizeDb(e.detail?.db);
 if(!remote)return;

 const activeView=document.querySelector('.view.active')?.id||'homeView';

 db=remote;
 localStorage.setItem(DB_KEY,JSON.stringify(db));

 // Synchronization must never eject an evaluator from the workflow they are
 // actively using. Refresh the current screen in place after reconciliation.
 if(activeView==='evalView'&&event()&&participant()&&getEval()){
  renderEvaluation();
 }else if(activeView==='eventView'&&event()){
  renderEvent();
 }else if(activeView==='participantView'&&currentRecordKey){
  renderLongitudinalRecord();
 }else if(activeView==='adminView'&&currentAccessProfile?.role==='enterprise'){
  renderAdmin();
 }else{
  renderHome();
 }

 toast('FieldReady server data refreshed.');
});
SYNC?.init?.({getDb:()=>db});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
renderHome();
})();
