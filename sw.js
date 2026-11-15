const CACHE = 'batch-logo-v2';
const CORE = ['./', './index.html', './v3.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  // اگر یک فایل پیدا نشود addAll کل نصب را خراب می‌کند؛ اینجا هر فایل جدا کش می‌شود
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/script\.google|googleusercontent|ipify/.test(url.hostname)) return;

  const save = res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  };

  if (url.origin === location.origin) {
    // اول کش (فوری)، همزمان از اینترنت به‌روز می‌شود
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(save).catch(() => hit);
        return hit || net;
      })
    );
  }
});
