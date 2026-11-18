const cacheName = "flare-offline-v1";
const offlinePage = "/offline.html";
const icon = "/android-chrome-192x192.png";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll([offlinePage, icon])),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.open(cacheName)).match(offlinePage),
      ),
    );
  } else if (url.pathname === icon) {
    event.respondWith(
      caches
        .open(cacheName)
        .then(async (cache) => (await cache.match(icon)) || fetch(request)),
    );
  }
});
