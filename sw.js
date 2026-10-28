// Service worker : permet d'ouvrir l'appli sans réseau.
// Change VERSION à chaque mise à jour pour rafraîchir le cache.
const VERSION = "mimichats-v25";
const SHELL = ["./", "index.html", "styles.css", "app.js", "plus.js", "notif.js", "widget.js", "recettes.js", "recettes-idees.js", "ui.js", "occurrences.js", "cycle.js", "firebase-config.js", "manifest.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Notifications envoyées par la fonction Firebase (messages « data » : title, body, url, tag).
self.addEventListener("push", e => {
  let d = {};
  try { const j = e.data.json(); d = j.data || j.notification || j; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Les mimichats", {
    body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: d.tag || undefined, data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Les échanges avec la base Firebase ne passent pas par le cache.
  if (url.hostname.endsWith("googleapis.com") && !url.pathname.includes("/css")) return;

  // Bibliothèque Firebase et polices : cache d'abord (elles ne changent pas).
  if (url.hostname === "www.gstatic.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
    })));
    return;
  }

  // Fichiers de l'appli : réseau d'abord (pour avoir les mises à jour), cache si hors ligne.
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html"))));
  }
});
