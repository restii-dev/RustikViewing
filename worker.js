/**
 * RustikViewing — Cloudflare Worker backend (ground-up proxy)
 *
 * Deploy:
 *  1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *  2. Paste this file
 *  3. Deploy → copy worker URL into RustikViewing home page
 *
 * Or with Wrangler:
 *  npx wrangler deploy worker.js --name rustikviewing
 */

const HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host", "cf-connecting-ip",
  "cf-ipcountry", "cf-ray", "cf-visitor", "cdn-loop"
]);

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "access-control-allow-headers": req.headers.get("access-control-request-headers") || "*",
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "*"
  };
}

function rewriteHtml(html, pageUrl, workerOrigin) {
  const enc = (u) => {
    try {
      // Point assets back through THIS worker so CSS/JS/images load
      return workerOrigin + "/?url=" + encodeURIComponent(u);
    } catch {
      return u;
    }
  };

  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, (m) => m + `\n<base href="${pageUrl.replace(/"/g, "&quot;")}">`);
  }

  html = html.replace(/\b(href|src|action)=(["'])([^"']+)\2/gi, (full, attr, q, val) => {
    if (!val || /^(data:|javascript:|mailto:|#|blob:)/i.test(val)) return full;
    try {
      const abs = new URL(val, pageUrl).href;
      if (!/^https?:/i.test(abs)) return full;
      return attr + "=" + q + enc(abs) + q;
    } catch {
      return full;
    }
  });

  return html;
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(
        JSON.stringify({
          name: "RustikViewing Worker",
          usage: "GET /?url=https://example.com",
          tip: "Paste this worker origin into RustikViewing → backend URL"
        }, null, 2),
        { status: 200, headers: { "content-type": "application/json", ...corsHeaders(request) } }
      );
    }

    let dest;
    try {
      dest = new URL(target);
    } catch {
      return new Response("Invalid url", { status: 400, headers: corsHeaders(request) });
    }
    if (!/^https?:$/.test(dest.protocol)) {
      return new Response("Only http/https", { status: 400, headers: corsHeaders(request) });
    }

    const headers = new Headers();
    for (const [k, v] of request.headers) {
      if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== "origin") headers.set(k, v);
    }
    headers.set("host", dest.host);
    // Avoid compressed edge cases for rewriting
    headers.delete("accept-encoding");

    let upstream;
    try {
      upstream = await fetch(dest.href, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "follow"
      });
    } catch (err) {
      return new Response("Fetch failed: " + err.message, {
        status: 502,
        headers: { "content-type": "text/plain", ...corsHeaders(request) }
      });
    }

    const outHeaders = new Headers(corsHeaders(request));
    const ctype = upstream.headers.get("content-type") || "application/octet-stream";
    outHeaders.set("content-type", ctype);
    outHeaders.set("cache-control", "no-store");

    if (ctype.includes("text/html")) {
      let html = await upstream.text();
      html = rewriteHtml(html, dest.href, url.origin);
      return new Response(html, { status: upstream.status, headers: outHeaders });
    }

    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  }
};
