# RustikViewing

Self-hosted proxy gateway for [RustikOP](https://github.com/restii-dev/RustikOP).

## Live

https://restii-dev.github.io/RustikViewing/

## How it works

1. **Primary:** Routes through your Scramjet stack on [epose](https://restii-dev.github.io/epose/) (baremux / epoxy / scram assets already deployed there).
2. **Fallback:** CroxyProxy form-submit if Scramjet is blocked.
3. Accepts `?url=https://example.com` and `#/https%3A%2F%2Fexample.com` deep links from RustikOP.

## Enable GitHub Pages

Repo **Settings → Pages → Deploy from branch `main` / root**.

## API

```js
// from another page
window.open('https://restii-dev.github.io/RustikViewing/?url=' + encodeURIComponent('https://example.com'));
```
