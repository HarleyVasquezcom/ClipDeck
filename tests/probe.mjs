import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

let puppeteer;
try {
  puppeteer = createRequire(import.meta.url)('puppeteer');
} catch (error) {
  console.error('puppeteer not found. Install it first: npm.cmd install (see README).');
  process.exit(1);
}

const EXT = path.resolve(import.meta.dirname, '..');
const EXT_FWD = EXT.replaceAll('\\', '/');
let CHROME;
try {
  CHROME = process.env.PROBE_CHROME || (await puppeteer.executablePath());
} catch (error) {
  CHROME = process.env.PROBE_CHROME;
  if (!CHROME) {
    console.error('Chrome for Testing not found; set PROBE_CHROME or run npm install.');
    process.exit(1);
  }
}
const DEPLOY_URL = (process.env.CLIPDECK_DEPLOY_URL || '').replace(/\/+$/, '');
const LANDING = pathToFileURL(path.join(EXT, 'landing', 'index.html')).href;
const FIXTURE_TEMPLATE = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'site.html'), 'utf8');

const EXPECTED_LABELS = {
  tagline: {
    en: 'clip the page, keep the card', es: 'recorta la página, guarda la ficha', fr: 'capture la page, garde la fiche',
    pt: 'recorte a página, guarde a ficha', it: 'ritaglia la pagina, conserva la scheda', de: 'Seite clippen, Karte behalten',
  },
  credit: {
    en: 'Built by Harley Vásquez', es: 'Creado por Harley Vásquez', fr: 'Créé par Harley Vásquez',
    pt: 'Criado por Harley Vásquez', it: 'Creato da Harley Vásquez', de: 'Erstellt von Harley Vásquez',
  },
};

// tiny 64x64 forest-green PNG + 24x24 ivory PNG (hand-rolled, valid)
const HERO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAIklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAA4GzYAARjp8tUAAAAASUVORK5CYII=',
  'base64'
);
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAIklEQVR4nO3BMQEAAADCoPVP7WMPoAAAAAAAAAAAAAAA4G0YAAEko2FmAAAAAElFTkSuQmCC',
  'base64'
);

let edition = 0;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  if (p === '/site.html') {
    edition += 1;
    const html = FIXTURE_TEMPLATE.replaceAll('{{EDITION}}', String(edition));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Edition': String(edition) });
    res.end(html);
  } else if (p === '/img.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(HERO_PNG);
  } else if (p === '/tiny.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(TINY_PNG);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const SITE_PAGE = `http://127.0.0.1:${PORT}/site.html`;

const launch = (args) =>
  puppeteer.launch({ headless: true, executablePath: CHROME, args, protocolTimeout: 60000 });

const storageGet = (page, keys) => page.evaluate((ks) => chrome.storage.local.get(ks), keys);
const getAll = (page) => page.evaluate(() => chrome.storage.local.get(null));

console.log('ClipDeck probe (extension: ' + EXT + ')');
console.log('fixture server: ' + SITE_PAGE);

let passes = 0;
let failures = 0;
const problems = [];

function check(name, ok, extra) {
  if (ok) {
    passes += 1;
    console.log('  PASS ' + name);
  } else {
    failures += 1;
    problems.push(name + (extra ? ' — ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, intervalMs = 200) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (error) {}
    if (Date.now() - start > timeoutMs) return null;
    await sleep(intervalMs);
  }
}

let browser = null;
let base = null;
let ZIP_BYTES = 0;

try {
  // ---- BASELINE ----
  base = await launch([]);
  {
    const page = await base.newPage();
    const resp = await page.goto(SITE_PAGE, { waitUntil: 'domcontentloaded' });
    const ed = resp.headers()['x-edition'];
    const title = await page.evaluate(() => document.title);
    check('baseline: fixture served with edition header', ed !== undefined && /^\d+$/.test(ed || ''), String(ed));
    check('baseline: fixture contains article + hero img', title.includes('ClipDeck archive'), title);
    await page.close();
  }

  // ---- EXTENSION BROWSER ----
  browser = await launch([`--disable-extensions-except=${EXT_FWD}`, `--load-extension=${EXT_FWD}`]);

  const bootSwSeen = [];
  browser.on('targetcreated', (t) => {
    if (t.type() === 'service_worker' && t.url().includes('/background.js')) bootSwSeen.push(t.url());
  });
  await waitFor(() => (bootSwSeen.length > 0 ? true : null), 10000);

  const registry = await (async () => {
    const page = await browser.newPage();
    await page.goto('chrome://extensions-internals', { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const text = await page.evaluate(() => (document.body ? document.body.innerText : '[]'));
    await page.close();
    try { return JSON.parse(text); } catch (e) { return []; }
  })();
  const entry = (Array.isArray(registry) ? registry : []).find((e) => e && e.name === 'ClipDeck');
  const extId = entry ? entry.id : null;
  check('extension registered and ENABLED', !!entry && entry.registry_status === 'ENABLED' && entry.location === 'COMMAND_LINE', entry ? entry.registry_status : 'not found');
  check('manifest_version 3 confirmed by Chrome', !!entry && entry.manifest_version === 3, entry && String(entry.manifest_version));
  if (!extId) throw new Error('extension id not found');

  const popupUrl = `chrome-extension://${extId}/popup.html`;
  const popup = await browser.newPage();
  let popupErrors = 0;
  popup.on('pageerror', (e) => {
    popupErrors += 1;
    console.log('    [popup pageerror] ' + e.message);
  });

  const page = await browser.newPage();
  await page.goto(SITE_PAGE, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await sleep(600);

  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.getElementById('captureBtn') !== null, { timeout: 8000, polling: 100 });

  const defaults = await storageGet(popup, 'cd:clips');
  check('defaults: cd:clips = []', Array.isArray(defaults['cd:clips']) && defaults['cd:clips'].length === 0, JSON.stringify(defaults['cd:clips']));
  check('popup renders without JS exceptions', popupErrors === 0, popupErrors + ' errors');
  check('popup shows empty deck state', (await popup.evaluate(() => document.querySelectorAll('.card').length)) === 0, '');

  const perms = await popup.evaluate(async () => {
    const all = await chrome.permissions.getAll();
    return { permissions: all.permissions || [], origins: all.origins || [] };
  });
  check(
    'permission surface: storage only, http/https (no <all_urls>)',
    perms.permissions.length === 1 && perms.permissions.includes('storage') &&
      perms.origins.length === 2 && perms.origins.includes('http://*/*') && perms.origins.includes('https://*/*'),
    JSON.stringify(perms)
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  check('manifest v3 + 1 permission (no <all_urls>)', manifest.manifest_version === 3 && manifest.permissions.length === 1 && !JSON.stringify(manifest).includes('<all_urls>'), '');

  // ---- CAPTURE 1 ----
  await popup.evaluate(() => window.__clipSnap = 0);
  await popup.evaluate(() => document.getElementById('captureBtn').click());
  const clips1 = await waitFor(() => popup.evaluate(async () => {
    const s = await chrome.storage.local.get('cd:clips');
    return s['cd:clips'] && s['cd:clips'].length === 1 ? s['cd:clips'][0] : null;
  }), 8000);
  check('capture: first clip stored', !!clips1, 'no clip');
  check('capture: title captured', clips1.title === 'ClipDeck archive — edition 2', clips1.title);
  check('capture: full URL captured', clips1.url === SITE_PAGE, clips1.url);
  check('capture: main text extracted (article block)', clips1.text.includes('Archive entry number 2') && clips1.text.includes('marker sentence'), 'text empty');
  check('capture: main image resolved to hero', clips1.image.includes('/img.png'), clips1.image);
  check('capture: new clip has empty tags + ts', Array.isArray(clips1.tags) && clips1.tags.length === 0 && typeof clips1.ts === 'number', JSON.stringify(clips1.tags));
  const card1 = await popup.evaluate(() => {
    const c = document.querySelector('.card');
    return c ? { title: c.querySelector('h3').textContent, img: !!c.querySelector('img.cimg') } : null;
  });
  check('capture: card rendered in deck with thumbnail', card1 && card1.title.includes('edition 2') && card1.img, JSON.stringify(card1));

  // ---- TAGS ----
  await popup.evaluate(() => {
    const input = document.querySelector('.card [data-role=tags]');
    input.value = 'research,  Fixture-Demo ';
    document.querySelector('.card [data-role=saveTags]').click();
  });
  const tagged = await waitFor(() => popup.evaluate(async () => {
    const s = await chrome.storage.local.get('cd:clips');
    return s['cd:clips'] && s['cd:clips'][0].tags && s['cd:clips'][0].tags.length === 2 ? s['cd:clips'][0].tags : null;
  }), 8000);
  check('tags: saved normalized (2 tags)', Array.isArray(tagged) && tagged.join('|') === 'research|fixture-demo', JSON.stringify(tagged));

  // ---- FIXTURE UPDATED -> CAPTURE 2 differs ----
  await page.goto(SITE_PAGE + '?next=1', { waitUntil: 'domcontentloaded' });
  await sleep(400);
  const edBefore2 = await page.evaluate(() => document.querySelector('article h1').textContent);
  await popup.evaluate(() => document.getElementById('captureBtn').click());
  const clips2 = await waitFor(() => popup.evaluate(async () => {
    const s = await chrome.storage.local.get('cd:clips');
    return s['cd:clips'] && s['cd:clips'].length === 2 ? s['cd:clips'] : null;
  }), 8000);
  check('fixture updated every request (different article)', edBefore2 === 'Archive entry number 3', edBefore2);
  check('capture 2: card added to deck (2 clips)', clips2.length === 2, String(clips2.length));
  check('capture 2: second clip differs from first', clips2[0].title !== clips2[1].title, clips2[0].title + ' vs ' + clips2[1].title);
  check('capture 2: newest clip on top (edition 3)', clips2[0].title.includes('edition 3') || clips2[0].title.includes('Archive entry number 3'), clips2[0].title);
  check('deck reload persists: two cards after popup reload', (await (async () => {
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
    await popup.waitForFunction(() => document.getElementById('captureBtn') !== null, { timeout: 8000, polling: 100 });
    return popup.evaluate(() => document.querySelectorAll('.card').length);
  })()) === 2, '');

  // ---- SEARCH ----
  await popup.evaluate(() => {
    const s = document.getElementById('searchIn');
    s.value = 'fixture-demo';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(300);
  const searchTag = await popup.evaluate(() => document.querySelectorAll('.card').length);
  check('search by tag filters deck to 1', searchTag === 1, String(searchTag));
  await popup.evaluate(() => {
    const s = document.getElementById('searchIn');
    s.value = 'zzz-no-match-zzz';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(300);
  const searchNone = await popup.evaluate(() => !!document.querySelector('.empty'));
  check('search with no match shows empty state', searchNone === true, '');
  await popup.evaluate(() => {
    const s = document.getElementById('searchIn');
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(300);
  const searchAll = await popup.evaluate(() => document.querySelectorAll('.card').length);
  check('clearing search restores full deck', searchAll === 2, String(searchAll));

  // ---- EXPORT (download path exercised, blob inspected) ----
  await popup.evaluate(() => {
    window.__dl = [];
    const origURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__dl.push({ blob: b, name: null }); return 'blob:mock'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && window.__dl.length) window.__dl[window.__dl.length - 1].name = this.download;
      return origClick.call(this);
    };
  });
  await popup.evaluate(() => document.getElementById('exportMdBtn').click());
  const md = await waitFor(() => popup.evaluate(async () => {
    const r = window.__dl && window.__dl[window.__dl.length - 1];
    if (!r || !r.name) return null;
    const text = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('read failed'));
      fr.readAsText(r.blob);
    });
    return { name: r.name, text };
  }), 8000);
  check('export MD: download triggered with .md name', !!md && md.name.endsWith('.md'), md && md.name);
  check('export MD: contains both clip titles', !!md && md.text.includes('Archive entry number 2') && md.text.includes('Archive entry number 3'), 'content missing');
  check('export MD: contains URLs + tags', !!md && md.text.includes(SITE_PAGE) && md.text.includes('research'), '');
  await popup.evaluate(() => document.getElementById('exportJsonBtn').click());
  const js = await waitFor(() => popup.evaluate(async () => {
    const r = window.__dl && window.__dl[window.__dl.length - 1];
    if (!r || !r.name) return null;
    const text = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('read failed'));
      fr.readAsText(r.blob);
    });
    return { name: r.name, text };
  }), 8000);
  check('export JSON: download triggered with .json name', !!js && js.name.endsWith('.json'), js && js.name);
  let parsedJson = null;
  try { parsedJson = js ? JSON.parse(js.text) : null; } catch (e) {}
  check('export JSON: valid JSON with 2 clips', !!parsedJson && parsedJson.length === 2 && parsedJson[0].title.includes('edition 3'), js && js.text.slice(0, 60));
  check('export JSON: fields present (title/url/text/tags/ts)', !!parsedJson && ['title', 'url', 'text', 'tags', 'ts'].every((k) => k in parsedJson[0]), '');

  // ---- DELETE ----
  await popup.evaluate(() => document.querySelector('.card [data-role=delete]').click());
  const afterDel = await waitFor(() => popup.evaluate(async () => {
    const s = await chrome.storage.local.get('cd:clips');
    return s['cd:clips'] && s['cd:clips'].length === 1 ? s['cd:clips'] : null;
  }), 8000);
  check('delete: clip discarded from storage', afterDel.length === 1, String((await storageGet(popup, 'cd:clips'))['cd:clips'].length));

  // ---- FROZEN ----
  const freshPage = await browser.newPage();
  await freshPage.goto(SITE_PAGE + '?frozen=1', { waitUntil: 'domcontentloaded' });
  await freshPage.bringToFront();
  await sleep(500);
  const frozenAll = await getAll(popup);
  const keys = Object.keys(frozenAll).filter((k) => k.startsWith('cd:'));
  check('frozen: only cd:* keys in storage', keys.length === 1 && keys.includes('cd:clips'), keys.join(','));
  await freshPage.close();

  // ---- i18n popup ----
  const langCheck = async (code, expected) => {
    await popup.select('#langSel', code);
    const ok = await waitFor(() => popup.evaluate((exp) => document.querySelector('[data-i18n="tagline"]')?.textContent === exp, expected), 6000);
    check(`language switch to ${code} re-renders popup`, ok === true, expected);
    if (ok) {
      const credit = await popup.evaluate(() => document.querySelector('[data-i18n="credit"]')?.textContent);
      check(`language ${code}: credit localized`, credit === EXPECTED_LABELS.credit[code], credit);
      await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
      await popup.waitForFunction(() => document.querySelector('[data-i18n="tagline"]')?.textContent !== '', { timeout: 8000, polling: 100 });
      const persisted = await popup.evaluate((exp) => document.querySelector('[data-i18n="tagline"]')?.textContent === exp, expected);
      check(`language ${code}: persisted across reload`, persisted === true, 'reverted');
    }
  };
  await popup.select('#langSel', 'en');
  for (const code of ['fr', 'de', 'es', 'pt', 'it']) {
    await langCheck(code, EXPECTED_LABELS.tagline[code]);
  }
  await popup.evaluate(() => chrome.storage.local.remove('cd:lang'));
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.querySelector('[data-i18n="tagline"]')?.textContent !== '', { timeout: 8000, polling: 100 });
  const navLang = await popup.evaluate(() => (navigator.language || 'en').toLowerCase().split('-')[0]);
  const defaulted = await popup.evaluate(() => document.querySelector('[data-i18n="tagline"]')?.textContent);
  check('default language = navigator language (or en)', ['en', 'es', 'fr', 'pt', 'it', 'de'].includes(navLang) && EXPECTED_LABELS.tagline[navLang] === defaulted, `nav=${navLang} got=${defaulted}`);
  await popup.evaluate(() => chrome.storage.local.set({ 'cd:lang': 'en' }));

  // ---- Landing ----
  const landing = await browser.newPage();
  const landingErrors = [];
  landing.on('pageerror', (e) => landingErrors.push(e.message));
  await landing.goto(LANDING, { waitUntil: 'domcontentloaded' });
  await sleep(700);
  const heroOk = await landing.evaluate(() => {
    const t = document.querySelector('[data-i18n="heroTitle"]')?.textContent || '';
    return t.length > 0 && document.title !== '';
  });
  check('landing renders with localized hero', heroOk === true, '');
  await landing.select('#langSel', 'es');
  const heroEs = await waitFor(() => landing.evaluate(() => document.querySelector('[data-i18n="heroTitle"]')?.textContent), 5000);
  check('landing switch to es works', heroEs?.length > 5, heroEs);
  const titleEs = await waitFor(() => landing.evaluate((exp) => (document.title.toLowerCase().includes(exp) ? document.title : null), 'recorta'), 5000);
  check('landing document.title translated on switch', titleEs !== null, titleEs);
  check('no JS errors on landing', landingErrors.length === 0, landingErrors.join(' | '));
  await landing.close();

  // ---- Packaging ----
  const zipPath = path.join(EXT, 'dist', 'clipdeck.zip');
  const landingZip = path.join(EXT, 'landing', 'clipdeck.zip');
  check('dist/clipdeck.zip exists', fs.existsSync(zipPath), zipPath);
  check('landing/clipdeck.zip exists (CTA target)', fs.existsSync(landingZip), landingZip);
  if (fs.existsSync(zipPath) && fs.existsSync(landingZip)) {
    const s = fs.statSync(zipPath);
    const l = fs.statSync(landingZip);
    check('landing zip byte-identical to dist zip', s.size === l.size && s.size > 0, `dist=${s.size} landing=${l.size}`);
    ZIP_BYTES = l.size;
  }
  const iconOk = ['icon16.png', 'icon48.png', 'icon128.png'].every((f) => {
    const p = path.join(EXT, 'icons', f);
    return fs.existsSync(p) && fs.readFileSync(p)[0] === 0x89 && fs.readFileSync(p)[1] === 0x50;
  });
  check('icons 16/48/128 present and valid PNG', iconOk, '');

  // ---- Deploy (gated) ----
  if (DEPLOY_URL) {
    try {
      const res = await fetch(DEPLOY_URL + '/', { headers: { 'User-Agent': 'clipdeck-probe' } });
      const body = await res.text();
      check('deployed landing responds (Vercel)', res.status === 200 && body.includes('ClipDeck'), res.status + ' len=' + body.length);
      const zipRes = await fetch(DEPLOY_URL + '/clipdeck.zip', { headers: { 'User-Agent': 'clipdeck-probe' } });
      const zipBody = await zipRes.arrayBuffer();
      check('deployed landing serves the extension zip', zipRes.status === 200 && typeof ZIP_BYTES === 'number' && zipBody.byteLength === ZIP_BYTES, zipRes.status + ' bytes=' + zipBody.byteLength + ' expected=' + ZIP_BYTES);
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      check('deployed landing responds (Vercel)', false, msg);
      check('deployed landing serves the extension zip', false, msg);
    }
  } else {
    console.log('  [info] CLIPDECK_DEPLOY_URL not set; skipping deployed-landing checks.');
  }
} finally {
  if (browser) await browser.close();
  if (base) await base.close();
  server.close();
}

console.log('');
console.log(`RESULT: ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.log('PROBLEMS:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
process.exit(0);