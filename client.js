/* RustikViewing client — ground-up, no Scramjet */
(function () {
  const PREFIX = "/p/";
  const DEFAULT_RELAY = "https://api.allorigins.win/raw?url="; // limited public fallback

  function $(id) { return document.getElementById(id); }
  function setStatus(msg, ok) {
    const el = $("status");
    if (!el) return;
    el.textContent = msg;
    el.className = "status" + (ok === true ? " ok" : ok === false ? " err" : "");
  }

  function getBackend() {
    try {
      return (localStorage.getItem("rv_backend") || "").trim();
    } catch {
      return "";
    }
  }

  function saveBackend() {
    const v = $("backendUrl").value.trim().replace(/\/$/, "");
    try { localStorage.setItem("rv_backend", v); } catch {}
    // Tell SW
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "set-backend", backend: v });
    }
    setStatus(v ? "Backend: " + v : "Using public relay (limited)", !!v);
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

  function encodePath(url) {
    // url-safe base64
    const b64 = btoa(unescape(encodeURIComponent(url)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return PREFIX + b64;
  }

  async function ensureSW() {
    if (!("serviceWorker" in navigator)) throw new Error("No service worker support");
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    // Push backend config into SW
    const backend = getBackend();
    const send = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "set-backend", backend });
      }
    };
    send();
    navigator.serviceWorker.addEventListener("controllerchange", send);
    return reg;
  }

  async function openProxied(raw) {
    const target = normalize(raw);
    if (!target) return;
    $("urlBar").value = target;
    try {
      await ensureSW();
    } catch (e) {
      setStatus(String(e.message || e), false);
      return;
    }
    const path = encodePath(target);
    $("landing").style.display = "none";
    const frame = $("frame");
    frame.classList.add("show");
    // Same-origin path so SW can intercept
    frame.src = path + "?_rv=" + Date.now();
    setStatus("Proxied · " + target, true);
  }

  function go(fromMain) {
    const q = fromMain ? $("mainSearch").value : $("urlBar").value;
    if (!q || !q.trim()) {
      window.open("about:blank", "_blank");
      return;
    }
    openProxied(q);
  }

  function home() {
    $("frame").classList.remove("show");
    $("frame").src = "about:blank";
    $("landing").style.display = "flex";
    setStatus("ready", true);
  }

  window.openProxied = openProxied;
  window.go = go;
  window.home = home;
  window.saveBackend = saveBackend;

  document.addEventListener("DOMContentLoaded", async () => {
    const be = getBackend();
    if ($("backendUrl")) $("backendUrl").value = be;
    try {
      await ensureSW();
      setStatus(be ? "Proxy ready · custom backend" : "Proxy ready · public relay (set your Worker for best results)", true);
    } catch (e) {
      setStatus("SW error: " + (e.message || e), false);
    }
    const params = new URLSearchParams(location.search);
    const q = params.get("url") || params.get("q");
    if (q) openProxied(q);
  });
})();
