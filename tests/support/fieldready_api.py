"""Stateful test double for the FieldReady HTTP contract, never a live NUC.

The browser runs the production sync.js. Authorization here is a test model;
these checks cannot establish which RLS policies are installed on a real NUC.
"""
import copy,json,time,uuid
from urllib.parse import urlsplit,parse_qs

class ApiError(Exception):
 def __init__(self,status,message): self.status,self.message=status,message

class FieldReadyAPI:
 def __init__(self,command,installation):
  self.command,self.installation=command,installation
  self.tables={name:[] for name in ['fr_events','fr_participants','fr_evaluations','fr_voids','fr_profiles','fr_memberships','fr_account_requests']}
  self.passwords={};self.assignments={};self.evaluator_scopes=set();self.pools={};self.calls=[];self.errors=[];self.archives=[]
  for uid,role in [('enterprise','enterprise'),('majcom','majcom_manager'),('program','program_manager'),('evaluator','evaluator'),('unassigned','evaluator'),('candidate','evaluator'),('outsider','evaluator')]:
   self.tables['fr_profiles'].append({'user_id':uid,'username':uid,'email':uid+'@example.invalid','display_name':uid.title(),'active':True,'role':role,'password_change_required':False,'password_resume_active':False})
   self.passwords[uid]='valid-password'
  self.tables['fr_memberships']=[{'id':'m1','user_id':'majcom','scope_type':'majcom','scope_value':command},{'id':'m2','user_id':'program','scope_type':'installation','scope_value':installation,'parent_scope_value':command}]
  self.evaluator_scopes.add(('evaluator',command))
 def profile(self,uid):return next((p for p in self.tables['fr_profiles'] if p['user_id']==uid),None)
 def membership(self,uid):return next((p for p in self.tables['fr_memberships'] if p['user_id']==uid),None)
 def manager(self,uid,event=None):
  p=self.profile(uid);m=self.membership(uid)
  if not p or not p['active']:return False
  if p['role']=='enterprise':return True
  if not event:return p['role'] in ['program_manager','majcom_manager']
  return bool(m and ((p['role']=='majcom_manager' and event['majcom']==m['scope_value']) or (p['role']=='program_manager' and event['home_installation_id']==m['scope_value'] and event['majcom']==m['parent_scope_value'])))
 def visible(self,uid,event):
  if not event or event.get('deleted_at'):return False
  return self.manager(uid,event) or (uid in self.assignments.get(event['id'],[]) and (uid,event['majcom']) in self.evaluator_scopes)
 def event(self,eid):return next((e for e in self.tables['fr_events'] if e['id']==eid),None)
 def permitted(self,uid,table,row):
  if table=='fr_profiles':return self.profile(uid)['role']=='enterprise' or row['user_id']==uid
  if table=='fr_memberships':return self.profile(uid)['role']=='enterprise' or row['user_id']==uid
  if table=='fr_account_requests':return self.profile(uid)['role']=='enterprise' or row['user_id']==uid
  return self.visible(uid,row if table=='fr_events' else self.event(row['event_id']))
 def handle(self,route):
  request=route.request
  try:
   status,body=self.request(request.method,request.url,request.headers,request.post_data)
  except ApiError as e:status,body=e.status,{'message':e.message}
  except Exception as e:
   self.errors.append(repr(e));status,body=500,{'message':'Unexpected test-server error: '+str(e)}
  route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(body))
 def request(self,method,url,headers,raw):
  parsed=urlsplit(url);path=parsed.path.removeprefix('/fieldready');query=parse_qs(parsed.query);body=json.loads(raw) if raw else {}
  uid=headers.get('authorization','').removeprefix('Bearer token-')
  self.calls.append((uid,method,path,copy.deepcopy(body)))
  if method=='OPTIONS':return 200,None
  if path=='/functions/v1/fieldready-login':
   profile=next((p for p in self.tables['fr_profiles'] if p.get('username')==body.get('username','').strip().lower() and (p['active'] or (p.get('password_change_required') and p.get('password_resume_active')))),None)
   if not profile or body.get('password')!=self.passwords.get(profile['user_id']):raise ApiError(400,'Invalid username or password.')
   uid=profile['user_id']
   return 200,{'access_token':'token-'+uid,'refresh_token':'refresh-'+uid,'expires_at':time.time()+3600,'user':{'id':uid,'email':profile['email']}}
  if path=='/auth/v1/token':
   profile=next((p for p in self.tables['fr_profiles'] if p['email']==body.get('email')),None)
   uid=profile['user_id'] if profile else ''
   if not profile or body.get('password')!=self.passwords.get(uid):raise ApiError(400,'Invalid login credentials')
   return 200,{'access_token':'token-'+uid,'refresh_token':'refresh-'+uid,'expires_at':time.time()+3600,'user':{'id':uid,'email':body['email']}}
  if path=='/auth/v1/signup':
   user='request-'+str(uuid.uuid4());self.tables['fr_account_requests'].append({'id':user,'user_id':user,'email':body['email'],'display_name':body['data']['display_name'],'majcom':body['data']['majcom'],'installation_id':body['data']['installation_id'],'status':'pending'})
   return 200,{'user':{'id':user}}
  if path=='/auth/v1/logout':return 200,None
  profile=self.profile(uid)
  if path=='/functions/v1/fieldready-account-admin' and body.get('action')=='change-temporary':
   if not profile or not profile.get('password_change_required') or not profile.get('password_resume_active'):raise ApiError(403,'Password setup is not available.')
   if profile['temporary_password_expires_at']<time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()):raise ApiError(403,'Temporary password has expired. Ask Enterprise for a new one.')
   if body.get('temporaryPassword')!=self.passwords[uid]:raise ApiError(400,'The current temporary password is incorrect.')
   if len(body.get('newPassword',''))<12:raise ApiError(400,'Choose at least 12 characters.')
   self.passwords[uid]=body['newPassword'];profile.update(active=True,password_change_required=False,password_resume_active=False,temporary_password_expires_at=None)
   return 200,{'session':{'access_token':'token-'+uid,'refresh_token':'refresh-'+uid,'expires_at':time.time()+3600,'user':{'id':uid,'email':profile['email']}}}
  # Self-profile reads remain available to an inactive account for password setup.
  if method=='GET' and path=='/rest/v1/fr_profiles' and profile and not profile['active']:
   return 200,[copy.deepcopy(profile)]
  if not profile or not profile['active']:raise ApiError(403,'Active account required')
  if path.startswith('/rest/v1/rpc/'):
   return 200,self.rpc(uid,path.split('/')[-1],body)
  if path=='/functions/v1/fieldready-account-admin':
   if profile['role']!='enterprise':raise ApiError(403,'Enterprise access required')
   if body.get('action') in ['create-temporary','reset-temporary']:
    if body['action']=='create-temporary':
     if any(p.get('username')==body['username'] for p in self.tables['fr_profiles']):raise ApiError(409,'Username unavailable')
     user='temporary-'+str(uuid.uuid4());target={'user_id':user,'username':body['username'],'email':body['email'],'display_name':body['displayName'],'role':body['role']}
     self.tables['fr_profiles'].append(target)
     if body.get('scopeType'):self.tables['fr_memberships'].append({'id':str(uuid.uuid4()),'user_id':user,'scope_type':body['scopeType'],'scope_value':body['scopeValue'],'parent_scope_value':body.get('parentScope')})
    else:
     user=body['userId'];target=self.profile(user)
     if user==uid or not target or not (target['active'] or target.get('password_resume_active')):raise ApiError(403,'An enabled account is required.')
    target.update(active=False,password_change_required=True,password_resume_active=True,temporary_password_expires_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()+86400)))
    password='Fr!SyntheticTemporary-'+str(uuid.uuid4());self.passwords[user]=password
    return 200,{'userId':user,'username':target['username'],'expiresAt':target['temporary_password_expires_at'],'temporaryPassword':password}
   user='invited-'+str(uuid.uuid4());self.tables['fr_profiles'].append({'user_id':user,'email':body['email'],'display_name':body['displayName'],'active':True,'role':body['role']})
   return 200,{'user_id':user}
  if not path.startswith('/rest/v1/'):raise AssertionError('Unexpected endpoint '+path)
  table=path.split('/')[-1]
  if table not in self.tables:raise AssertionError('Unknown table '+table)
  def matches(row):
   for key,values in query.items():
    if key in ['select','order','limit']:continue
    value=values[0]
    if value.startswith('eq.') and str(row.get(key))!=value[3:]:return False
    if value.startswith('gt.') and str(row.get(key))<=value[3:]:return False
   return True
  if method=='GET':
   rows=[r for r in self.tables[table] if self.permitted(uid,table,r) and matches(r)]
   rows=sorted(rows,key=lambda r:str(r.get('id','')))
   return 200,copy.deepcopy(rows[:int(query.get('limit',['1000'])[0])])
  if headers.get('x-fieldready-epoch')!='test-epoch':raise ApiError(409,'Stale data epoch')
  if method=='POST':
   for item in body:
    event=item if table=='fr_events' else self.event(item['event_id'])
    allowed=self.manager(uid,event) if table=='fr_events' else self.visible(uid,event)
    if not allowed or event.get('closed_at'):raise ApiError(403,'Write outside authorized open event')
    if any(r['id']==item['id'] for r in self.tables[table]):raise ApiError(409,'Duplicate record')
    self.tables[table].append({**copy.deepcopy(item),'server_revision':1,'created_by':uid})
   return 201,None
  if method=='PATCH':
   rows=[r for r in self.tables[table] if matches(r)]
   for row in rows:
    event=row if table=='fr_events' else self.event(row['event_id'])
    if not (self.manager(uid,event) if table=='fr_events' else self.visible(uid,event)):raise ApiError(403,'Write outside account scope')
    if event.get('closed_at') or row.get('finalized_at'):raise ApiError(403,'Record is immutable')
    row.update(copy.deepcopy(body));row['server_revision']+=1
   return 200,copy.deepcopy(rows)
  raise AssertionError('Unhandled method '+method)
 def rpc(self,uid,name,body):
  p=self.profile(uid);role=p['role'];member=self.membership(uid)
  if name=='fr_get_data_epoch':return 'test-epoch'
  if name=='fr_set_username':
   target=self.profile(body['p_user_id']);username=body['p_username'].strip().lower()
   if uid!=target['user_id'] and role!='enterprise':raise ApiError(403,'Account owner or Enterprise access required.')
   if any(x.get('username')==username and x!=target for x in self.tables['fr_profiles']):raise ApiError(409,'This username is unavailable. Choose another.')
   target['username']=username
   return username
  if name=='fr_manager_team':
   if not self.manager(uid):raise ApiError(403,'Manager required')
   candidates=[copy.deepcopy(p) for p in self.tables['fr_profiles'] if p['active'] and p['role']=='evaluator']
   pool=self.pools.get(uid,set())
   return {'scope_value':self.command,'evaluators':[p for p in candidates if p['user_id'] in pool],'candidates':candidates,'program_managers':[{**p,'installation_id':(self.membership(p['user_id']) or {}).get('scope_value'),'majcom':(self.membership(p['user_id']) or {}).get('parent_scope_value')} for p in self.tables['fr_profiles'] if p['role']=='program_manager']}
  if name in ['fr_appoint_evaluator','fr_remove_appointed_evaluator']:
   if not self.manager(uid):raise ApiError(403,'Manager required')
   target=body['p_evaluator_id'];command=body.get('p_majcom') or self.command
   if role!='enterprise' and command!=self.command:raise ApiError(403,'Wrong command')
   if name=='fr_appoint_evaluator':self.evaluator_scopes.add((target,command));self.pools.setdefault(uid,set()).add(target)
   else:
    self.pools.setdefault(uid,set()).discard(target)
    for eid,ids in self.assignments.items():
     if self.manager(uid,self.event(eid)) and target in ids:ids.remove(target)
   return True
  if name=='fr_assign_program_manager':
   if role not in ['enterprise','majcom_manager']:raise ApiError(403,'MAJCOM manager required')
   target=body['p_user_id'];self.profile(target)['role']='program_manager'
   self.tables['fr_memberships']=[m for m in self.tables['fr_memberships'] if m['user_id']!=target]+[{'id':str(uuid.uuid4()),'user_id':target,'scope_type':'installation','scope_value':body['p_installation'],'parent_scope_value':body['p_majcom']}]
   return True
  if name=='fr_eligible_evaluators':
   if not self.manager(uid):raise ApiError(403,'Manager required')
   return [copy.deepcopy(p) for p in self.tables['fr_profiles'] if p['active'] and p['role']=='evaluator' and (p['user_id'],body['p_majcom']) in self.evaluator_scopes and (role!='program_manager' or p['user_id'] in self.pools.get(uid,set()))]
  if name in ['fr_get_event_evaluators','fr_set_event_evaluators']:
   event=self.event(body['p_event_id'])
   if not self.manager(uid,event):raise ApiError(403,'Event manager required')
   if name=='fr_set_event_evaluators':self.assignments[event['id']]=body['p_user_ids'];return True
   return [{'user_id':u} for u in self.assignments.get(event['id'],[])]
  if name in ['fr_close_event','fr_delete_event']:
   event=self.event(body['p_event_id'])
   if not self.manager(uid,event):raise ApiError(403,'Event manager required')
   if name=='fr_delete_event':
    if role!='enterprise':raise ApiError(403,'Enterprise required')
    event['deleted_at']='2026-01-02T00:00:00Z';return True
   event['closed_at']='2026-01-02T00:00:00Z';event['closed_by']=uid;event['server_revision']+=1;self.archives.append(body['p_csv'])
   return {'closed_at':event['closed_at'],'archive_month':'2026-01'}
  if name in ['fr_approve_account_request','fr_deny_account_request','fr_set_user_access']:
   if role!='enterprise':raise ApiError(403,'Enterprise required')
   if name=='fr_set_user_access':
    target=self.profile(body['p_user_id']);target['active']=body['p_active'];target['role']=body['p_role']
    self.tables['fr_memberships']=[m for m in self.tables['fr_memberships'] if m['user_id']!=target['user_id']]
    if body.get('p_scope_type'):self.tables['fr_memberships'].append({'id':str(uuid.uuid4()),'user_id':target['user_id'],'scope_type':body['p_scope_type'],'scope_value':body['p_scope_value']})
    return True
   row=next(r for r in self.tables['fr_account_requests'] if r['id']==body['p_request_id'])
   row['status']='approved' if name=='fr_approve_account_request' else 'denied'
   if row['status']=='approved':self.tables['fr_profiles'].append({'user_id':row['user_id'],'email':row['email'],'display_name':row['display_name'],'active':True,'role':body['p_role']})
   return True
  raise AssertionError('Unhandled RPC '+name)
