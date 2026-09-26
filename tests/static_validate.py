from pathlib import Path
import re, sys, subprocess, json, tempfile

root=Path(__file__).resolve().parents[1]
errors=[]
required=['index.html','styles.css','version.js','access-config.js','backend-config.js','locations.js','skills.js','sync.js','app.js','manifest.webmanifest','sw.js','README.md','DATA_DICTIONARY.md','VALIDATION.md','SOURCE_MAPPING.md','PAGE4_FAILURE_WORKFLOW.md','.nojekyll','assets/icon.svg']
for f in required:
    if not (root/f).exists(): errors.append(f'Missing {f}')

app=(root/'app.js').read_text(encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8')
skills_text=(root/'skills.js').read_text(encoding='utf-8')
version=(root/'version.js').read_text(encoding='utf-8')

# Live taxonomy must be exactly 5 + 5.
m=re.search(r'const FAILURE_MODES=\[(.*?)\];\s*const CONTRIBUTORS=\[(.*?)\];',app,re.S)
if not m:
    errors.append('Could not find live failure taxonomy')
else:
    modes=len(re.findall(r"\{id:'",m.group(1)))
    contrib=len(re.findall(r"\{id:'",m.group(2)))
    if modes!=5: errors.append(f'FAILURE_MODES count={modes}, expected 5')
    if contrib!=5: errors.append(f'CONTRIBUTORS count={contrib}, expected 5')
for legacy in ['Unclassified / review later','Wrong sequence','Training deficiency','Evaluator / administrative']:
    if legacy in app: errors.append(f'Legacy live taxonomy text found in app.js: {legacy}')
for marker in ['Step 1 of 2 · Failure mode','Step 2 of 2 · Primary contributor']:
    if marker not in app: errors.append(f'Missing sequential workflow marker: {marker}')

# Evaluate skills.js in Node to validate the actual runtime object, not just text fragments.
inspect_js = r'''
global.window={};
require(process.argv[1]);
const S=window.FIELDREADY_SKILLS;
const out={};
for (const [k,s] of Object.entries(S)) {
  out[k]={
    name:s.name,
    itemIds:s.sections.flatMap(sec=>sec.items.map(i=>i.id)),
    sections:s.sections.map(sec=>({code:sec.code,title:sec.title,itemIds:sec.items.map(i=>i.id)})),
    stopwatch:s.stopwatch||null,
    timers:s.timers||[]
  };
}
process.stdout.write(JSON.stringify(out));
'''
try:
    p=subprocess.run(['node','-e',inspect_js,str(root/'skills.js')],capture_output=True,text=True,check=False)
    if p.returncode:
        errors.append('Unable to evaluate skills.js: '+p.stderr.strip())
        S={}
    else:
        S=json.loads(p.stdout)
except FileNotFoundError:
    errors.append('Node is required for runtime object validation')
    S={}

expected_counts={'TQ':15,'NPA':13,'NDC':15,'BLOOD':26}
for key,count in expected_counts.items():
    got=len(S.get(key,{}).get('itemIds',[]))
    if got!=count: errors.append(f'{key} criteria count={got}, expected {count}')

# Full RaPS Tier 3 CMC sequence: 123 source IDs + one DAF MACE2 supplemental criterion.
cmc=S.get('CMC',{})
cmc_ids=cmc.get('itemIds',[])
source_ids=[x for x in cmc_ids if re.fullmatch(r'CMC-\d{3}',x)]
expected_source=[f'CMC-{i:03d}' for i in range(1,124)]
if sorted(source_ids)!=expected_source:
    missing=[x for x in expected_source if x not in source_ids]
    extra=[x for x in source_ids if x not in expected_source]
    errors.append(f'CMC source ID sequence mismatch; missing={missing[:8]} extra={extra[:8]}')
if 'CMC-DAF-MACE2' not in cmc_ids: errors.append('CMC missing CMC-DAF-MACE2')
if len(cmc_ids)!=124: errors.append(f'CMC total criteria count={len(cmc_ids)}, expected 124 (123 source + MACE2)')

sections={x['code']:x for x in cmc.get('sections',[])}
for code in ['CUF','TFC','M','A','R','C','H','H2','P','ABX','W','S','CPR','COMMS','DOC','EVAC']:
    if code not in sections: errors.append(f'CMC missing section {code}')
if 'H' in sections and 'CMC-086' not in sections['H']['itemIds']:
    errors.append('CMC-086 must be in H section to match RaPS Tier 3')
if 'H2' in sections:
    for x in ['CMC-070','CMC-093','CMC-DAF-MACE2']:
        if x not in sections['H2']['itemIds']: errors.append(f'{x} must be in H2 section')
if 'ABX' in sections and sections['ABX']['itemIds']!=['CMC-100','CMC-101','CMC-102','CMC-103']:
    errors.append('CMC ABX section must contain separate CMC-100 through CMC-103 rows')

# Universal assessment stopwatch. CMC additionally carries the 30-min pass standard.
for key in ['TQ','NPA','NDC','BLOOD','CMC']:
    sw=S.get(key,{}).get('stopwatch')
    if not sw: errors.append(f'{key} missing assessment stopwatch')
    elif not sw.get('requiredForFinalization'): errors.append(f'{key} stopwatch must be required for finalization')
cmc_sw=cmc.get('stopwatch') or {}
if cmc_sw.get('maxMs')!=1800000 or cmc_sw.get('standard')!='≤ 30:00' or not cmc_sw.get('requiredForPass'):
    errors.append('CMC overall stopwatch must match RaPS ≤30:00 required-for-pass rule')

# Exact CMC clinical clock set and standards.
expected_timers={
 'cmc_cuf_tq':('CMC-005',None,60000,'≤ 1:00'),
 'cmc_wound_pressure':('CMC-014',180000,None,'≥ 3:00'),
 'cmc_ndc_hold':('CMC-034',5000,10000,'5–10 sec'),
 'cmc_hts_admin':('CMC-080',600000,None,'≥ 10:00'),
 'cmc_hts_repeat':('CMC-081',1200000,None,'≥ 20:00'),
 'cmc_neuro_reassess':('CMC-084',300000,600000,'5–10 min'),
}
actual={t['id']:t for t in cmc.get('timers',[])}
if set(actual)!=set(expected_timers): errors.append(f'CMC timer IDs={sorted(actual)}, expected={sorted(expected_timers)}')
for tid,(linked,minms,maxms,std) in expected_timers.items():
    t=actual.get(tid,{})
    if t.get('linkedItemId')!=linked: errors.append(f'{tid} linked item={t.get("linkedItemId")}, expected {linked}')
    if t.get('minMs')!=minms: errors.append(f'{tid} minMs={t.get("minMs")}, expected {minms}')
    if t.get('maxMs')!=maxms: errors.append(f'{tid} maxMs={t.get("maxMs")}, expected {maxms}')
    if t.get('standard')!=std: errors.append(f'{tid} standard={t.get("standard")}, expected {std}')

# Targeted skill timing standards.
tq_timers={t['id']:t for t in S.get('TQ',{}).get('timers',[])}
if tq_timers.get('TQ-1MIN',{}).get('maxMs')!=60000: errors.append('TQ 1-minute clock missing/mismatched')
if tq_timers.get('TQ-3MIN',{}).get('maxMs')!=180000: errors.append('TQ 3-minute clock missing/mismatched')
ndc_timers={t['id']:t for t in S.get('NDC',{}).get('timers',[])}
if ndc_timers.get('NDC-HOLD',{}).get('minMs')!=5000 or ndc_timers.get('NDC-HOLD',{}).get('maxMs')!=10000:
    errors.append('NDC 5–10 second hold clock missing/mismatched')

# Longitudinal participant record hooks.
for id_ in ['participantIndex','participantView','timepointCards','criterionComparison','assessmentStopwatch']:
    if f'id="{id_}"' not in html: errors.append(f'Missing longitudinal/stopwatch DOM id: {id_}')
for fn in ['renderParticipantIndex','openLongitudinalRecord','renderLongitudinalRecord','exportLongitudinalRecord','renderStopwatch','toggleStopwatch']:
    if f'function {fn}' not in app: errors.append(f'Missing app function: {fn}')
for tp in ["'baseline'","'3-month'","'6-month'"]:
    if tp not in app: errors.append(f'Missing study timepoint in app.js: {tp}')
if 'assessment_stopwatch_seconds' not in app: errors.append('Exports missing assessment_stopwatch_seconds')
if '4.2.0-study-web' not in version: errors.append('version.js not updated to 4.2.0-study-web')


# Single FieldReady login gate. Supabase Auth is the only credential check.
access=(root/'access-config.js').read_text(encoding='utf-8') if (root/'access-config.js').exists() else ''
for id_ in ['accessEmail','accessPassword','accessError','ackCheck','enterBtn','lockBtn']:
    if f'id="{id_}"' not in html: errors.append(f'Missing login-gate DOM id: {id_}')
if "mode: 'supabase'" not in access: errors.append('access-config.js must declare Supabase login mode')
for fn in ['unlockFieldReady','lockFieldReady']:
    if f'function {fn}' not in app: errors.append(f'Missing login function: {fn}')
if 'SYNC.signIn(email,password)' not in app: errors.append('Opening login must authenticate with FieldReady Supabase Auth')
if 'syncLoginForm' in app: errors.append('Separate synchronization login form must not remain')

# Backend foundation hooks.
backend=(root/'backend-config.js').read_text(encoding='utf-8') if (root/'backend-config.js').exists() else ''
sync=(root/'sync.js').read_text(encoding='utf-8') if (root/'sync.js').exists() else ''
if 'FIELDREADY_BACKEND' not in backend: errors.append('backend-config.js missing FIELDREADY_BACKEND')
if 'FieldReadySync' not in sync: errors.append('sync.js missing FieldReadySync')
if 'syncStatusBtn' not in html: errors.append('index.html missing sync status control')

# Service worker must never cache/intercept cross-origin backend API GETs.
sw_text=(root/'sw.js').read_text(encoding='utf-8') if (root/'sw.js').exists() else ''
if 'url.origin!==self.location.origin' not in sw_text:
    errors.append('Service worker must bypass cross-origin backend/API requests')

# Sync must protect newer local edits from an older in-flight pull.
if 'changeGeneration' not in sync or 'rerunAfterBusy' not in sync:
    errors.append('sync.js missing in-flight local-change protection')
if 'if(changeGeneration!==startedGeneration)' not in sync:
    errors.append('sync.js must reject stale pull snapshots after concurrent local edits')
if 'evaluatorPushScope' not in sync:
    errors.append('Evaluator sync must filter local rows to events visible/owned by that evaluator')
if "profile?.role==='evaluator'" not in sync:
    errors.append('Evaluator-specific sync isolation guard missing')
if 'managerPushScope' not in sync:
    errors.append('Manager sync must filter local rows to the account membership scope')
if "profile?.role==='program_manager'||profile?.role==='majcom_manager'" not in sync:
    errors.append('Scoped manager sync isolation guard missing')
if 'currentMembership' not in sync:
    errors.append('Scoped manager sync must load the active account membership')
if '_syncDirtyEvent' not in app or '_syncDirtyEvent' not in sync:
    errors.append('Manager event edits must be tracked so unchanged server events are not rewritten')
if "managerPushScope(x,profile,membership,serverEvents,userId)" not in sync:
    errors.append('Manager sync must distinguish existing server events from new local events')
if 'insertRows(CFG.tables.events,newEvents)' not in sync:
    errors.append('Event sync must use plain INSERT for new events')
if 'patchRowsById(CFG.tables.events,changedEvents)' not in sync:
    errors.append('Event sync must PATCH existing edited events by id')
if "upsert(CFG.tables.events" in sync:
    errors.append('fr_events must never use generic upsert under hardened RLS')
if "_syncOwnerId" not in app or "_serverCreatedBy" not in sync:
    errors.append('Sync ownership markers required to prevent cross-account event pushes')
if "omit(e,['participants','_syncOwnerId','_serverCreatedBy'])" not in sync:
    errors.append('Sync-only ownership metadata must never be persisted in event payloads')

# Remote sync must preserve the evaluator's active workflow instead of forcing Home.
if "activeView=document.querySelector('.view.active')" not in app:
    errors.append('Remote sync must capture the active view before applying server data')
for required in ["activeView==='evalView'", "renderEvaluation()", "activeView==='eventView'", "renderEvent()"]:
    if required not in app: errors.append(f'Missing active-view sync preservation hook: {required}')

# Account request + enterprise administration workflow.
migration=(root/'supabase/002_account_administration.sql').read_text(encoding='utf-8') if (root/'supabase/002_account_administration.sql').exists() else ''
event_scope=(root/'supabase/003_event_scope_hardening.sql').read_text(encoding='utf-8') if (root/'supabase/003_event_scope_hardening.sql').exists() else ''
edge=(root/'supabase/functions/fieldready-account-admin/index.ts').read_text(encoding='utf-8') if (root/'supabase/functions/fieldready-account-admin/index.ts').exists() else ''
for id_ in ['requestAccountBtn','adminBtn','adminView','accountRequestsTable','accountUsersTable','inviteUserBtn']:
    if f'id="{id_}"' not in html: errors.append(f'Missing account administration DOM id: {id_}')
for fn in ['openAccountRequest','renderAdmin','openApproveRequest','openManageUser','openInviteUser','handleAuthCallback']:
    if f'function {fn}' not in app: errors.append(f'Missing account administration function: {fn}')
for marker in ['fr_account_requests','fr_approve_account_request','fr_deny_account_request','fr_set_user_access']:
    if marker not in migration: errors.append(f'Missing account administration migration marker: {marker}')
if 'fr_audit_governance_row' not in migration:
    errors.append('Account governance migration must use an audit trigger that supports fr_profiles.user_id keys')
if "execute function public.fr_audit_row()" in migration:
    errors.append('Account governance migration must not attach the id-only audit trigger to fr_profiles')
if 'as $\n' in migration or 'do $\n' in migration or '\n$;\n' in migration:
    errors.append('Account migration contains malformed single-dollar SQL quoting')
dollar=chr(36)
for quote in [f'{dollar}fr_audit{dollar}', f'{dollar}fr_triggers{dollar}']:
    if migration.count(quote)!=2:
        errors.append(f'Account migration dollar quote {quote} must appear exactly twice')
if 'SUPABASE_SERVICE_ROLE_KEY' not in edge or "role!=='enterprise'" not in edge:
    errors.append('Secure account invitation function must retain service-role server-side and enforce Enterprise role')
if 'service_role' in backend.lower():
    errors.append('backend-config.js must never contain a service-role credential')
if 'requireAuthorizedProfile' not in sync:
    errors.append('Sign-in must verify an active FieldReady profile')
if 'acceptAuthCallback' not in sync or 'updatePassword' not in sync:
    errors.append('Invite callback/password setup support missing')
if 'fr_can_manage_event_scope' not in event_scope:
    errors.append('Event scope hardening migration missing role-aware event scope function')
for marker in ['fr_events_read','fr_events_insert','fr_events_update','fr_events_lock_creator']:
    if marker not in event_scope: errors.append(f'Event scope hardening migration missing {marker}')
if 'accountEventScope' not in app or 'currentAccessMembership' not in app:
    errors.append('Event form must load and enforce current manager membership scope')
if "scope.role==='program_manager'" not in app or "scope.role==='majcom_manager'" not in app:
    errors.append('Event form missing Program/MAJCOM Manager scope restrictions')
if "scopedInstallation?.commands" not in app:
    errors.append('Program Manager event form must allow only commands valid for the scoped installation')

# JS syntax checks.
for f in ['version.js','access-config.js','backend-config.js','locations.js','skills.js','sync.js','app.js','sw.js']:
    try:
        p=subprocess.run(['node','--check',str(root/f)],capture_output=True,text=True)
        if p.returncode: errors.append(f'JS syntax {f}: {p.stderr.strip()}')
    except FileNotFoundError:
        break

if errors:
    print('STATIC VALIDATION FAILED')
    for e in errors: print(' -',e)
    sys.exit(1)
print('STATIC VALIDATION PASS')
print(' - exactly 5 failure modes + 5 primary contributors')
print(' - targeted skill counts and source clocks validated')
print(' - full RaPS CMC sequence (CMC-001..CMC-123 + MACE2) validated')
print(' - RaPS CMC clock set validated')
print(' - universal assessment stopwatches validated')
print(' - Baseline / 3-Month / 6-Month longitudinal hooks validated')
