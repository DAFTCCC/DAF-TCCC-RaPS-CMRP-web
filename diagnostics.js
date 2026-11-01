// FieldReady beta diagnostics.
// Silently records technical problems (errors, failed/slow requests, rage and
// dead clicks, UI freezes, error messages shown to the user) so they can be
// analyzed and fixed. Never records participant IDs, names, ratings, comments,
// request bodies or any free text typed by the user. Every string is scrubbed.
// Events are kept on the device first and uploaded to the write-only
// fr_client_diagnostics table when signed in and online.
(function(root){
'use strict';

const STORE_KEY='FIELDREADY_DIAG_V1';
const MAX_STORED=400;          // ring buffer on the device
const UPLOAD_BATCH=50;
const UPLOAD_EVERY_MS=60000;
const RAGE_CLICKS=4;           // this many clicks...
const RAGE_WINDOW_MS=2000;     // ...on the same control within this window
const DEAD_CLICK_MS=1200;      // no visible response within this window
const SLOW_REQUEST_MS=5000;
const FREEZE_MS=1000;
const TRAIL_LEN=8;
const KINDS=['js_error','promise_rejection','request_failed','request_slow','rage_click','dead_click','ui_freeze','error_shown'];

// ---------- pure helpers (unit-tested) ----------
const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL=/[^\s@'"()]+@[^\s@'"()]+\.[^\s@'"()]+/g;
const JWT=/eyJ[\w-]+\.[\w-]+\.[\w-]+/g;

function scrub(text,max){
  let s=String(text==null?'':text);
  s=s.replace(JWT,':token').replace(UUID,':id').replace(EMAIL,':email');
  s=s.replace(/=\([^)]*\)/g,'=(…)');                 // Postgres "Key (...)=(values)"
  s=s.replace(/'[^']*'|"[^"]*"|“[^”]*”/g,'"…"');      // quoted values
  s=s.replace(/[\w.\-/#]*\d[\w.\-/#]*/g,'#');          // any token containing a digit
  s=s.replace(/\s+/g,' ').trim();
  return s.slice(0,max||300);
}

function cleanPath(url,base){
  try{
    const u=new URL(url,'https://x.invalid');
    let p=u.pathname;
    if(base){try{const b=new URL(base).pathname.replace(/\/$/,'');if(b&&p.startsWith(b))p=p.slice(b.length)||'/';}catch{}}
    p=p.replace(UUID,':id').split('/').map(seg=>/\d/.test(seg)&&seg.length>2&&!/^v\d$/.test(seg)?':n':seg).join('/');
    const keys=[...u.searchParams.keys()].filter((k,i,a)=>a.indexOf(k)===i).sort();
    return (p+(keys.length?'?'+keys.join('&'):'')).slice(0,200);
  }catch{return 'unparseable';}
}

function stackFrames(stack){
  return String(stack||'').split('\n').map(l=>{
    const loc=l.match(/([\w.\-]+\.js)(?:\?[^:\s)]*)?:(\d+):(\d+)/);
    if(!loc)return null;
    const fn=(l.match(/^\s*at\s+([^\s(]+)\s+\(/)||l.match(/^\s*([^@\s]+)@/)||[])[1]||'?';
    return `${fn.replace(/[^\w.$<>]/g,'').slice(0,60)||'?'} ${loc[1]}:${loc[2]}:${loc[3]}`;
  }).filter(Boolean).slice(0,8);
}

function describeTarget(el){
  if(!el||!el.tagName)return 'unknown';
  const parts=[];let node=el,depth=0;
  while(node&&node.tagName&&depth<4){
    let d=node.tagName.toLowerCase();
    if(node.id){parts.unshift(d+'#'+scrub(node.id,40));break;}
    const act=node.getAttribute&&(node.getAttribute('data-action')||node.getAttribute('name'));
    if(act)d+='['+scrub(act,30)+']';
    const cls=(node.className&&typeof node.className==='string')?node.className.trim().split(/\s+/).slice(0,2).map(c=>scrub(c,20)).join('.'):'';
    if(cls)d+='.'+cls;
    parts.unshift(d);node=node.parentElement;depth++;
  }
  return parts.join('>').slice(0,200);
}

function makeRageDetector(now){
  let lastKey=null,times=[];
  return function(key){
    const t=now();
    if(key!==lastKey){lastKey=key;times=[];}
    times=times.filter(x=>t-x<=RAGE_WINDOW_MS);times.push(t);
    if(times.length===RAGE_CLICKS)return true;   // report once per burst
    return false;
  };
}

function capQueue(list,max){return list.length>max?list.slice(list.length-max):list;}

const core={scrub,cleanPath,stackFrames,describeTarget,makeRageDetector,capQueue,KINDS,RAGE_CLICKS,RAGE_WINDOW_MS};
if(typeof module!=='undefined'&&module.exports){module.exports=core;}
if(typeof window==='undefined'||!root.document)return;

// ---------- browser runtime ----------
try{
  const CFG=()=>root.FIELDREADY_BACKEND||{};
  const sessionId=(root.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
  const trail=[];
  const nativeFetch=root.fetch?root.fetch.bind(root):null;
  let inflight=0,lastActivity=0,uploading=false,backoffUntil=0;

  const load=()=>{try{return JSON.parse(localStorage.getItem(STORE_KEY))||[];}catch{return [];}};
  const save=list=>{try{localStorage.setItem(STORE_KEY,JSON.stringify(capQueue(list,MAX_STORED)));}catch{}};
  const view=()=>{try{const v=document.querySelector('.view.active');return v&&v.id?v.id:'none';}catch{return 'none';}};
  const version=()=>{try{return root.FIELDREADY_BUILD?.versionName||'';}catch{return '';}};
  const crumb=c=>{trail.push(c);if(trail.length>TRAIL_LEN)trail.shift();};

  function record(kind,fields){
    try{
      if(KINDS.indexOf(kind)<0)return;
      const ev={
        id:(root.crypto&&crypto.randomUUID)?crypto.randomUUID():undefined,
        occurred_at:new Date().toISOString(),
        session_id:sessionId,
        app_version:String(version()).replace(/[^\w.\-]/g,'').slice(0,40)||null,
        kind,
        view:scrub(fields.view||view(),40),
        target:fields.target?String(fields.target).slice(0,200):null,
        message:fields.message?scrub(fields.message,300):null,
        detail:Object.assign({trail:trail.slice()},fields.detail||{}),
        user_agent:String(navigator.userAgent||'').slice(0,200),
        viewport:`${innerWidth}x${innerHeight}`,
        online:navigator.onLine!==false,
        uploaded:false
      };
      if(JSON.stringify(ev.detail).length>3000)ev.detail={trail:trail.slice(-3),truncated:true};
      const list=load();list.push(ev);save(list);
    }catch{}
  }

  // Errors.
  root.addEventListener('error',e=>{
    if(e&&e.target&&e.target!==root&&e.target.tagName){record('js_error',{message:'Resource failed to load',target:describeTarget(e.target)});return;}
    record('js_error',{message:e&&e.message,detail:{frames:stackFrames(e&&e.error&&e.error.stack),at:e&&e.filename?(e.filename.split('/').pop().split('?')[0]+':'+e.lineno+':'+e.colno):null}});
  },true);
  root.addEventListener('unhandledrejection',e=>{
    const r=e&&e.reason;record('promise_rejection',{message:r&&r.message?r.message:String(r),detail:{frames:stackFrames(r&&r.stack)}});
  });

  // Requests: failures and slow responses. Never reads request bodies.
  if(nativeFetch){
    root.fetch=function(input,init){
      const url=typeof input==='string'?input:(input&&input.url)||'';
      const method=((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
      const isDiag=url.indexOf('/rest/v1/fr_client_diagnostics')>=0;
      const started=Date.now();inflight++;lastActivity=started;
      const p=nativeFetch(input,init);
      if(isDiag){p.finally(()=>{inflight--;});return p;}
      const path=cleanPath(url,CFG().url);
      return p.then(res=>{
        inflight--;lastActivity=Date.now();
        const ms=Date.now()-started;
        if(!res.ok&&res.status!==401){
          res.clone().text().then(t=>{let m=t;try{const j=JSON.parse(t);m=j.message||j.error_description||j.error||j.code||'';}catch{}
            record('request_failed',{message:m,target:method+' '+path,detail:{status:res.status,ms}});}).catch(()=>record('request_failed',{target:method+' '+path,detail:{status:res.status,ms}}));
        }else if(ms>SLOW_REQUEST_MS){record('request_slow',{target:method+' '+path,detail:{status:res.status,ms}});}
        return res;
      },err=>{
        inflight--;lastActivity=Date.now();
        record('request_failed',{message:err&&err.message,target:method+' '+path,detail:{status:0,ms:Date.now()-started,online:navigator.onLine!==false}});
        throw err;
      });
    };
  }

  // Rage clicks and dead clicks.
  const rage=makeRageDetector(()=>Date.now());
  const deadSeen={};
  document.addEventListener('click',e=>{
    try{
      const el=e.target&&e.target.closest&&e.target.closest('button,a,[role=button],input[type=button],input[type=submit],input[type=checkbox],input[type=radio],select,label,.syncPill');
      if(!el)return;
      const key=describeTarget(el);
      crumb('click '+key+' @'+view());
      if(rage(key))record('rage_click',{target:key,detail:{clicks:RAGE_CLICKS,window_ms:RAGE_WINDOW_MS}});
      if(el.matches('select,label,input[type=checkbox],input[type=radio]')||el.getAttribute('aria-disabled')==='true')return;
      const before=lastActivity,startView=view();let changed=false;
      const mo=new MutationObserver(()=>{changed=true;});
      mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
      setTimeout(()=>{mo.disconnect();
        if(!changed&&lastActivity===before&&inflight===0&&view()===startView&&document.visibilityState==='visible'&&document.hasFocus()
           &&!(deadSeen[key]&&Date.now()-deadSeen[key]<5000)){
          deadSeen[key]=Date.now();
          record('dead_click',{target:key,detail:{wait_ms:DEAD_CLICK_MS}});
        }
      },DEAD_CLICK_MS);
    }catch{}
  },true);

  // View changes for the trail.
  try{new MutationObserver(()=>{const v=view();if(trail[trail.length-1]!=='view '+v)crumb('view '+v);})
    .observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});}catch{}

  // UI freezes.
  try{if(root.PerformanceObserver&&PerformanceObserver.supportedEntryTypes&&PerformanceObserver.supportedEntryTypes.indexOf('longtask')>=0)
    new PerformanceObserver(list=>{list.getEntries().forEach(en=>{if(en.duration>=FREEZE_MS)record('ui_freeze',{detail:{ms:Math.round(en.duration)}});});}).observe({type:'longtask',buffered:true});}catch{}

  // Error messages shown to the user: the on-screen #toast box and alert().
  const looksLikeProblem=/fail|error|cannot|can't|unable|block|denied|invalid|conflict|offline|required|missing|expired|stale|retry|not allowed|must/i;
  function watchShown(){
    const box=document.getElementById('toast');
    if(box){let last='';new MutationObserver(()=>{const t=box.textContent||'';
      if(t&&t!==last&&!box.classList.contains('hidden')&&looksLikeProblem.test(t))record('error_shown',{message:t,target:'toast'});last=t;})
      .observe(box,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});}
    const orig=root.alert;
    if(typeof orig==='function'&&!orig.__frDiag){const w=function(msg){try{if(looksLikeProblem.test(String(msg)))record('error_shown',{message:msg,target:'alert'});}catch{}return orig.apply(this,arguments);};
      w.__frDiag=true;try{root.alert=w;}catch{}}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchShown);else watchShown();

  // Upload pending events when signed in and online.
  async function upload(){
    if(uploading||!nativeFetch||Date.now()<backoffUntil)return;
    if(root.FIELDREADY_ACCESS&&root.FIELDREADY_ACCESS.mode==='warning-only')return;
    const cfg=CFG();if(!cfg.enabled||!cfg.url||!cfg.anonKey||navigator.onLine===false)return;
    let s=null;try{s=JSON.parse(sessionStorage.getItem((cfg.auth&&cfg.auth.sessionKey)||'FIELDREADY_SUPABASE_SESSION_V1'));}catch{}
    if(!s||!s.access_token||!s.user||!s.user.id)return;
    if(s.expires_at&&s.expires_at*1000<Date.now()+30000)return;   // let the app refresh the token first
    const list=load();const batch=list.filter(e=>!e.uploaded).slice(0,UPLOAD_BATCH);if(!batch.length)return;
    uploading=true;
    try{
      const rows=batch.map(e=>({id:e.id,occurred_at:e.occurred_at,session_id:e.session_id,app_version:e.app_version,kind:e.kind,view:e.view,target:e.target,message:e.message,detail:e.detail,user_agent:e.user_agent,viewport:e.viewport,online:e.online,user_id:s.user.id}));
      const res=await nativeFetch(cfg.url.replace(/\/$/,'')+'/rest/v1/fr_client_diagnostics',{method:'POST',
        headers:{apikey:cfg.anonKey,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json',Prefer:'return=minimal,resolution=ignore-duplicates'},
        body:JSON.stringify(rows)});
      if(res.ok){const sent=new Set(batch.map(e=>e.id));save(load().map(e=>sent.has(e.id)?Object.assign(e,{uploaded:true}):e));}
      else backoffUntil=Date.now()+5*60000;
    }catch{backoffUntil=Date.now()+60000;}
    finally{uploading=false;}
  }
  setInterval(upload,UPLOAD_EVERY_MS);
  setTimeout(upload,15000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')upload();});
  root.addEventListener('online',()=>setTimeout(upload,3000));

  // Developer access only (browser console): FIELDREADY_DIAG.export()
  Object.defineProperty(root,'FIELDREADY_DIAG',{value:Object.freeze({export:()=>load(),flush:upload}),enumerable:false});
}catch{}
})(typeof window!=='undefined'?window:globalThis);
