"""Username sessions and actual PDF/CSV attachments through production app + sync.

All records and authentication services are synthetic. No live NUC writes/email.
"""
import copy,csv,json,subprocess,threading
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from pypdf import PdfReader
from playwright.sync_api import sync_playwright,expect
from support.browser_runtime import chromium_options
from support.fieldready_api import FieldReadyAPI

ROOT=Path(__file__).resolve().parents[1]
fixture=json.loads(subprocess.check_output(['node','-e',"global.window={};require('./locations.js');require('./skills.js');require('./raps-skills.js');console.log(JSON.stringify({locations:window.FIELDREADY_LOCATION_DATA,skills:window.FIELDREADY_SKILLS}));"],cwd=ROOT,text=True))
base=next(i for i in fixture['locations']['installations'] if i.get('active',True) and i.get('commands'))
api=FieldReadyAPI(base['commands'][0],base['id'])
for key,s in fixture['skills'].items():
 items=[i for sec in s['sections'] for i in sec['items']]
 e={'id':'event-'+key,'name':key+' synthetic assessment','skillId':key,'date':'2026-01-01','timepoint':'baseline','studyArm':'Control','majcom':api.command,'homeInstallationId':base['id'],'scenarioVersion':'1'}
 p={'id':'roster-'+key,'participantId':'N001','enrollment':{'id':'enrollment','arm':'Control','trainingDate':'2026-01-01','enrolledDate':'2026-01-01'},'trainingExposures':[{'id':'practice','skillId':'NPA','date':'2026-03-30','type':'Deliberate Practice','minutes':20,'repetitions':4,'coachingEvents':1}]}
 ev={'id':'eval-'+key,'finalizedAt':1767225600000,'finalResult':'FAIL','ratings':{i['id']:'pass' for i in items},'failureDetails':{items[0]['id']:{'modeLabel':'Incorrect technique','contributorLabel':'Psychomotor execution','comment':'Observed failure ≤ 1:00 — synthetic'}},'assessment':{'phase':'baseline','date':'2026-01-01'},'skillSource':s['source'],'scenarioVersion':'1','stopwatch':{'completed':True,'elapsedMs':60000},'evaluatorId':'synthetic-evaluator'}
 ev['ratings'][items[0]['id']]='fail'
 ev['notes']='Synthetic overall evaluator notes'
 if key=='TQ':
  timer=s['timers'][0]
  ev['timers']={timer['id']:{'currentIndex':0,'instances':[{'index':1,'wallStart':1767225600000,'wallStop':1767225660001,'finalDurationMs':60001,'result':'notmet','running':False,'paused':False}]}}
  ev['ratings'][timer['linkedItemId']]='fail'
  ev['failureDetails'][timer['linkedItemId']]={'mode':'timing-sequence','modeLabel':'Timing / sequence','contributor':'system-context','contributorLabel':'System / performance context','comment':'Synthetic missed deadline'}
 api.tables['fr_events'].append({'id':e['id'],'majcom':api.command,'home_installation_id':base['id'],'skill_id':key,'server_revision':1,'created_by':'program','payload':e})
 api.tables['fr_participants'].append({'id':p['id'],'event_id':e['id'],'participant_code':'N001','server_revision':1,'payload':p})
 api.tables['fr_evaluations'].append({'id':ev['id'],'event_id':e['id'],'participant_id':p['id'],'finalized_at':'2026-01-01T00:00:00Z','server_revision':1,'payload':ev})
 api.assignments[e['id']]=['evaluator']
for phase in ['pre','post']:
 for table in ['fr_events','fr_participants','fr_evaluations']:
  original=next(r for r in api.tables[table] if r['id']=={'fr_events':'event-NPA','fr_participants':'roster-NPA','fr_evaluations':'eval-NPA'}[table])
  row=copy.deepcopy(original);row['id']+='-'+phase;row['payload']['id']=row['id']
  if table=='fr_events':
   row['payload'].update(date='2026-04-01',timepoint='3-month',name='NPA '+phase+' assessment')
  else:row['event_id']='event-NPA-'+phase
  if table=='fr_evaluations':
   row['participant_id']='roster-NPA-'+phase;row['payload']['assessment']={'phase':phase,'date':'2026-04-01'}
  api.tables[table].append(row)
 api.assignments['event-NPA-'+phase]=['evaluator']
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];alerts=[];live=[]
artifacts=Path('/tmp/fieldready-file-review');artifacts.mkdir(exist_ok=True)

def login(page,identifier,password='valid-password'):
 page.locator('#accessEmail').fill(identifier);page.locator('#accessPassword').fill(password);page.locator('#ackCheck').check();page.locator('#enterBtn').click()

try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(**chromium_options())
  for role in ['evaluator','program','majcom','enterprise']:
   ctx=browser.new_context(accept_downloads=True,service_workers='block',viewport={'width':390 if role=='evaluator' else 1280,'height':900})
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('dialog',lambda d:(alerts.append(d.message),d.accept()))
   page.route('https://raps-supabase.asuscomm.com/**',lambda route:(live.append(route.request.url),route.abort()))
   page.route('https://fieldready.test.invalid/**',api.handle)
   page.route('**/backend-config.js',lambda route:route.fulfill(content_type='application/javascript',body="window.FIELDREADY_BACKEND="+json.dumps({'enabled':True,'url':'https://fieldready.test.invalid/fieldready','anonKey':'test-public-key','tables':{'events':'fr_events','participants':'fr_participants','evaluations':'fr_evaluations','voids':'fr_voids','profiles':'fr_profiles','memberships':'fr_memberships','accountRequests':'fr_account_requests'},'functions':{'login':'fieldready-login'}})+';'))
   page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
   login(page,role.upper(),'incorrect');expect(page.locator('#accessError')).to_contain_text('Invalid username or password')
   login(page,role.upper());expect(page.locator('#safeguard')).to_be_hidden()
   assert page.evaluate('window.FieldReadySync.session().user.id')==role
   page.locator('#accountBtn').click();form=page.locator('#usernameForm')
   form.locator('[name=username]').fill('nurse.'+role);form.locator('button').click();expect(page.locator('#modal')).to_be_hidden()
   page.locator('#lockBtn').click();login(page,'NURSE.'+role.upper());expect(page.locator('#safeguard')).to_be_hidden()
   assert page.evaluate('window.FieldReadySync.session().user.id')==role
   print('PASS: username sign-in, rename, role/identity retained:',role,flush=True)
   if role=='enterprise':
    with page.expect_download() as info:page.locator('#enterpriseCsvBtn').click()
    enterprise_rows=list(csv.DictReader(Path(info.value.path()).open()))
    assert all(None not in r for r in enterprise_rows)
    timed=next(r for r in enterprise_rows if r['criterion_id']==fixture['skills']['TQ']['timers'][0]['linkedItemId'])
    assert json.loads(timed['clinical_timers_json'])[0]['instances'][0]['finalDurationMs']==60001
    page.locator('#adminBtn').click();page.locator('[data-edit-user=evaluator]').click();page.locator('#manageUsernameBtn').click()
    form=page.locator('#usernameForm');form.locator('[name=username]').fill('enterprise.renamed.evaluator');form.locator('button').click();expect(page.locator('#modal')).to_be_hidden()
    assert api.profile('evaluator')['username']=='enterprise.renamed.evaluator'
    page.locator('#homeBrand').click()
   if role!='evaluator':ctx.close();continue
   for key,s in fixture['skills'].items():
    page.locator('[data-event="event-'+key+'"]').click()
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
    with page.expect_download() as info:page.locator('#eventPdfBtn').click()
    pdf=artifacts/(key+'.pdf');info.value.save_as(pdf)
    reader=PdfReader(pdf);text='\n'.join(p.extract_text() for p in reader.pages)
    items=[i for sec in s['sections'] for i in sec['items']]
    for expected in ['N001','FINALIZED FAIL',items[0]['id'],items[-1]['id'],'Incorrect technique','Observed failure ≤ 1:00','Post-training baseline','synthetic-evaluator','Synthetic overall evaluator notes']:
     assert expected in text,(key,expected)
    assert len(reader.pages)>=1
    if key in ['CMC','CPP']:assert len(reader.pages)>1,key+' should paginate full criteria'
    assert info.value.suggested_filename.endswith('.pdf')
    if key=='TQ':
     with page.expect_download() as csv_info:page.locator('#exportEventBtn').click()
     raw=list(csv.DictReader(Path(csv_info.value.path()).open()))
     timed=next(r for r in raw if r['criterion_id']==s['timers'][0]['linkedItemId'])
     clocks=json.loads(timed['clinical_timers_json'])
     assert clocks[0]['max_ms']==60000 and clocks[0]['instances'][0]['finalDurationMs']==60001
    page.locator('#homeBrand').click()
   print('PASS: real searchable PDFs include full criteria, failures and Unicode across all 8 modules',flush=True)
   page.locator('[data-event="event-NPA"]').click()
   page.evaluate("""window.shared=[];window.shareMode='success';Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared.push({active:navigator.userActivation.isActive,names:data.files.map(f=>f.name),types:data.files.map(f=>f.type),sizes:data.files.map(f=>f.size)});if(window.shareMode==='cancel')throw new DOMException('Cancelled','AbortError');if(window.shareMode==='error')throw new DOMException('Denied','NotAllowedError');}});""")
   page.locator('#eventShareBtn').click();expect(page.locator('#sharePreparedBtn')).to_be_visible()
   page.locator('#sharePreparedBtn').click();page.wait_for_function('window.shared.length===1')
   shared=page.evaluate('window.shared[0]');assert shared['active'];assert shared['types']==['text/csv','application/pdf'];assert all(n>100 for n in shared['sizes'])
   with page.expect_download() as info:page.locator('#downloadPreparedCsvBtn').click()
   rows=list(csv.DictReader(Path(info.value.path()).open()));assert rows[0]['participant_id']=='N001';assert rows[0]['assessment_type']=='baseline'
   page.evaluate("window.shareMode='cancel'");page.locator('#sharePreparedBtn').click();expect(page.locator('#sharePreparedBtn')).to_be_enabled();expect(page.locator('#shareFilesError')).to_be_hidden()
   page.evaluate("window.shareMode='error'");page.locator('#sharePreparedBtn').click();expect(page.locator('#shareFilesError')).to_contain_text('Download the files')
   page.locator('#modalClose').click();page.locator('#homeBrand').click()
   page.locator('[data-open-record=N001]').click()
   with page.expect_download() as info:page.locator('#recordPdfBtn').click()
   pdf=artifacts/'longitudinal.pdf';info.value.save_as(pdf);text='\n'.join(p.extract_text() for p in PdfReader(pdf).pages)
   assert 'Enrollment and dated training exposures' in text and 'Repetitions: 4' in text
   assert 'Before reinforcement' in text and 'After reinforcement' in text
   page.evaluate("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})")
   page.locator('#recordShareBtn').click();expect(page.locator('#sharePreparedBtn')).to_be_hidden()
   with page.expect_download() as info:page.locator('#downloadPreparedCsvBtn').click()
   data=list(csv.DictReader(Path(info.value.path()).open()));assert {'assessment_type','comment','evaluation_id'}<=set(data[0]);assert {r['skill_id'] for r in data}==set(fixture['skills'])
   assert {r['assessment_type'] for r in data}=={'baseline','pre','post'}
   timed=next(r for r in data if r['criterion_id']==fixture['skills']['TQ']['timers'][0]['linkedItemId'])
   assert json.loads(timed['clinical_timers_json'])[0]['instances'][0]['finalDurationMs']==60001
   page.locator('#modalClose').click()
   # Fresh synchronized exports must stop offline, while local backups remain possible.
   ctx.set_offline(True);before=len(alerts);page.locator('#recordPdfBtn').click();page.wait_for_function('document.querySelector("#toast")!==null')
   assert len(alerts)>before and 'Export paused:' in alerts[-1]
   ctx.set_offline(False)
   page.screenshot(path=str(artifacts/'mobile-participant.png'),full_page=True)
   print('PASS: CSV/PDF attachments, share user activation, cancellation/failure/download fallback, participant scope and offline guard',flush=True)
   ctx.close()
  assert not errors,errors
  assert not live,live
  assert not api.errors,api.errors
  browser.close()
finally:server.shutdown()
