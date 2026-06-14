const CACHE_NAME = '3d-assets-cache-v1';
const CACHE_URLS_MATCH = [
  /\.(glb|gltf|bin)$/i,
  /\.wasm$/i,
  /\/mediapipe\//i,
  /\/draco\//i
];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] 清理旧缓存:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 仅拦截 GET 请求
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const shouldCache = CACHE_URLS_MATCH.some((pattern) => pattern.test(url.pathname));

  if (shouldCache) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            if (url.pathname.includes('/models/')) {
              console.log('[SW] 命中本地 3D 模型缓存:', url.pathname);
            }
            return cachedResponse;
          }

          if (url.pathname.includes('/models/')) {
            console.log('[SW] 本地未命中，发起网络请求:', url.pathname);
          }

          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            console.error('[SW] 资源请求失败:', url.pathname, err);
            throw err;
          });
        });
      })
    );
  }
});
