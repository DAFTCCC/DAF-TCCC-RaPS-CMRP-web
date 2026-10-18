"""Complete UI journeys through production sync.js and a stateful local API.

Requires Playwright + /usr/bin/chromium. No production records, invitations,
credentials, or NUC connections are used. The API models, but cannot verify, RLS.
"""
import csv,io,json,subprocess,threading
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from support.browser_runtime import chromium_options
from playwright.sync_api import sync_playwright,expect
from support.fieldready_api import FieldReadyAPI

ROOT=Path(__file__).resolve().parents[1]
fixture=json.loads(subprocess.check_output(['node','-e',"global.window={};require('./locations.js');require('./skills.js');console.log(JSON.stringify({locations:window.FIELDREADY_LOCATION_DATA,skill:window.FIELDREADY_SKILLS.NPA}));"],cwd=ROOT,text=True))
base=next(i for i in fixture['locations']['installations'] if i.get('active',True) and i.get('commands'))
command=base['commands'][0]
api=FieldReadyAPI(command,base['id'])
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
artifacts=Path('/tmp/fieldready-ui-review');artifacts.mkdir(exist_ok=True)
errors=[];production_requests=[];contexts=[];pages=[];alerts=[];checks=[];dismiss_next=[False]

def check(label):
 checks.append(label);print('PASS:',label,flush=True)

def layout(page,label):
 page.evaluate('window.scrollTo(0,0)')
 overflow=page.evaluate('document.documentElement.scrollWidth>window.innerWidth+1')
 if overflow:page.screenshot(path=str(artifacts/(label+'-overflow.png')),full_page=True)
 assert not overflow,label+' has horizontal page overflow'
 page.screenshot(path=str(artifacts/(label+'.png')))

def session(browser,uid,width=1280):
 context=browser.new_context(accept_downloads=True,service_workers='block',viewport={'width':width,'height':900})
 contexts.append(context);page=context.new_page();pages.append(page)
 page.set_default_timeout(8000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 def dialog(d):
  alerts.append(d.message)
  if dismiss_next[0]:dismiss_next[0]=False;d.dismiss();return
  if d.type=='prompt':d.accept('Synthetic denial / administrative reason')
  else:d.accept()
 page.on('dialog',dialog)
 page.route('https://fieldready.test.invalid/**',api.handle)
 def block(route):production_requests.append(route.request.url);route.abort()
 page.route('https://raps-supabase.asuscomm.com/**',block)
 config="window.FIELDREADY_BACKEND={enabled:true,url:'https://fieldready.test.invalid/fieldready',anonKey:'test-public',auth:{sessionKey:'FIELDREADY_SUPABASE_SESSION_V1'},tables:{events:'fr_events',participants:'fr_participants',evaluations:'fr_evaluations',voids:'fr_voids',profiles:'fr_profiles',memberships:'fr_memberships',accountRequests:'fr_account_requests'},functions:{accountAdmin:'fieldready-account-admin'},autoSyncDelayMs:1500};"
 page.route('**/backend-config.js',lambda route:route.fulfill(status=200,content_type='application/javascript',body=config))
 page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
 if uid:
  page.locator('#accessEmail').fill(uid+'@example.invalid');page.locator('#accessPassword').fill('valid-password');page.locator('#ackCheck').check();page.locator('#enterBtn').click()
  expect(page.locator('#safeguard')).to_be_hidden()
 return page

def sync(page):
 page.locator('#syncStatusBtn').click();page.locator('#syncNowBtn').click()
 expect(page.locator('#modal')).to_be_hidden()

def home(page):page.locator('#homeBrand').click()

def add_participant(page,pid):
 page.locator('#addParticipantBtn').click();form=page.locator('#participantForm')
 form.locator('[name=participantId]').fill(pid);form.locator('[name=clinicalYears]').fill('5');form.locator('[name=workSection]').fill('Synthetic ICU')
 page.evaluate('window.FieldReadySync.syncNow()') # Simulate a refresh while the user is filling this form.
 form.locator('button[type=submit]').click();expect(page.locator('#modal')).to_be_hidden()

def exported(page):
 with page.expect_download() as info:page.locator('#exportEventBtn').click()
 return Path(info.value.path()).read_text()

def grade(page,pid,critical_failure=False):
 page.get_by_role('row').filter(has_text=pid).get_by_role('button',name='Grade',exact=True).click()
 layout(page,'evaluator-grading-mobile')
 assert page.locator('#toast').evaluate('(el)=>getComputedStyle(el).pointerEvents')=='none'
 page.locator('#assessmentPhase').select_option('baseline');page.locator('#assessmentDate').fill('2026-01-01')
 page.locator('#reviewFinalizeBtn').click();assert 'Cannot finalize' in alerts[-1]
 page.locator('#stopwatchToggle').click()
 items=[i for section in fixture['skill']['sections'] for i in section['items']]
 noncritical=next(i for i in items if not i['critical'])
 critical=next(i for i in items if i['critical'])
 assert page.locator(f'[data-item="{critical["id"]}"][data-rate=nt]').is_disabled()
 for item in items:page.locator(f'[data-item="{item["id"]}"][data-rate=pass]').click()
 # N/O must remain unresolved; a critical FAIL must require its classification.
 page.locator(f'[data-item="{noncritical["id"]}"][data-rate=no]').click()
 assert page.locator('#unresolvedKpi').inner_text()=='1'
 page.locator(f'[data-item="{noncritical["id"]}"][data-rate=pass]').click()
 target=critical if critical_failure else noncritical
 page.locator(f'[data-item="{target["id"]}"][data-rate=fail]').click()
 assert page.locator('[data-mode]').count()==5
 page.locator('[data-mode=other-unclear]').click();assert page.locator('[data-contributor]').count()==5
 page.locator('[data-contributor=knowledge-cue]').click()
 form=page.locator('#failureSaveForm');form.locator('button[type=submit]').click()
 assert page.locator('#failureSaveForm').is_visible() # Required comment prevents empty submission.
 form.locator('[name=comment]').fill('Synthetic observed failure');form.locator('button[type=submit]').click()
 page.locator('#reviewFinalizeBtn').click();assert 'running' in alerts[-1] or 'stop' in alerts[-1]
 page.locator('#syncStatusBtn').click();page.locator('#syncNowBtn').click();assert 'Finish grading' in alerts[-1];page.locator('#modalClose').click()
 page.locator('#stopwatchToggle').click();page.locator('#reviewFinalizeBtn').click()
 expected='FAIL' if critical_failure else 'PASS'
 expect(page.locator('#finalizeConfirm')).to_have_text('Finalize '+expected)
 page.locator('#finalizeConfirm').click()
 expect(page.locator('#reviewFinalizeBtn')).to_be_disabled()
 expect(page.locator('#syncStatusBtn')).to_contain_text('SYNCED')
 assert page.locator('#overallNotes').is_disabled()
 page.locator('#backRosterBtn').click()
 return expected

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chromium_options())
  # Public request UI, including its overlay and validation.
  public=session(browser,None,390)
  layout(public,'login-mobile')
  public.locator('#requestAccountBtn').click();form=public.locator('#accountRequestForm')
  form.locator('[name=displayName]').fill('Synthetic Applicant');form.locator('[name=email]').fill('applicant@example.invalid')
  form.locator('[name=password]').fill('valid-password');form.locator('[name=confirmPassword]').fill('wrong-password')
  form.locator('[name=majcom]').select_option(command);form.locator('[name=installationId]').select_option(base['id'])
  form.locator('button[type=submit]').click();expect(public.locator('#accountRequestError')).to_contain_text('Passwords do not match')
  form.locator('[name=confirmPassword]').fill('valid-password');form.locator('button[type=submit]').click()
  expect(public.locator('#modal')).to_be_hidden();assert len(api.tables['fr_account_requests'])==1
  check('public account request and password validation on mobile')
  public.locator('#accessEmail').fill('enterprise@example.invalid');public.locator('#accessPassword').fill('wrong-password');public.locator('#ackCheck').check();public.locator('#enterBtn').click()
  expect(public.locator('#accessError')).to_contain_text('Invalid login')
  assert public.locator('main').evaluate('(el)=>el.inert')
  assert public.locator('.topbar').evaluate('(el)=>el.inert')
  public.locator('#enterBtn').focus();public.keyboard.press('Tab');assert public.evaluate('document.activeElement.id')=='requestAccountBtn'
  public.keyboard.press('Tab');assert public.evaluate('document.activeElement.id')=='accessEmail'
  check('invalid login blocks entry and keyboard focus stays inside the login gate')
  enterprise=session(browser,'enterprise')
  enterprise.locator('#adminBtn').click();expect(enterprise.locator('#adminTitle')).to_have_text('FieldReady Accounts')
  enterprise.locator('[data-approve-request]').click()
  assert enterprise.locator('#approveAccountForm option[value=enterprise]').count()==0
  enterprise.locator('#approveAccountForm button[type=submit]').click()
  expect(enterprise.locator('[data-approve-request]')).to_have_count(0)
  assert api.tables['fr_account_requests'][0]['status']=='approved'
  enterprise.locator('#inviteUserBtn').click();form=enterprise.locator('#inviteAccountForm')
  assert form.locator('option[value=enterprise]').count()==0
  form.locator('[name=displayName]').fill('Synthetic Invite');form.locator('[name=email]').fill('invite@example.invalid')
  form.locator('button[type=submit]').click();expect(enterprise.locator('#modal')).to_be_hidden()
  assert any(p['email']=='invite@example.invalid' for p in api.tables['fr_profiles'])
  enterprise.locator('[data-edit-user=unassigned]').click();enterprise.locator('#removeUserAccessBtn').click()
  expect(enterprise.locator('#modal')).to_be_hidden();assert not api.profile('unassigned')['active']
  check('Enterprise approval, invitation, and deactivation UI through real API client')
  denied={'id':'request-deny','user_id':'denied-candidate','email':'denied@example.invalid','display_name':'Denied Candidate','status':'pending','majcom':command,'installation_id':base['id']};api.tables['fr_account_requests'].append(denied)
  enterprise.locator('#adminBtn').click();dismiss_next[0]=True;enterprise.locator('[data-deny-request=request-deny]').click()
  assert denied['status']=='pending'
  enterprise.locator('[data-deny-request=request-deny]').click();expect(enterprise.locator('[data-deny-request=request-deny]')).to_have_count(0);assert denied['status']=='denied'
  check('cancelled account denial leaves access pending; confirmed denial updates the request')
  # MAJCOM manager appointments and Program manager evaluator pool.
  majcom=session(browser,'majcom',390);majcom.locator('#adminBtn').click();layout(majcom,'majcom-team-mobile')
  form=majcom.locator('#appointPmForm');form.locator('[name=userId]').select_option('candidate');form.locator('[name=installationId]').select_option(base['id'])
  form.locator('button[type=submit]').click()
  expect(majcom.locator('#accountRequestsTable')).to_contain_text('Candidate')
  assert api.profile('candidate')['role']=='program_manager'
  program=session(browser,'program');program.locator('#adminBtn').click()
  form=program.locator('#appointEvaluatorForm');form.locator('[name=userId]').select_option('evaluator');form.locator('button[type=submit]').click()
  expect(program.locator('[data-remove-evaluator=evaluator]')).to_be_visible()
  check('MAJCOM Program-manager appointment and Program-manager evaluator appointment')
  enterprise.locator('[data-edit-user=candidate]').click();form=enterprise.locator('#manageAccountForm');form.locator('[name=role]').select_option('majcom_manager')
  form.locator('[name=scopeValue]').select_option(command);form.locator('button[type=submit]').click();expect(enterprise.locator('#modal')).to_be_hidden()
  assert api.profile('candidate')['role']=='majcom_manager' and api.membership('candidate')['scope_value']==command
  check('Enterprise role and command-scope changes through the management form')
  home(program);program.locator('#newEventBtn').click();form=program.locator('#eventForm')
  form.locator('[name=name]').fill('Synthetic baseline class');form.locator('[name=skillId]').select_option('NPA')
  form.locator('[name=date]').fill('2026-01-01');form.locator('[name=leadEvaluatorId]').select_option('evaluator')
  form.locator('button[type=submit]').click();expect(program.locator('#eventTitle')).to_have_text('Synthetic baseline class')
  event=next(e for e in api.tables['fr_events'] if e['payload']['name']=='Synthetic baseline class')
  assert api.assignments[event['id']]==['evaluator']
  add_participant(program,'N001');add_participant(program,'N002');sync(program)
  program.get_by_role('row').filter(has_text='N001').get_by_role('button',name='Longitudinal',exact=True).click()
  program.locator('#enrollParticipant').click();form=program.locator('#enrollmentForm')
  form.locator('[name=arm]').select_option('Control');form.locator('[name=enrolledDate]').fill('2025-12-31');form.locator('[name=trainingDate]').fill('2026-01-01');program.evaluate('window.FieldReadySync.syncNow()');form.locator('button[type=submit]').click()
  sync(program)
  program.locator('#addExposure').click();form=program.locator('#exposureForm')
  for name,value in {'date':'2026-01-01','minutes':'20','repetitions':'5','coachingEvents':'0','notes':'Synthetic exposure'}.items():form.locator('[name='+name+']').fill(value)
  program.evaluate('window.FieldReadySync.syncNow(undefined,{requireFresh:true})');form.locator('button[type=submit]').click();sync(program)
  assert api.tables['fr_participants'][0]['payload']['trainingExposures'][0]['repetitions']==5
  home(program);program.locator('[data-event]').click()
  row=program.get_by_role('row').filter(has_text='N001');row.get_by_role('button',name='Edit',exact=True).click()
  form=program.locator('#participantForm');form.locator('[name=workSection]').fill('Stale form entry')
  changed=next(p for p in api.tables['fr_participants'] if p['participant_code']=='N001');changed['payload']['workSection']='Other device edit';changed['server_revision']+=1
  program.evaluate('window.FieldReadySync.syncNow(undefined,{requireFresh:true})');form.locator('button[type=submit]').click()
  assert 'changed while the form was open' in alerts[-1]
  assert changed['payload']['workSection']=='Other device edit'
  program.locator('#modalClose').click()
  row=program.get_by_role('row').filter(has_text='N001');row.get_by_role('button',name='Edit',exact=True).click();form=program.locator('#participantForm')
  form.locator('[name=workSection]').fill('Fresh form entry');program.evaluate('window.FieldReadySync.syncNow(undefined,{requireFresh:true})');form.locator('button[type=submit]').click();sync(program)
  assert changed['payload']['workSection']=='Fresh form entry'
  program.locator('#editEventBtn').click();form=program.locator('#eventForm');form.locator('[name=notes]').fill('Edited after a background refresh')
  program.evaluate('window.FieldReadySync.syncNow(undefined,{requireFresh:true})');form.locator('button[type=submit]').click();expect(program.locator('#modal')).to_be_hidden()
  assert event['payload']['notes']=='Edited after a background refresh'
  home(program)
  check('form entries survive background refresh; concurrent participant edits are rejected without data loss')
  check('Program manager creates/assigns a scoped class, adds roster, records enrollment, and syncs')
  outsider=session(browser,'outsider',390);assert outsider.locator('[data-event]').count()==0;assert not outsider.locator('#newEventBtn').is_visible();check('unassigned evaluator sees no class data or management controls')
  evaluator=session(browser,'evaluator',390);layout(evaluator,'evaluator-dashboard-mobile')
  assert not evaluator.locator('#newEventBtn').is_visible() and not evaluator.locator('#adminBtn').is_visible()
  evaluator.locator('[data-event]').click();assert not evaluator.locator('#editEventBtn').is_visible()
  grade(evaluator,'N001');grade(evaluator,'N002',True)
  assert sorted(e['final_result'] for e in api.tables['fr_evaluations'])==['FAIL','PASS']
  evaluator_csv=exported(evaluator)
  program.locator('[data-event]').click();manager_csv=exported(program)
  assert evaluator_csv==manager_csv
  rows=list(csv.DictReader(io.StringIO(manager_csv)));assert len(rows)==26
  assert {r['final_result'] for r in rows}=={'PASS','FAIL'}
  check('Evaluator grading, 5×5 failure taxonomy, required comments/timing, PASS/critical FAIL, and matching second-device CSV')
  # Fresh export failure is explicit; local Backup still works offline.
  program.context.set_offline(True);program.locator('#exportEventBtn').click()
  assert 'Export paused' in alerts[-1]
  with program.expect_download() as info:program.locator('#backupAllBtn').click()
  assert json.loads(Path(info.value.path()).read_text())['events']
  program.context.set_offline(False)
  program.locator('#closeEventBtn').click();expect(program.locator('#eventKicker')).to_contain_text('CLOSED')
  assert len(api.archives)==1
  sync(evaluator);evaluator.locator('[data-grade]').first.click();assert evaluator.locator('#reviewFinalizeBtn').is_disabled()
  check('Offline export warning/local backup and manager close/archive followed by evaluator read-only refresh')
  home(enterprise);sync(enterprise);enterprise.locator('[data-event]').click();enterprise.locator('#deleteEventBtn').click()
  expect(enterprise.locator('#homeView')).to_have_class('view active');assert event.get('deleted_at')
  assert len(api.tables['fr_evaluations'])==2
  check('Enterprise deletes a closed class while assessment records remain retained')
  assert not api.errors,api.errors
  assert not production_requests,production_requests
  assert not errors,errors
  browser.close()
finally:
 for i,page in enumerate(pages):
  if not page.is_closed():
   try:page.screenshot(path=str(artifacts/f'journey-{i}.png'),full_page=True)
   except Exception:pass
 server.shutdown()
print(f'{len(checks)} complete journey groups passed; production sync.js used throughout.')
