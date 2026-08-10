/**
 * Study Tracker — Service Worker
 * - JS/CSS assets: Cache-first (instant load, even fully offline)
 * - Navigation requests: Network-first with fallback (supports offline page)
 * - Everything else: Stale-while-revalidate
 * Version bumps on any deploy so SW auto-upgrades.
 */
// Relative paths so precaching works on GitHub Pages project sites
// served under a subdirectory (e.g. /study-tracker/) — they resolve
// against the SW script's own location, not the origin root.
const CACHE = 'study-tracker-v6';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/main.js',
  './js/store.js',
  './js/theme.js',
  './js/stats.js',
  './js/coach.js',
  './js/ielts.js',
  './js/pomodoro.js',
  './js/gist.js',
  './js/ui/components.js',
  './js/ui/dashboard.js',
  './js/ui/timer.js',
  './js/ui/tasks.js',
  './js/ui/ielts-view.js',
  './js/ui/stats-view.js',
  './js/ui/settings.js',
  './js/ui/mini-bar.js',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // API calls (GitHub) — network only
  if (url.origin === 'https://api.github.com') {
    return;
  }

  // Same-origin navigation requests — network-first with offline fallback
  if (request.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((h) => h || caches.match('./index.html'))),
    );
    return;
  }

  // Static assets (JS, CSS, images) — cache-first
  if (/\.(js|css|svg|png|jpg|woff2?)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
        return res;
      })),
    );
    return;
  }

  // Everything else — stale-while-revalidate
  e.respondWith(
    caches.match(request).then((hit) => {
      const fetchPromise = fetch(request).then((res) => {
        caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || fetchPromise;
    }),
  );
});
