/* RustikViewing service worker — ground-up proxy rewriter */
const PREFIX = "/p/";
const CACHE = "rv-static-v1";

let backend = ""; // Cloudflare Worker origin, e.g. https://x.y.workers.dev

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "set-backend") {
    backend = (data.backend || "").replace(/\/$/, "");
  }
});

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    try { return atob(s); } catch { return null; }
  }
}

function encodePath(url) {
  const b64 = btoa(unescape(encodeURIComponent(url)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return PREFIX + b64;
}

function resolveUrl(base, rel) {
  try { return new URL(rel, base).href; } catch { return rel; }
}

/** Rewrite HTML so navigations stay inside our proxy */
function rewriteHtml(html, pageUrl) {
  // <base> so relative URLs resolve
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, (m) => m + "\n<base href=\"" + pageUrl.replace(/"/g, "&quot;") + "\">");
  }

  // href / src / action absolute → proxy path
  html = html.replace(/\b(href|src|action)=(["'])([^"']+)\2/gi, (full, attr, q, val) => {
    if (!val || val.startsWith("data:") || val.startsWith("javascript:") || val.startsWith("mailto:") || val.startsWith("#") || val.startsWith("blob:")) {
      return full;
    }
    const abs = resolveUrl(pageUrl, val);
    if (!/^https?:/i.test(abs)) return full;
    return attr + "=" + q + encodePath(abs) + q;
  });

  // srcset
  html = html.replace(/\bsrcset=(["'])([^"']+)\1/gi, (full, q, val) => {
    const parts = val.split(",").map((part) => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return part;
      const abs = resolveUrl(pageUrl, bits[0]);
      if (!/^https?:/i.test(abs)) return part;
      bits[0] = encodePath(abs);
      return bits.join(" ");
    });
    return "srcset=" + q + parts.join(", ") + q;
  });

  // Inject helper so in-page JS fetch can be guided (best-effort)
  const inject = "<script>(function(){try{const P='/p/';const enc=u=>{const b=btoa(unescape(encodeURIComponent(u))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');return P+b;};const o=window.open;window.open=function(u,t,f){try{if(typeof u==='string'&&/^https?:/i.test(u))u=enc(u);}catch(e){}return o.call(window,u,t,f);};}catch(e){}})();<\/script>";
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, (m) => m + inject);
  } else {
    html = inject + html;
  }
  return html;
}

async function fetchViaBackend(target) {
  // 1) Custom Cloudflare Worker
  if (backend) {
    const u = backend + "/?url=" + encodeURIComponent(target);
    const res = await fetch(u, { redirect: "follow" });
    return res;
  }
  // 2) Public relay fallback (HTML-ish only, flaky)
  const u = "https://api.allorigins.win/raw?url=" + encodeURIComponent(target);
  return fetch(u, { redirect: "follow" });
}

async function handleProxy(request) {
  const url = new URL(request.url);
  const encoded = url.pathname.slice(PREFIX.length);
  const target = b64urlDecode(encoded);
  if (!target || !/^https?:\/\//i.test(target)) {
    return new Response("Bad proxy path", { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetchViaBackend(target);
  } catch (err) {
    return new Response("Upstream fetch failed: " + err.message + "\n\nSet your Cloudflare Worker URL on the home page.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }

  const ctype = (upstream.headers.get("content-type") || "").toLowerCase();
  const headers = new Headers();
  headers.set("cache-control", "no-store");

  if (ctype.includes("text/html")) {
    let html = await upstream.text();
    // If worker already rewrote, still ensure our /p/ prefix paths
    html = rewriteHtml(html, target);
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(html, { status: upstream.status, headers });
  }

  // Pass through other types (css, images, etc.) when backend supports them
  if (ctype) headers.set("content-type", ctype);
  return new Response(upstream.body, { status: upstream.status, headers });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/" || url.pathname.endsWith("/index.html") ||
      url.pathname.endsWith("/client.js") || url.pathname.endsWith("/sw.js") ||
      url.pathname.endsWith("/worker.js") || url.pathname.endsWith("/README.md")) {
    return; // default network for app shell
  }

  if (url.pathname.startsWith(PREFIX)) {
    event.respondWith(handleProxy(event.request));
  }
});
