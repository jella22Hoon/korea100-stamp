// 앱 파일을 캐시해 오프라인에서도 열리게 한다. 파일을 바꾸면 CACHE 버전을 올릴 것.
const CACHE = 'korea100-v11';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/store.js',
  'js/util.js',
  'js/recommend.js',
  'js/pamphlet.js',
  'js/enrich.js',
  'js/plan.js',
  'js/views/origin-sheet.js',
  'js/views/place-form.js',
  'js/views/recommend.js',
  'js/views/pamphlet-sheet.js',
  'js/views/list.js',
  'js/views/detail.js',
  'js/views/progress.js',
  'js/views/settings.js',
  'data/places.json',
  'data/guide.json',
  'data/points.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 네트워크 우선, 실패하면 캐시 (수정한 places.json이 바로 반영되도록)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
