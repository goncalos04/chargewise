const prefix = 'chargewise-' + self.registration.scope + '-';
const version = prefix + '3';
const files = ['./index.html', './style.css', './app.js', './finance.js', './data.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const assets = new Set(files.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key.startsWith(prefix) && key !== version).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(version).then(cache => cache.match('./index.html')).then(hit => hit || fetch(event.request)));
  } else if (assets.has(event.request.url)) {
    event.respondWith(caches.open(version).then(cache => cache.match(event.request)).then(hit => hit || fetch(event.request)));
  }
});
