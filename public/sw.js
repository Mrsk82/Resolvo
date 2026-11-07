/* Resolvo service worker: lets the app be installed, keeps the look fast, shows alerts from the server.
   It never stores anything from /api, so customer data is not kept on the device by this file. */
const VERSION = 'resolvo-sw-2';
const STATIC = ['/offline.html', '/logo-mark.svg', '/icons/icon-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('/offline.html'))); return; }
  if (/^\/(css|js|icons)\//.test(url.pathname) || /\.(svg|png|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Resolvo', body: e.data ? e.data.text() : '' }; }
  // an alert about a ticket can carry Reply / Assign to me / Resolve; the token in it works for that one ticket for 24 hours
  e.waitUntil(self.registration.showNotification(d.title || 'Resolvo', { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag || undefined, actions: Array.isArray(d.actions) ? d.actions.slice(0, 3) : [], data: { url: d.url || '/', token: d.actionToken || '', ticketId: d.ticketId || '' } }));
});
async function runAction(action, data, text) {
  const say = (title, body) => self.registration.showNotification(title, { body: body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'done-' + (data.ticketId || 'x'), silent: true, data: { url: data.url || '/' } })
    .then(() => new Promise(r => setTimeout(r, 4500))).then(() => self.registration.getNotifications({ tag: 'done-' + (data.ticketId || 'x') })).then(l => l.forEach(n => n.close()));
  try {
    const r = await fetch('/api/push-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: data.token, action, text: text || '' }) }).then(x => x.json());
    return say(r && r.success ? (r.message || 'Done') + ' ✓' : 'Could not do that', r && r.success ? (data.ticketId || '') : (r && r.error) || 'Open the app to check the ticket.');
  } catch (err) { return say('No signal', 'Open the app and try again when you are back online.'); }
}
self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {}, act = e.action, url = d.url || '/';
  e.notification.close();
  if (act && d.token && (act !== 'reply' || e.reply)) { e.waitUntil(runAction(act, d, e.reply)); return; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ open: url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
