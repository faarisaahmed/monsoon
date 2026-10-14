// Service worker: makes Boli work offline. Generated from sw.template.js by scripts/build.js.
const VERSION = '684eeeb0d6';
const CACHE = 'boli-' + VERSION;
const PRECACHE = ["./","index.html","css/style.css","manifest.webmanifest","assets/icon.svg","data/languages.json","js/app.js","js/audio.js","js/components.js","js/data.js","js/session.js","js/store.js","js/ui.js","js/views/account.js","js/views/home.js","js/views/lang.js","js/views/practice.js","js/views/shared.js"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('boli-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // never cache TTS audio
  if (url.hostname === 'translate.google.com') return;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;
  // App files & course data: cache first (versioned), fall back to network and store.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
