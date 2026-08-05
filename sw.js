/**
 * Study Tracker — Service Worker
 * Cache-first strategy for all static assets.
 * Updated on every `install` (skipWaiting + claim).
 */
const CACHE = 'study-tracker-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/js/store.js',
  '/js/theme.js',
  '/js/stats.js',
  '/js/ielts.js',
  '/js/pomodoro.js',
  '/js/gist.js',
  '/js/ui/components.js',
  '/js/ui/dashboard.js',
  '/js/ui/timer.js',
  '/js/ui/tasks.js',
  '/js/ui/logs.js',
  '/js/ui/ielts-view.js',
  '/js/ui/stats-view.js',
  '/js/ui/settings.js',
  '/js/ui/mini-bar.js',
  '/manifest.json',
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
  // API calls (GitHub) — network only
  if (e.request.url.startsWith('https://api.github.com')) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request)),
  );
});