"""Temporary credentials through production UI/sync against a synthetic API.

Actual function authorization and database gates have separate Node/PGlite tests.
No requests reach the NUC and no real identities or passwords are used.
"""
import json,subprocess,threading
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from support.browser_runtime import chromium_options
from support.fieldready_api import FieldReadyAPI
ROOT=Path(__file__).resolve().parents[1]
locations=json.loads(subprocess.check_output(['node','-e',"global.window={};require('./locations.js');console.log(JSON.stringify(window.FIELDREADY_LOCATION_DATA))"],cwd=ROOT,text=True))
base=next(i for i in locations['installations'] if i.get('active',True) and i.get('commands'))
api=FieldReadyAPI(base['commands'][0],base['id'])
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];production=[];contexts=[]
config="window.FIELDREADY_BACKEND={enabled:true,url:'https://fieldready.test.invalid/fieldready',anonKey:'test-public',auth:{sessionKey:'FIELDREADY_SUPABASE_SESSION_V1'},tables:{events:'fr_events',participants:'fr_participants',evaluations:'fr_evaluations',voids:'fr_voids',profiles:'fr_profiles',memberships:'fr_memberships',accountRequests:'fr_account_requests'},functions:{login:'fieldready-login',accountAdmin:'fieldready-account-admin'},autoSyncDelayMs:1500};"
def page_for(browser,width=390):
 context=browser.new_context(service_workers='block',viewport={'width':width,'height':844});contexts.append(context)
 page=context.new_page();page.set_default_timeout(8000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept())
 page.route('https://fieldready.test.invalid/**',api.handle)
 def block(route):production.append(route.request.url);route.abort()
 page.route('https://raps-supabase.asuscomm.com/**',block)
 page.route('**/backend-config.js',lambda r:r.fulfill(status=200,content_type='application/javascript',body=config))
 page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle');return page

def login(page,username,password):
 page.locator('#accessEmail').fill(username);page.locator('#accessPassword').fill(password);page.locator('#ackCheck').check();page.locator('#enterBtn').click()

def take_password(page):
 expect(page.locator('#issuedTemporaryPassword')).to_be_visible()
 assert page.locator('#issuedTemporaryPassword').get_attribute('type')=='password'
 password=page.locator('#issuedTemporaryPassword').input_value()
 page.locator('#revealTemporaryPasswordBtn').click();assert page.locator('#issuedTemporaryPassword').get_attribute('type')=='text'
 assert password not in page.evaluate('JSON.stringify(localStorage)')
 assert password not in page.evaluate('JSON.stringify(window.FieldReadySync.getDb?.()||{})')
 assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
 page.locator('#dismissTemporaryPasswordBtn').click();expect(page.locator('#issuedTemporaryPassword')).to_have_count(0)
 return password

def change(page,current,new='Private-Study-Password-123'):
 form=page.locator('#requiredPasswordForm');form.locator('[name=temporaryPassword]').fill(current)
 form.locator('[name=newPassword]').fill(new);form.locator('[name=confirmPassword]').fill(new)
 form.locator('button[type=submit]').click()

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**chromium_options())
  admin=page_for(browser,1280);login(admin,'enterprise','valid-password');expect(admin.locator('#safeguard')).to_be_hidden();admin.locator('#adminBtn').click()
  # All three provisionable roles and correct scopes, including PM parent command.
  for role in ['evaluator','program_manager','majcom_manager']:
   admin.locator('#createTemporaryUserBtn').click();form=admin.locator('#createTemporaryUserForm')
   form.locator('[name=displayName]').fill('Synthetic '+role);form.locator('[name=email]').fill(role+'.new@example.invalid');form.locator('[name=username]').fill('new.'+role)
   form.locator('[name=role]').select_option(role)
   assert form.locator('[name=role] option[value=enterprise]').count()==0
   if role=='program_manager':
    form.locator('[name=scopeValue]').select_option(base['id']);form.locator('[name=parentScope]').select_option(base['commands'][0])
   if role=='majcom_manager':form.locator('[name=scopeValue]').select_option(base['commands'][0])
   form.locator('button[type=submit]').click();temporary=take_password(admin)
   target=next(x for x in api.tables['fr_profiles'] if x.get('username')=='new.'+role)
   assert not target['active'] and target['password_change_required']
   if role=='evaluator':
    # An Enterprise rename must work while the account is waiting for setup.
    admin.locator('[data-edit-user="'+target['user_id']+'"]').click();admin.locator('#manageUsernameBtn').click();admin.locator('#usernameForm [name=username]').fill('renamed.evaluator');admin.locator('#usernameForm button[type=submit]').click();expect(admin.locator('#modal')).to_be_hidden()
    assert target['username']=='renamed.evaluator' and not target['active']
   if role=='program_manager':assert api.membership(target['user_id'])['parent_scope_value']==base['commands'][0]
   user=page_for(browser);start=len(api.calls);login(user,target['username'],temporary)
   expect(user.locator('#requiredPasswordForm')).to_be_visible();expect(user.locator('#modalClose')).to_be_hidden()
   assert user.locator('main').get_attribute('inert') is not None
   assert not any(c[0]==target['user_id'] and (c[2].endswith('/fr_events') or c[2].endswith('/fr_evaluations')) for c in api.calls[start:])
   user.keyboard.press('Escape');expect(user.locator('#requiredPasswordForm')).to_be_visible()
   if role=='evaluator':
    form=user.locator('#requiredPasswordForm');form.locator('[name=temporaryPassword]').fill(temporary);form.locator('[name=newPassword]').fill('Private-Study-Password-123');form.locator('[name=confirmPassword]').fill('Different-Password-123');form.locator('button[type=submit]').click()
    expect(user.locator('#requiredPasswordError')).to_contain_text('do not match')
    change(user,'incorrect-current');expect(user.locator('#requiredPasswordError')).to_contain_text('incorrect')
    user.reload(wait_until='networkidle');expect(user.locator('#requiredPasswordForm')).to_be_visible()
    assert user.locator('[name=temporaryPassword]').input_value()==''
    user.locator('#cancelRequiredPasswordBtn').click();expect(user.locator('#requiredPasswordForm')).to_have_count(0)
    login(user,target['username'],temporary);expect(user.locator('#requiredPasswordForm')).to_be_visible()
   change(user,temporary);expect(user.locator('#safeguard')).to_be_hidden();expect(user.locator('#modal')).to_be_hidden()
   assert target['active'] and not target['password_change_required']
   expect(user.locator('#createTemporaryUserBtn')).to_be_hidden()
   user.evaluate('window.FieldReadySync.signOut()');user.reload(wait_until='networkidle')
   login(user,target['username'],temporary);expect(user.locator('#accessError')).to_be_visible()
   login(user,target['username'],'Private-Study-Password-123');expect(user.locator('#safeguard')).to_be_hidden()
   print('PASS: create, forced first-login change, and replacement credentials for '+role,flush=True)
  # Reset retains identity, role and class assignment, while closing prior access.
  api.assignments['synthetic-class']=['evaluator'];before=dict(api.profile('evaluator'))
  admin.locator('[data-edit-user=evaluator]').click();admin.locator('#resetTemporaryPasswordBtn').click();admin.locator('#resetTemporaryPasswordForm button[type=submit]').click();temporary=take_password(admin)
  assert api.profile('evaluator')['role']==before['role'] and api.assignments['synthetic-class']==['evaluator']
  reset=page_for(browser);login(reset,'evaluator','valid-password');expect(reset.locator('#accessError')).to_be_visible()
  login(reset,'evaluator',temporary);expect(reset.locator('#requiredPasswordForm')).to_be_visible();change(reset,temporary);expect(reset.locator('#safeguard')).to_be_hidden()
  admin.locator('[data-edit-user=enterprise]').click();expect(admin.locator('#resetTemporaryPasswordBtn')).to_have_count(0);admin.locator('#modalClose').click()
  print('PASS: reset preserves assignments, rejects old password, and requires private replacement',flush=True)
  # Migration absent: display an actionable setup message before any mutation.
  del api.profile('enterprise')['password_change_required']
  admin.reload(wait_until='networkidle');admin.locator('#adminBtn').click();start=len(api.calls);admin.locator('#createTemporaryUserBtn').click()
  expect(admin.locator('#modalBody')).to_contain_text('Install the FieldReady temporary-password update')
  assert not any(c[2].endswith('fieldready-account-admin') for c in api.calls[start:])
  assert not production and not api.errors and not errors,(production,api.errors,errors)
  print('PASS: missing NUC migration blocks creation with setup instructions; no browser errors or live requests',flush=True)
  for context in contexts:context.close()
  browser.close()
finally:server.shutdown()
