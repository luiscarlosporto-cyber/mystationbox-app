// Rede primeiro (as atualizações chegam logo); a cache só serve quando não há rede.
const CACHE = 'mystationbox-v216';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r, {cache: 'no-cache'}).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; })
    .catch(() => caches.match(r, {ignoreSearch: true})));
});

/* Notificações push (Ponto Digital e Avarias, 25/11/2026): um só recetor para as duas, com a mesma chave VAPID e as mesmas
   subscrições (msb_ponto_push). Carga: {titulo, corpo, url, tag, critica}. As do Ponto (tag «ponto…») e as avarias críticas
   ficam no ecrã até serem vistas; tocar abre a app no sítio certo (Ponto Digital ou a ficha da avaria). */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = {corpo: e.data && e.data.text()}; }
  const tag = d.tag || 'ponto', ponto = /^ponto/.test(tag);
  e.waitUntil(self.registration.showNotification(d.titulo || 'mystationbox', {
    body: d.corpo || '', icon: 'icone-192.png', badge: 'icone-64.png', tag, renotify: true,
    requireInteraction: ponto || !!d.critica, vibrate: d.critica ? [300, 120, 300, 120, 300] : [200],
    data: {url: d.url || './', msb: ponto ? 'ponto' : 'avaria'}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const dados = e.notification.data || {}, url = new URL(dados.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope)) { c.postMessage({msb: dados.msb || 'ponto', tipo: 'abrir', url}); return c.focus(); }
    return clients.openWindow(url);
  }));
});
