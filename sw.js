// Offline support for the installed web app.
// - Page loads: network first (so updates arrive), cached copy when offline.
// - App files and fonts: served from cache, fetched and cached on first use.
// - Everything else (product photos, barcode lookups): network only.

const CACHE = "myvanity-v3";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./apple-touch-icon.png"];
const FONT_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];
// Synced photos (content-addressed, so a cached copy never goes stale).
const PHOTO_PREFIX = "https://qlmhkshrtbjnouutctxr.supabase.co/storage/v1/object/public/photos/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_ORIGINS.includes(url.origin) && !request.url.startsWith(PHOTO_PREFIX)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok || response.type === "opaque") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// ── Push reminders (sent by the Cloudflare relay) ──
self.addEventListener("push", (event) => {
  let data = { title: "MyVanity", body: "", tag: "myvanity" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // keep defaults
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow("./");
    }),
  );
});
