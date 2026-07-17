const CACHE_NAME = 'investment-manager-v2-static-v1';
const STATIC_ASSETS = [
  './', './index.html', './manifest.json', './assets/icon.svg',
  './css/theme.css', './css/app.css', './css/dashboard.css',
  './js/utils.js', './js/jalali-date.js', './js/firebase.js', './js/ledger.js',
  './js/compound-profit.js', './js/dashboard.js', './js/management-dashboard.js',
  './js/reports.js', './js/backup.js', './js/investors.js', './js/mobile.js', './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === location.origin) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
