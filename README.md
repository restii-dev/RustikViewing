# RustikViewing — ground-up proxy

Custom proxy stack. **No Scramjet, no epose, no Croxy.**

## Architecture

```
Browser (index.html + client.js)
    → Service Worker (sw.js)  intercepts /p/<base64-url>
        → Your Cloudflare Worker (worker.js)  fetches the real site
            → Target website
        ← HTML rewritten so links stay in the proxy
    ← Rendered in iframe
```

## 1. Deploy the backend (required for real proxying)

### Cloudflare Workers (free)

1. Go to [Cloudflare Dashboard → Workers](https://dash.cloudflare.com/)
2. Create a Worker
3. Paste the contents of `worker.js`
4. Deploy
5. Copy the URL, e.g. `https://rustikviewing.yourname.workers.dev`

Or with Wrangler:

```bash
npx wrangler deploy worker.js --name rustikviewing
```

## 2. Enable GitHub Pages

Repo **Settings → Pages → branch `main` → folder `/`**

Live UI: https://restii-dev.github.io/RustikViewing/

## 3. Connect UI → Worker

On the RustikViewing home page, paste your Worker URL into **Proxy backend URL**.

## Deep links (from RustikOP)

```
https://restii-dev.github.io/RustikViewing/?url=https://example.com
```

## Limits

- Without your Worker, a public relay is used (fragile, often blocked).
- Complex apps (Discord, full YouTube app) need a heavier engine (Scramjet/UV) or more rewrite rules.
- This stack is **yours** — you control the Worker code and can extend rewriting.
