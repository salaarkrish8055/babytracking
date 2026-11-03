const CACHE_NAME = "krish-baby-shell-v2";
const APP_ROOT = new URL("./", self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const pageResponse = await fetch(APP_ROOT.href, { cache: "reload" });
    if (!pageResponse.ok) throw new Error("Unable to cache the app shell.");
    const page = await pageResponse.clone().text();
    await cache.put(APP_ROOT.href, pageResponse);

    const assets = [...page.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)]
      .map((match) => new URL(match[1], APP_ROOT))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith(APP_ROOT.pathname));
    const essentialFiles = [
      new URL("manifest.webmanifest", APP_ROOT),
      new URL("icons/icon.svg", APP_ROOT),
      new URL("icons/icon-192.png", APP_ROOT),
      new URL("icons/icon-512.png", APP_ROOT),
    ];
    await cache.addAll([...new Set([...assets, ...essentialFiles].map((url) => url.href))]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("krish-baby-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(APP_ROOT.href, response.clone());
        return response;
      } catch {
        return (await caches.match(APP_ROOT.href)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request, { ignoreVary: true });
    const networkResponse = fetch(request).then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => undefined);
    if (cachedResponse) {
      event.waitUntil(networkResponse);
      return cachedResponse;
    }
    return (await networkResponse) || Response.error();
  })());
});
