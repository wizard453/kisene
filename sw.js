// Kišenė: service worker. Leidžia programėlei atsidaryti ir be interneto.
// Pakeitus programėlės failus, padidink VERSION, kad telefonai gautų naują versiją.
const VERSION = "kisene-v14";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./util.js",
  "./data.js",
  "./budget.js",
  "./importer.js",
  "./invest.js",
  "./market.js",
  "./wealth.js",
  "./report.js",
  "./onboard.js",
  "./notify.js",
  "./edit.js",
  "./recurring.js",
  "./theme.js",
  "./ai.js", "./help.js", "./tour.js",
  "./main.js",
  "./config.js",
  "./supabase.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./logo-splash.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];
const FONT_CACHE = "kisene-fonts";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Šriftai: iš talpyklos, jei yra
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Tik pačios programėlės failai. Supabase užklausos eina tiesiai į tinklą.
  if (url.origin !== self.location.origin) return;

  // Pirma tinklas (kad atnaujinimai pasiektų greitai), be ryšio iš talpyklos
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))
  );
});

// Paspaudus pranešimą atidaroma programėlė
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then((list) => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});
