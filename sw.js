const BASE = (() => {
  let p = self.location.pathname.replace(/\/?sw\.js$/i, "");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p === "/" ? "" : p;
})();

importScripts((BASE || "") + "/scramjet/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const PROXY_PREFIX = BASE + "/service/";
const ORIGIN = self.location.origin;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function isStaticAsset(path) {
  if (path === BASE + "/sw.js" || path === "/sw.js") return true;
  if (path === BASE + "/" || path === BASE + "/index.html" || path === BASE || path === "/") return true;
  if (path === BASE + "/engine.js" || path === "/engine.js") return true;
  if (path.startsWith(BASE + "/baremux/") || path.startsWith("/baremux/")) return true;
  if (path.startsWith(BASE + "/epoxy/") || path.startsWith("/epoxy/")) return true;
  if (path.startsWith(BASE + "/scramjet/") || path.startsWith("/scramjet/")) return true;
  if (path.endsWith(".map")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (isStaticAsset(url.pathname)) return;

  if (url.pathname.startsWith(PROXY_PREFIX) || url.pathname.startsWith("/service/")) {
    event.respondWith((async () => {
      try {
        await scramjet.loadConfig();
        if (scramjet.route(event)) {
          return scramjet.fetch(event);
        }
      } catch (err) {
        console.error("[RustikViewing SW]", err);
      }
      return fetch(event.request);
    })());
  }
});
