"""UI integration checks with synthetic data and mocked account services."""
import csv,json,threading,subprocess
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from support.browser_runtime import chromium_options
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
tiers=json.loads(subprocess.check_output(['node','-e',"global.window={};require('./skills.js');require('./raps-skills.js');console.log(JSON.stringify(window.FIELDREADY_SKILLS));"],cwd=root,text=True))
events=[]
for tier in tiers.values():
 key=tier['id']
 events.append({'id':'event-'+key,'name':key+' assessment','studyArm':'Control','skillId':key,'timepoint':'baseline','date':'2026-01-01','participants':[{'id':'roster-'+key,'participantId':'N001','evaluation':{'id':'eval-'+key,'finalizedAt':1,'finalResult':'PASS','assessment':{'phase':'baseline','date':'2026-01-01'},'skillSource':tier['source'],'scenarioVersion':'1','ratings':{i['id']:'pass' for sec in tier['sections'] for i in sec['items']},'stopwatch':{'completed':True,'elapsedMs':60000}}}]})
closed=json.loads(json.dumps(events[0]));closed['id']='closed-event';closed['closedAt']=1;closed['participants'][0]['id']='closed-roster';closed['participants'][0]['evaluation']['finalizedAt']=None;events.append(closed)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chromium_options())
  for role in ['evaluator','program_manager','majcom_manager','enterprise']:
   context=browser.new_context(accept_downloads=True,viewport={'width':390 if role=='evaluator' else 1280,'height':844})
   page=context.new_page();errors=[];backend=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('https://raps-supabase.asuscomm.com/**',lambda route:(backend.append(route.request.url),route.abort()))
   mock="""window.exportRefreshes=0;window.FieldReadySync={configured:()=>true,session:()=>null,init:()=>{},acceptAuthCallback:async()=>null,currentProfile:async()=>({active:true,role:ROLE}),currentMembership:async()=>{const i=window.FIELDREADY_LOCATION_DATA.installations.find(x=>x.active!==false&&x.commands?.length);return ROLE==='program_manager'?{scope_type:'installation',scope_value:i.id}:{scope_type:'majcom',scope_value:i.commands[0]};},signIn:async()=>{},syncNow:async(db,opts)=>{if(opts?.requireFresh)window.exportRefreshes++;},managerTeam:async()=>({evaluators:[]}),eligibleEvaluators:async()=>[{user_id:'test-evaluator',display_name:'Test Evaluator'}],getEventEvaluators:async()=>[],noteLocalChange:()=>{},resumeAutoSync:()=>{},pauseAutoSync:()=>{}};""".replace('ROLE',json.dumps(role))
   page.route('**/sync.js',lambda route:route.fulfill(status=200,content_type='application/javascript',body=mock))
   page.add_init_script('localStorage.setItem("FIELDREADY_LONGITUDINAL_STUDY_V4",'+json.dumps(json.dumps({'events':events}))+');')
   page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
   assert page.locator('#accessEmail').is_visible()
   assert page.locator('#enterBtn').is_disabled()
   page.locator('#accessEmail').fill('test@example.invalid');page.locator('#accessPassword').fill('synthetic');page.locator('#ackCheck').check();page.locator('#enterBtn').click()
   assert not page.locator('#safeguard').is_visible()
   assert page.locator('#newEventBtn').is_visible()==(role!='evaluator')
   assert page.locator('#adminBtn').is_visible()==(role!='evaluator')
   if role!='evaluator':
    page.locator('#newEventBtn').click()
    options=page.locator('[name=skillId] option').evaluate_all('(els)=>els.map(e=>e.value)')
    assert all(k in options for k in ['ASM','CLS','CPP'])
    if role=='program_manager':
     assert page.locator('[name=homeInstallationId] option').count()==2
    if role=='majcom_manager':
     assert page.locator('[name=majcom] option').count()==2
    page.locator('#modalClose').click()
   for tier in tiers.values():
    key=tier['id']
    page.locator('[data-event="event-'+key+'"]').click()
    assert page.locator('#editEventBtn').is_visible()==(role!='evaluator')
    page.locator('[data-grade="roster-'+key+'"]').click()
    assert page.locator('#evalName').is_disabled()
    assert page.locator('#overallNotes').is_disabled()
    assert page.locator('#reviewFinalizeBtn').is_disabled()
    assert page.locator('#voidAttemptBtn').is_disabled()
    for index,section in enumerate(tier['sections']):
     page.locator('#sectionSelect').select_option(str(index))
     assert page.locator('#criteriaList .criterion').count()==len(section['items'])
    page.locator('#backRosterBtn').click()
    with page.expect_download() as info:page.locator('#exportEventBtn').click()
    rows=list(csv.reader(open(info.value.path())))
    assert len(rows)==sum(len(s['items']) for s in tier['sections'])+1
    assert all(len(row)==len(rows[0]) for row in rows)
    assert 'assessment_type' in rows[0] and 'evaluation_id' in rows[0]
    page.locator('#homeBrand').click()
   page.locator('[data-event="closed-event"]').click()
   page.locator('[data-grade="closed-roster"]').click()
   assert page.locator('#assessmentPhase').is_disabled()
   assert page.locator('#reviewFinalizeBtn').is_disabled()
   assert page.locator('#criteriaList [data-rate]:enabled').count()==0
   assert page.locator('#stopwatchToggle').count()==0
   assert page.evaluate('window.exportRefreshes')==len(tiers)
   assert not errors,errors
   assert not backend,backend
   print('UI PASS:',role,'permissions, all 8 skill modules, finalized/closed locking, refreshed exports')
   context.close()
  browser.close()
finally:server.shutdown()
