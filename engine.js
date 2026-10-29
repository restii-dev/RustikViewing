"use strict";
const BASE = (() => {
  let p = location.pathname || "/";
  p = p.replace(/\/index\.html$/i, "");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "/" || p === "") return "";
  return p;
})();
const SCRAMJET_PREFIX = BASE + "/service/";
const EPOSE = "https://restii-dev.github.io/epose";
const SCRAMJET_FILES = {
  all: EPOSE + "/scramjet/scramjet.all.js",
  sync: EPOSE + "/scramjet/scramjet.sync.js",
  wasm: EPOSE + "/scramjet/scramjet.wasm.wasm"
};
// Client can load cross-origin; SharedWorker must be same-origin
const BAREMUX_SCRIPT = EPOSE + "/baremux/index.js";
const BAREMUX_WORKER = (BASE || "") + "/baremux/worker.js";
const EPOXY_MODULE = EPOSE + "/epoxy/index.mjs";
const DEFAULT_WISP = "wss://serv-1-va.onrender.com/";
const WISP_SERVERS = [
  { id: "va1", name: "Virginia 1", url: "wss://serv-1-va.onrender.com/" },
  { id: "va2", name: "Virginia 2", url: "wss://serv-2-va.onrender.com/" },
  { id: "oh3", name: "Ohio 3", url: "wss://serv-3-oh.onrender.com/" },
  { id: "or4", name: "Oregon 4", url: "wss://serv-4-or.onrender.com/" },
  { id: "anura", name: "Anura", url: "wss://anura.pro/" }
];
const SW_URL = (BASE || "") + "/sw.js";
const SW_SCOPE = (BASE || "") + "/" || "/";

let engineController = null;
let muxConnection = null;
let engineReady = false;
let engineInitPromise = null;
let settings = { wispId: "va1" };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

function currentWisp() {
  const found = WISP_SERVERS.find((w) => w.id === settings.wispId);
  let url = (found && found.url) || DEFAULT_WISP;
  if (!/^wss?:\/\//i.test(url)) url = DEFAULT_WISP;
  return url;
}

function setStatus(msg, ok) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (ok === true ? " ok" : ok === false ? " err" : "");
}

async function applyMuxTransport() {
  const wisp = currentWisp();
  const workerPath = BAREMUX_WORKER.startsWith("http") ? BAREMUX_WORKER : (location.origin + (BAREMUX_WORKER.startsWith("/") ? BAREMUX_WORKER : "/" + BAREMUX_WORKER.replace(/^\//,"")));
  // BareMux wants absolute or root-relative path
  const path = BAREMUX_WORKER.startsWith("/") ? BAREMUX_WORKER : "/" + BAREMUX_WORKER.replace(/^\//,"");
  muxConnection = new BareMux.BareMuxConnection(path);
  await muxConnection.setTransport(EPOXY_MODULE, [{ wisp }]);
  return EPOXY_MODULE;
}

async function initEngine() {
  if (engineInitPromise) return engineInitPromise;
  engineInitPromise = (async () => {
    setStatus("Loading BareMux…");
    if (!window.BareMux) await loadScript(BAREMUX_SCRIPT);
    setStatus("Loading Scramjet…");
    if (!window.$scramjetLoadController && !window.ScramjetController) {
      await loadScript(SCRAMJET_FILES.all);
    }
    if (!window.BareMux) throw new Error("BareMux failed to load");
    if (!("serviceWorker" in navigator)) throw new Error("No service worker support");

    setStatus("Starting Scramjet controller…");
    const loaded = typeof window.$scramjetLoadController === "function"
      ? window.$scramjetLoadController()
      : null;
    const Controller = (loaded && loaded.ScramjetController) || window.ScramjetController;
    if (typeof Controller !== "function") throw new Error("ScramjetController missing");

    engineController = new Controller({
      prefix: SCRAMJET_PREFIX,
      files: {
        wasm: SCRAMJET_FILES.wasm,
        all: SCRAMJET_FILES.all,
        sync: SCRAMJET_FILES.sync
      },
      flags: { captureErrors: true, strictRewrites: true, rewriterLogs: false }
    });
    try {
      await engineController.init();
    } catch (err) {
      try { indexedDB.deleteDatabase("$scramjet"); } catch {}
      await new Promise((r) => setTimeout(r, 400));
      await engineController.init();
    }

    setStatus("Registering service worker…");
    await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;

    setStatus("Connecting Wisp transport…");
    await applyMuxTransport();

    engineReady = true;
    setStatus("Proxy ready · " + currentWisp(), true);
  })();
  return engineInitPromise;
}

function normalize(q) {
  q = (q || "").trim();
  if (!q) return null;
  if (!/^https?:\/\//i.test(q)) {
    if (q.includes(".") && !q.includes(" ")) return "https://" + q;
    return "https://www.google.com/search?q=" + encodeURIComponent(q);
  }
  return q;
}

async function openProxied(raw) {
  const target = normalize(raw);
  if (!target) return;
  document.getElementById("urlBar").value = target;
  try {
    if (!engineReady) await initEngine();
  } catch (e) {
    setStatus(String(e.message || e), false);
    window.open(EPOSE + "/#/" + encodeURIComponent(target), "_blank");
    return;
  }
  const path = SCRAMJET_PREFIX + encodeURIComponent(target);
  document.getElementById("landing").style.display = "none";
  const frame = document.getElementById("frame");
  frame.classList.add("show");
  frame.src = path;
  setStatus("Proxied · " + target, true);
}

function go(fromMain) {
  const q = fromMain
    ? document.getElementById("mainSearch").value
    : document.getElementById("urlBar").value;
  if (!q || !q.trim()) {
    window.open("about:blank", "_blank");
    return;
  }
  openProxied(q);
}

function home() {
  document.getElementById("frame").classList.remove("show");
  document.getElementById("frame").src = "about:blank";
  document.getElementById("landing").style.display = "flex";
  setStatus(engineReady ? "Proxy ready" : "initializing…", engineReady);
}

function setWisp(id) {
  settings.wispId = id;
  const sel = document.getElementById("wispSelect");
  if (sel) sel.value = id;
  if (engineReady) {
    applyMuxTransport()
      .then(() => setStatus("Transport · " + currentWisp(), true))
      .catch((e) => setStatus("Transport failed: " + e.message, false));
  }
}

window.RustikViewing = { open: openProxied, init: initEngine };
window.openProxied = openProxied;
window.go = go;
window.home = home;

document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("wispSelect");
  if (sel) {
    WISP_SERVERS.forEach((w) => {
      const o = document.createElement("option");
      o.value = w.id;
      o.textContent = w.name;
      sel.appendChild(o);
    });
    sel.value = settings.wispId;
    sel.onchange = () => setWisp(sel.value);
  }
  initEngine().catch((e) => setStatus("Engine: " + (e.message || e), false));
  const params = new URLSearchParams(location.search);
  const q = params.get("url") || params.get("q");
  if (q) openProxied(q);
  if (location.hash.length > 2) {
    try {
      const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
      if (h.startsWith("http")) openProxied(h);
    } catch {}
  }
});
