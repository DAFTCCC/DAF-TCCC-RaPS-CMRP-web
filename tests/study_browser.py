import json,threading,csv
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1])))
threading.Thread(target=server.serve_forever,daemon=True).start()
enrollment={'id':'enroll-1','arm':'Control','enrolledDate':'2025-12-31','trainingDate':'2026-01-01'}
events=[]
for n,(tp,phase,date,passed) in enumerate([('baseline','baseline','2026-01-01',13),('3-month','pre','2026-04-01',10),('3-month','post','2026-04-01',13)]):
 events.append({'id':f'e{n}','name':phase,'studyArm':'Control','timepoint':tp,'date':date,'skillId':'NPA','participants':[{'id':f'p{n}','participantId':'N001','enrollment':enrollment,'evaluation':{'id':f'v{n}','assessment':{'phase':phase,'date':date},'finalizedAt':1,'finalResult':'PASS','skillSource':'same','scenarioVersion':'1','ratings':{f'NPA-{i:02d}':'pass' if i<=passed else 'fail' for i in range(1,14)}}}]})
mock="""window.FieldReadySync={configured:()=>true,session:()=>null,init:()=>{},acceptAuthCallback:async()=>null,currentProfile:async()=>({active:true,role:'enterprise'}),signIn:async()=>{},syncNow:async()=>{},noteLocalChange:()=>{},resumeAutoSync:()=>{},pauseAutoSync:()=>{}};"""
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=b.new_page(accept_downloads=True)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/sync.js',lambda route:route.fulfill(status=200,content_type='application/javascript',body=mock))
  page.add_init_script('localStorage.setItem("FIELDREADY_LONGITUDINAL_STUDY_V4",'+json.dumps(json.dumps({'events':events}))+');')
  page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
  page.locator('#accessEmail').fill('test@example.invalid');page.locator('#accessPassword').fill('test');page.locator('#ackCheck').check();page.locator('#enterBtn').click()
  page.locator('#retentionPhase').select_option('pre')
  assert '-23.1 pp' in page.locator('#retentionTable').inner_text(),page.locator('#retentionTable').inner_text()
  page.locator('[data-open-record]').click()
  page.locator('#recordPhase').select_option('pre')
  assert '-23.1 percentage points' in page.locator('#pairedChanges').inner_text()
  page.locator('#recordPhase').select_option('post')
  assert '0.0 percentage points' in page.locator('#pairedChanges').inner_text()
  page.locator('#addExposure').click()
  form=page.locator('#exposureForm')
  form.locator('[name=date]').fill('2026-03-31');form.locator('[name=minutes]').fill('20');form.locator('[name=repetitions]').fill('5');form.locator('[name=coachingEvents]').fill('0');form.locator('[name=notes]').fill('Self-guided practice observed')
  form.locator('button[type=submit]').click()
  assert '2026-03-31' in page.locator('#studyRecord').inner_text()
  with page.expect_download() as info:page.locator('#exportStudy').click()
  download=info.value
  rows=list(csv.reader(open(download.path())))
  assert all(len(r)==32 for r in rows),[len(r) for r in rows]
  data=[dict(zip(rows[0],r)) for r in rows[1:]]
  exposure=next(r for r in data if r['record_type']=='exposure')
  assert exposure['exposure_date']=='2026-03-31' and exposure['repetitions']=='5',exposure
  assert exposure['recorded_at'] and exposure['skill_id']=='NPA',exposure
  enrollment_row=next(r for r in data if r['record_type']=='enrollment')
  assert enrollment_row['assigned_arm']=='Control',enrollment_row
  assert len([r for r in data if r['record_type']=='assessment'])==3
  assert not errors,errors
  print('Browser PASS: matched pre/post comparisons, exposure save, enrollment display, and aligned study CSV export; mocked auth only, no production writes')
  b.close()
finally:server.shutdown()
