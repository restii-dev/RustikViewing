# RustikViewing

**Your own Scramjet proxy** for [RustikOP](https://restii-dev.github.io/RustikOP/).

## Live
https://restii-dev.github.io/RustikViewing/

## What it is
- Service worker proxy (`/service/<encoded-url>`)
- Scramjet rewriter (assets from epose)
- BareMux + Epoxy over public **Wisp** servers
- UI with Wisp server picker

## Enable GitHub Pages
**Settings → Pages → Deploy from branch `main` → folder `/` (root)**

Without Pages enabled, the site will 404.

## From RustikOP
RustikOP default proxy is RustikViewing:
`https://restii-dev.github.io/RustikViewing/?url=https://example.com`

## Fallback
If the engine fails, links fall back to epose Scramjet.
