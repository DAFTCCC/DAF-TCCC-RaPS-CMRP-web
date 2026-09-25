const CACHE='fieldready-study-v4.2.5';

const ASSETS=[
  './',
  './index.html',
  './styles.css',
  './version.js',
  './access-config.js',
  './backend-config.js',
  './locations.js',
  './skills.js',
  './sync.js',
  './app.js',
  './manifest.webmanifest',
  './assets/icon.svg'
];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  const url=new URL(e.request.url);

  // Never cache or intercept backend/API requests. Cross-origin FieldReady
  // Supabase reads must always reach the server so sync cannot reuse stale data.
  if(url.origin!==self.location.origin) return;

  // Always try the current backend configuration first.
  // Use the cached copy only when offline.
  if(url.pathname.endsWith('/backend-config.js')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(resp=>{
          const copy=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
          return resp;
        })
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request)
      .then(r=>r||fetch(e.request).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
        return resp;
      }).catch(()=>caches.match('./index.html')))
  );
});
