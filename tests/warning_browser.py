"""Verify warning-only entry and local event creation without backend requests."""
import json,threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1])))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=b.new_page()
  errors=[];backend=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def block(route):
   backend.append(route.request.url);route.abort()
  page.route('**/access-config.js',lambda route:route.fulfill(status=200,content_type='application/javascript',body="window.FIELDREADY_ACCESS={mode:'warning-only'};"))
  page.route('https://raps-supabase.asuscomm.com/**',block)
  original=json.dumps({'events':[{'id':'private-existing-study-record','participants':[]}]})
  page.add_init_script('localStorage.setItem("FIELDREADY_LONGITUDINAL_STUDY_V4",'+json.dumps(original)+');')
  page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
  assert not page.locator('#accessEmail').is_visible()
  assert page.locator('#enterBtn').is_disabled()
  page.locator('#ackCheck').check();page.locator('#enterBtn').click()
  assert not page.locator('#safeguard').is_visible()
  assert 'No study events yet' in page.locator('#eventsList').inner_text()
  page.locator('#newEventBtn').click()
  f=page.locator('#eventForm')
  f.locator('[name=name]').fill('Warning mode test')
  f.locator('[name=majcom]').select_option(index=1)
  f.locator('[name=homeInstallationId]').select_option(index=1)
  f.locator('[name=leadEvaluatorId]').select_option('local-test-evaluator')
  f.locator('button[type=submit]').click()
  assert page.locator('#eventTitle').inner_text()=='Warning mode test'
  assert len(page.evaluate('JSON.parse(localStorage.getItem("FIELDREADY_LOCAL_TEST_V1")).events'))==1
  assert page.evaluate('localStorage.getItem("FIELDREADY_LONGITUDINAL_STUDY_V4")')==original
  page.locator('#lockBtn').click()
  assert page.locator('#safeguard').is_visible()
  assert page.locator('#enterBtn').is_disabled()
  page.reload(wait_until='networkidle')
  assert page.locator('#safeguard').is_visible()
  assert not errors,errors
  assert not backend,backend
  print('Warning mode PASS: acknowledgement, local event creation, protected study storage, re-lock/reload, zero backend requests')
  b.close()
finally:server.shutdown()
