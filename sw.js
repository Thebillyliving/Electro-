const V='rocero-v2';
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(['/','/icon-192.png'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET'||!r.url.startsWith(self.location.origin))return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r).then(x=>x||caches.match('/'))));return}
  e.respondWith(caches.match(r).then(x=>x||fetch(r)));
});
