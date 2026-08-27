const CACHE = 'aram-pwa-v9';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './js/domain.js',
  './js/reports.js',
  './js/commands.js',
  './js/store.js',
  './js/timer.js',
  './js/native-timer-bridge.js',
  './js/diagnostics.js',
  './js/developer-mode.js',
  './js/modules.js',
  './js/module-commands.js',
  './js/onboarding.js',
  './js/module-ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/sounds/aram-calm.wav',
  './assets/sounds/aram-soft-bell.wav',
  './assets/sounds/aram-chime.wav',
  './assets/sounds/aram-minimal.wav'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', response.clone())));
        return response;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(response => {
      if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())));
      return response;
    });
    if (cached) {
      event.waitUntil(network.catch(() => null));
      return cached;
    }
    try { return await network; } catch { return Response.error(); }
  })());
});
