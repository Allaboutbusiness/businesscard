const CACHE_NAME = 'namecard-v6';
/* 앱 셸만 프리캐시. cleanUrls로 /index.html은 308 리다이렉트되므로 '/'만 캐시(redirected 응답 방지) */
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* 외부 도메인(Google Forms 등)은 네트워크 직접 요청 */
  if (url.origin !== self.location.origin) return;

  /* API(/api/*)는 절대 캐시하지 않음 — 로그인상태·글목록 등 항상 최신값 필요.
     (과거 cache-first가 /api/me를 캐시해 로그아웃 후에도 로그인상태로 보이던 버그 수정) */
  if (url.pathname.startsWith('/api/')) return;

  /* HTML 네비게이션: 네트워크 우선, 실패 시 캐시 */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  /* 정적 자산: 캐시 우선, 실패 시 네트워크 */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
