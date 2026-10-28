// Service worker: makes Monsoon work offline. Generated from sw.template.js by scripts/build.js.
const VERSION = '230e22c521';
const CACHE = 'monsoon-' + VERSION;
const PRECACHE = ["./","index.html","css/style.css","manifest.webmanifest","assets/icon.svg","data/languages.json","js/app.js","js/audio.js","js/cloud.js","js/components.js","js/data.js","js/letters.js","js/path.js","js/rain.js","js/sentences.js","js/session.js","js/store.js","js/ui.js","js/views/account.js","js/views/grammar.js","js/views/home.js","js/views/lang.js","js/views/practice.js","js/views/shared.js","js/views/talk.js","js/views/themes.js"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('monsoon-') && k !== CACHE).map((k) => caches.delete(k))))
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
          if (res.status === 200 || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
