/* Plani Im – service worker: app shell offline, data always live from the database */
const CACHE = "plani-im-v10";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png",
  "./vendor/supabase.js"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return; // never cache personal data
  if (url.origin === self.location.origin) {
    const isPage = req.mode === "navigate";
    const heavy = (url.pathname.includes("/vendor/pdfjs/")||url.pathname.includes("/vendor/ocr/")||url.pathname.includes("/vendor/xlsx/"));
    if (heavy) { // big library: cache on first use
      e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); return r; })));
      return;
    }
    // network first, so updates arrive; cache as fallback when offline
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(isPage ? "./index.html" : req, c)); return r; })
      .catch(() => caches.match(isPage ? "./index.html" : req).then(m => m || caches.match("./index.html"))));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); return r; })));
  }
});

/* Push notifications: 1 day and 10 minutes before each dated task, order and meeting */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Plani Im", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Plani Im", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    lang: "sq",
    vibrate: [120, 60, 120],
    data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) {
        return c.focus().then(w => (w && "navigate" in w) ? w.navigate(url) : w);
      }
    }
    return self.clients.openWindow(url);
  }));
});
