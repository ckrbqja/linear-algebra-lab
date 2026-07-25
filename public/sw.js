const CACHE_PREFIX = 'flow-math';
const CACHE_VERSION = 'v4';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const APP_SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-icon-180.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon-maskable-512.png',
];

const CONTENT_TYPES_BY_DESTINATION = {
  font: ['font/', 'application/font', 'application/octet-stream'],
  image: ['image/'],
  script: ['application/javascript', 'text/javascript'],
  style: ['text/css'],
  worker: ['application/javascript', 'text/javascript'],
};

function expectedContentTypes(request) {
  if (CONTENT_TYPES_BY_DESTINATION[request.destination]) {
    return CONTENT_TYPES_BY_DESTINATION[request.destination];
  }

  const pathname = new URL(request.url, self.location.origin).pathname.toLowerCase();
  if (pathname.endsWith('.css')) return CONTENT_TYPES_BY_DESTINATION.style;
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
    return CONTENT_TYPES_BY_DESTINATION.script;
  }
  if (/\.(?:woff2?|ttf|otf)$/.test(pathname)) return CONTENT_TYPES_BY_DESTINATION.font;
  if (/\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/.test(pathname)) {
    return CONTENT_TYPES_BY_DESTINATION.image;
  }
  if (pathname.endsWith('.webmanifest')) {
    return ['application/manifest+json', 'application/json'];
  }
  return [];
}

function isValidAssetResponse(request, response) {
  if (!response?.ok) return false;
  const expectedTypes = expectedContentTypes(request);
  if (expectedTypes.length === 0) return true;
  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  return expectedTypes.some((expectedType) => contentType.startsWith(expectedType));
}

function isHtmlResponse(response) {
  return response?.ok
    && (response.headers.get('Content-Type') || '').toLowerCase().startsWith('text/html');
}

async function cacheValidatedAsset(cache, assetUrl) {
  const request = new Request(assetUrl, { cache: 'reload' });
  const response = await fetch(request);
  if (!isValidAssetResponse(request, response)) {
    throw new Error(`Invalid asset response for ${assetUrl}: ${response.status}`);
  }
  await cache.put(request, response);
}

async function deleteCachedRequest(request) {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(`${CACHE_PREFIX}-`))
      .map((cacheName) => caches.open(cacheName).then((cache) => cache.delete(request)))
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchValidatedNetworkAsset(request, { reload = false } = {}) {
  const networkRequest = reload ? new Request(request, { cache: 'reload' }) : request;
  const response = await fetch(networkRequest);
  if (!isValidAssetResponse(request, response)) {
    await deleteCachedRequest(request);
    throw new Error(`Invalid asset response for ${request.url}: ${response.status}`);
  }

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
  return response;
}

async function notifyAssetFailure(request) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(clients.map((client) => client.postMessage({
    type: 'FLOW_MATH_ASSET_FAILURE',
    url: request.url,
  })));
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function precacheAppShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(APP_SHELL.map((assetUrl) => cacheValidatedAsset(cache, assetUrl)));
  const response = await fetch('/', { cache: 'reload' });
  if (!isHtmlResponse(response)) {
    throw new Error(`Unable to cache Flow Math shell: ${response.status}`);
  }

  const html = await response.clone().text();
  await cache.put('/', response);
  const assetUrls = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)]
    .map((match) => match[1]);
  await Promise.all(
    [...new Set(assetUrls)]
      .map((assetUrl) => cacheValidatedAsset(cache, assetUrl))
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheAppShell()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isHtmlResponse(response)) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (
          (await caches.match(request))
          || (await caches.match('/'))
          || Response.error()
        ))
    );
    return;
  }

  if (!['font', 'image', 'script', 'style', 'worker'].includes(request.destination)) return;

  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      const validCachedResponse = isValidAssetResponse(request, cachedResponse)
        ? cachedResponse
        : null;
      if (cachedResponse && !validCachedResponse) await deleteCachedRequest(request);

      if (validCachedResponse) {
        event.waitUntil(fetchValidatedNetworkAsset(request).catch(() => undefined));
        return validCachedResponse;
      }

      try {
        return await fetchValidatedNetworkAsset(request);
      } catch {
        await wait(300);
        try {
          return await fetchValidatedNetworkAsset(request, { reload: true });
        } catch {
          await notifyAssetFailure(request);
          return Response.error();
        }
      }
    })
  );
});
