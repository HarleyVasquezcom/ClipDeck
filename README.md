# ClipDeck

**Clip the page, keep the card.** ClipDeck captures the page you are reading — title, URL, main text and main image — into a deck of cards stored locally with `chrome.storage.local`. The deck is searchable (by title, tag or text), each card accepts tags, and the whole deck exports as Markdown or JSON with a click.

Landing page: `https://clipdeck-woad.vercel.app`
Extension ZIP: `clipdeck.zip` (dist) — also downloadable from the landing.

---

## What it does

- The content script extracts, on request: `document.title`, the full URL, the **main text** (largest `article`/`main`/`section` block, stripped of scripts, images and media) and the **main image** (largest rendered image by area, or any `data:` image).
- Clipping happens from the popup: **clip this page** → card prepended to `cd:clips` with a unique id, tags `[]` and timestamp.
- The card renders with thumbnail, title, URL, a 3-line excerpt and the tag row: type comma-separated tags and **save**.
- The search box filters the deck live (title / tags / text).
- **Export .md** builds a Markdown document (`# title`, URL, captured date, tags, excerpt, `---` separator) and **Export .json** serializes the visible (filtered) set — both downloaded via a local Blob (no `downloads` permission).
- **Discard** removes a card. Deck persists across popup reloads and browser restarts.

## Permissions (all justified, all local)

| Permission | Why |
| --- | --- |
| `storage` | Persist the deck `cd:clips` and the language `cd:lang` in `chrome.storage.local`. |

Content scripts run on `http://*/*` and `https://*/*` (no `<all_urls>`) because you clip pages you are viewing. Extraction is purely local heuristics; exports are built in the popup and downloaded with a Blob. **No network request, no accounts, no telem

etry.**

## Install (load unpacked)

1. Download `clipdeck.zip` (from this repo `dist/` or the landing page) and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Open any page, open the ClipDeck popup and press **clip this page**.

## Verify

```bash
npm install && npm run probe
```

Hermetic Puppeteer suite (local fixture server + local extension): baseline without extension, capture with title/URL/main-text/main-image assertions on a **fixture that changes every request** (edition counter — the probe proves two successive clips differ), tag normalization, live search filtering, export through the real Blob-download path (blob inspected in-page), discard, frozen-state keyspace (`cd:*` only), i18n in 6 languages, packaging byte-identity and — with `CLIPDECK_DEPLOY_URL` set — the deployed landing + ZIP checks.

Privacy: everything lives in `chrome.storage.local`.

---

## ES — Resumen

**ClipDeck: recorta la página, guarda la ficha.** Captura título, URL, texto principal e imagen de la página actual (heurística local, sin servidores), y guarda fichas con tags en `chrome.storage.local`. El mazo se busca en vivo (título/tag/texto), se exporta en Markdown o JSON descargable (Blob local, sin permisos extra) y se puede descartar ficha por ficha. Permiso único justificado: `storage` (los content scripts corren en `http/https`). El fixture de pruebas cambia en cada petición para demostrar que las capturas son reales y distintas. Instalación: ZIP → `chrome://extensions` → *Load unpacked*.

*Built by [Harley Vásquez](https://www.linkedin.com/in/harleyvasquez/).*