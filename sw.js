const CACHE='repomove-v1';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.json'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e=>{
  const url=new URL(e.request.url);
  if(url.origin!==location.origin){ return; } // let GH API bypass cache
  e.respondWith(caches.match(e.request).then(cached=> cached || fetch(e.request).then(r=>{ const c=r.clone(); caches.open(CACHE).then(cache=>cache.put(e.request,c)); return r; }).catch(()=>cached)));
});
