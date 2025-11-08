const SHELL_CACHE = "webauto-shell-v1";
const API_CACHE = "webauto-api-v1";
const OFFLINE_URL = "/offline.html";

const APP_SHELL = [
  "/",
  "/?source=pwa",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, OFFLINE_URL));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image"
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (fallbackUrl) {
      return cache.match(fallbackUrl);
    }

    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}
