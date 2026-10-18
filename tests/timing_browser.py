"""Exercise live timer controls, scoring boundaries and interrupted-account safety.

Production UI and sync run against a local synthetic API. No NUC requests/writes.
"""
import csv,io,json,subprocess,threading
from datetime import datetime,timedelta,timezone
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from support.browser_runtime import chromium_options
from support.fieldready_api import FieldReadyAPI

ROOT=Path(__file__).resolve().parents[1]
fixture=json.loads(subprocess.check_output(['node','-e',"global.window={};require('./locations.js');require('./skills.js');console.log(JSON.stringify({locations:window.FIELDREADY_LOCATION_DATA,skills:window.FIELDREADY_SKILLS}));"],cwd=ROOT,text=True))
base=next(i for i in fixture['locations']['installations'] if i.get('active',True) and i.get('commands'))
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
artifacts=Path('/tmp/fieldready-timing-review');artifacts.mkdir(exist_ok=True)
errors=[];production=[];contexts=[]

def create_api():
 api=FieldReadyAPI(base['commands'][0],base['id'])
 for skill in ['TQ','NDC','NPA']:
  e={'id':'event-'+skill,'name':skill+' synthetic timing review','skillId':skill,'date':'2026-01-01','timepoint':'baseline','studyArm':'Control','majcom':api.command,'homeInstallationId':base['id'],'scenarioVersion':'1'}
  p={'id':'roster-'+skill,'participantId':'TIMER-'+skill,'clinicalYears':5,'workSection':'Synthetic ICU'}
  api.tables['fr_events'].append({'id':e['id'],'majcom':api.command,'home_installation_id':base['id'],'skill_id':skill,'server_revision':1,'created_by':'program','payload':e})
  api.tables['fr_participants'].append({'id':p['id'],'event_id':e['id'],'participant_code':p['participantId'],'server_revision':1,'payload':p})
  api.assignments[e['id']]=['evaluator']
 return api

def open_page(browser,api,width=390):
 ctx=browser.new_context(accept_downloads=True,service_workers='block',viewport={'width':width,'height':900})
 contexts.append(ctx);page=ctx.new_page();page.set_default_timeout(8000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.alerts=[]
 def dialog(d):
  page.alerts.append(d.message)
  if d.type=='prompt':d.accept('Synthetic invalid timing attempt')
  else:d.accept()
 page.on('dialog',dialog)
 page.route('https://raps-supabase.asuscomm.com/**',lambda r:(production.append(r.request.url),r.abort()))
 page.route('https://fieldready.test.invalid/**',api.handle)
 cfg={'enabled':True,'url':'https://fieldready.test.invalid/fieldready','anonKey':'test-public','tables':{'events':'fr_events','participants':'fr_participants','evaluations':'fr_evaluations','voids':'fr_voids','profiles':'fr_profiles','memberships':'fr_memberships','accountRequests':'fr_account_requests'}}
 page.route('**/backend-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.FIELDREADY_BACKEND='+json.dumps(cfg)+';'))
 page.clock.install()
 page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
 return ctx,page

def login(page,uid):
 page.locator('#accessEmail').fill(uid);page.locator('#accessPassword').fill('valid-password');page.locator('#ackCheck').check();page.locator('#enterBtn').click()
 expect(page.locator('#safeguard')).to_be_hidden()

def grade(page,skill):
 page.locator('[data-event="event-'+skill+'"]').click();page.locator('[data-grade="roster-'+skill+'"]').click()

def clock(page):
 page.clock.pause_at(datetime.now(timezone.utc)+timedelta(seconds=1))

def saved_eval(page,skill):
 return page.evaluate("skill=>JSON.parse(localStorage.getItem('FIELDREADY_LONGITUDINAL_STUDY_V4')).events.find(e=>e.skillId===skill).participants[0].evaluation",skill)

def timer_button(page,timer,action):return page.locator(f'[data-timer-id="{timer}"][data-timer-act="{action}"]')

def style_check(button,action):
 style=button.evaluate("el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {color:s.color,bg:s.backgroundColor,h:r.height,w:r.width}}")
 def rgb(value):return [int(x.strip())/255 for x in value[value.index('(')+1:value.index(')')].split(',')[:3]]
 def luminance(values):return sum(c*w for c,w in zip([v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values],[.2126,.7152,.0722]))
 background=rgb(style['bg']);a,b=sorted([luminance(background),luminance(rgb(style['color']))])
 assert (b+.05)/(a+.05)>=4.5,(action,'text contrast',style)
 assert style['h']>=48,(action,'touch height',style)
 if action=='start':assert background[1]>background[0] and background[1]>background[2],style
 else:assert background[0]>background[1] and background[0]>background[2],style

try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(**chromium_options())
  for width in [390,1280]:
   api=create_api();ctx,page=open_page(browser,api,width);login(page,'evaluator');grade(page,'TQ');clock(page)
   start=page.locator('#stopwatchToggle');start.focus()
   page.evaluate('window.originalStopwatchButton=document.querySelector("#stopwatchToggle")')
   page.clock.run_for(1000)
   assert page.evaluate('document.activeElement===window.originalStopwatchButton && window.originalStopwatchButton.isConnected'),'Stopwatch ticks replaced the focused button'
   style_check(start,'start')
   page.locator('#assessmentStopwatch').screenshot(path=str(artifacts/f'stopwatch-ready-{width}.png'))
   box=start.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.clock.run_for(750);page.mouse.up()
   expect(page.locator('#stopwatchToggle')).to_have_text('STOP')
   assert saved_eval(page,'TQ')['stopwatch']['running']
   style_check(page.locator('#stopwatchToggle'),'stop')
   page.clock.run_for(2000)
   page.locator('#assessmentStopwatch').screenshot(path=str(artifacts/f'stopwatch-running-{width}.png'))
   page.locator('#stopwatchToggle').focus();page.clock.run_for(500);page.keyboard.press('Enter')
   assert saved_eval(page,'TQ')['stopwatch']['completed']
   assert saved_eval(page,'TQ')['stopwatch']['elapsedMs']==2500
   print('PASS: stopwatch stable focus, long press, keyboard stop, action colors/contrast and touch size:',width,flush=True)
   timer='TQ-1MIN'
   style_check(timer_button(page,timer,'start'),'start')
   assert timer_button(page,timer,'stop').is_disabled()
   assert timer_button(page,timer,'pause').is_disabled()
   assert timer_button(page,timer,'pause').evaluate('el=>getComputedStyle(el).backgroundColor')==timer_button(page,timer,'stop').evaluate('el=>getComputedStyle(el).backgroundColor')
   assert timer_button(page,timer,'stop').evaluate('el=>getComputedStyle(el).backgroundColor')!=timer_button(page,timer,'start').evaluate('el=>getComputedStyle(el).backgroundColor')
   ctx.set_offline(True);before=len(api.calls)
   timer_button(page,timer,'start').click();style_check(timer_button(page,timer,'stop'),'stop')
   page.locator(f'[data-inline-timer-card="{timer}"]').screenshot(path=str(artifacts/f'clinical-timer-running-{width}.png'))
   page.clock.run_for(1000);timer_button(page,timer,'reset').click()
   assert len(saved_eval(page,'TQ')['timers'][timer]['instances'])==1,'Reset hid an active timer instance'
   assert 'Stop or void' in page.alerts[-1]
   page.clock.run_for(59000);timer_button(page,timer,'stop').click()
   inst=saved_eval(page,'TQ')['timers'][timer]['instances'][0]
   assert inst['result']=='met' and inst['finalDurationMs']==60000,inst
   assert page.locator(f'[data-inline-timer-status="{timer}"]').inner_text()=='STANDARD MET'
   timer_button(page,timer,'reset').click();timer_button(page,timer,'start').click();page.clock.run_for(60001);timer_button(page,timer,'stop').click()
   expect(page.locator('#modal')).to_be_visible();page.locator('[data-mode=timing-sequence]').click();page.locator('[data-contributor=system-context]').click();page.locator('#failureSaveForm button').click()
   ev=saved_eval(page,'TQ');assert ev['timers'][timer]['instances'][1]['finalDurationMs']==60001
   assert ev['timers'][timer]['instances'][1]['result']=='notmet';assert ev['ratings']['TQ-10']=='fail'
   assert len(api.calls)==before,'Offline grading attempted a server call'
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),'Timer controls overflow viewport'
   page.locator(f'[data-inline-timer-card="{timer}"]').screenshot(path=str(artifacts/f'clinical-timer-{width}.png'))
   print('PASS: offline clinical timing, active-reset guard, exact deadline and timing-failure classification:',width,flush=True)
   # Stop/void resolves every timing record before leaving; then reconnect normally.
   ctx.set_offline(False);page.locator('#backRosterBtn').click();page.locator('#homeBrand').click()
   grade(page,'NDC')
   t='NDC-HOLD';timer_button(page,t,'start').click();page.clock.run_for(4000);timer_button(page,t,'pause').click();page.clock.run_for(3000)
   timer_button(page,t,'reset').click();assert len(saved_eval(page,'NDC')['timers'][t]['instances'])==1
   expect(timer_button(page,t,'start')).to_have_text('RESUME');style_check(timer_button(page,t,'start'),'start')
   timer_button(page,t,'start').click();page.clock.run_for(5000);timer_button(page,t,'stop').click()
   inst=saved_eval(page,'NDC')['timers'][t]['instances'][0]
   assert inst['result']=='met' and inst['finalDurationMs']==5000,inst
   assert inst['tacticalPauseMs']==3000
   print('PASS: paused reset cannot hide a clock; continuous-pressure timing restarts its segment:',width,flush=True)
   assert not api.errors,api.errors;ctx.close()

  # Idle polling, focus/reconnect, and incoming snapshots must not disturb grading.
  api=create_api();ctx,page=open_page(browser,api);login(page,'evaluator');grade(page,'NPA');clock(page)
  page.locator('#stopwatchToggle').click()
  first=fixture['skills']['NPA']['sections'][0]['items'][0]['id']
  page.locator(f'[data-item="{first}"][data-rate=pass]').click()
  page.locator('#overallNotes').fill('Unsaved evaluator text must stay exactly here')
  page.evaluate('window.originalNotes=document.querySelector("#overallNotes");window.originalCriteria=document.querySelector("#criteriaList").firstElementChild;')
  before=len(api.calls);page.clock.run_for(91000)
  page.evaluate("window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new CustomEvent('fieldready:remote-db',{detail:{db:{events:[]}}}));")
  ctx.set_offline(True);ctx.set_offline(False);page.clock.run_for(1000)
  assert len(api.calls)==before,'Background polling/focus/reconnect contacted the server during grading'
  assert page.evaluate('document.activeElement===window.originalNotes && window.originalNotes.isConnected && window.originalCriteria===document.querySelector("#criteriaList").firstElementChild')
  expect(page.locator('#overallNotes')).to_have_value('Unsaved evaluator text must stay exactly here')
  expect(page.locator('#evalView')).to_have_class('view active')
  assert saved_eval(page,'NPA')['ratings'][first]=='pass'
  print('PASS: 92 seconds of polling, focus, reconnect and incoming snapshots preserve grading DOM, focus, notes and ratings with zero server calls',flush=True)
  page.locator('#stopwatchToggle').click()
  page.locator('#assessmentPhase').select_option('baseline');page.locator('#assessmentDate').fill('2026-01-01')
  for index,section in enumerate(fixture['skills']['NPA']['sections']):
   page.locator('#sectionSelect').select_option(str(index))
   for item in section['items']:page.locator(f'[data-item="{item["id"]}"][data-rate=pass]').click()
  page.locator('#reviewFinalizeBtn').click();page.locator('#finalizeConfirm').click()
  expect(page.locator('#reviewFinalizeBtn')).to_be_disabled();expect(page.locator('#syncStatusBtn')).to_contain_text('SYNCED')
  assert any(r.get('finalized_at') for r in api.tables['fr_evaluations'])
  before=len(api.calls);page.clock.run_for(61000);page.evaluate("window.dispatchEvent(new Event('focus'))")
  assert len(api.calls)==before,'Finalized review was automatically refreshed'
  page.locator('#recordFromEvalBtn').click()
  expect(page.locator('#participantView')).to_have_class('view active')
  with page.expect_request('**/rpc/fr_get_data_epoch'):page.evaluate("window.dispatchEvent(new Event('focus'))")
  print('PASS: finalize explicitly synchronizes; review stays stable; automatic refresh resumes after leaving the evaluation',flush=True)
  ctx.close()

  # Same-browser account change during unfinished grading must not expose cached data.
  api=create_api();ctx,page=open_page(browser,api);login(page,'evaluator');grade(page,'NPA')
  first=fixture['skills']['NPA']['sections'][0]['items'][0]['id']
  page.locator(f'[data-item="{first}"][data-rate=pass]').click()
  page.locator('#lockBtn').click();expect(page.locator('#safeguard')).to_be_visible()
  login(page,'outsider')
  expect(page.locator('#eventsList')).not_to_contain_text('synthetic timing review')
  expect(page.locator('#participantIndex')).not_to_contain_text('TIMER-')
  backup=page.evaluate("JSON.parse(localStorage.getItem('FIELDREADY_SYNC_RECOVERY_evaluator'))")
  assert any(p.get('evaluation',{}).get('ratings',{}).get(first)=='pass' for e in backup['events'] for p in e['participants'] if p.get('evaluation'))
  print('PASS: signing into another account after unfinished grading clears prior scope and retains pending-work recovery',flush=True)
  assert not errors,errors;assert not production,production
  browser.close()
finally:
 for ctx in contexts:
  try:ctx.close()
  except Exception:pass
 server.shutdown()
