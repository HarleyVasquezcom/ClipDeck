'use strict';

const i18n = window.ClipDeckI18N;
const $ = (id) => document.getElementById(id);

let clips = [];
let query = '';

async function loadClips() {
  const s = await chrome.storage.local.get('cd:clips');
  clips = Array.isArray(s['cd:clips']) ? s['cd:clips'] : [];
}

async function sendCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'cd:capture' });
  } catch (e) {
    return null;
  }
}

function flash(text, fail) {
  const el = $('statusMsg');
  el.textContent = text;
  el.classList.toggle('fail', !!fail);
}

function filtered() {
  const q = query.trim().toLowerCase();
  if (!q) return clips;
  return clips.filter((c) =>
    c.title.toLowerCase().includes(q) ||
    (c.tags || []).join(' ').toLowerCase().includes(q) ||
    c.text.toLowerCase().includes(q)
  );
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function render() {
  const list = filtered();
  $('countVal').textContent = String(list.length);
  const deck = $('deck');
  deck.innerHTML = '';
  if (!clips.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = i18n.t('noClips', i18n.current);
    deck.appendChild(div);
    return;
  }
  if (!list.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = i18n.t('noResults', i18n.current);
    deck.appendChild(div);
    return;
  }
  for (const clip of list) {
    const card = document.createElement('article');
    card.className = 'card pin';
    card.dataset.clipId = clip.id;
    const inner = [];
    inner.push((clip.image ? `<img class="cimg" src="${esc(clip.image)}" alt="">` : '') +
      `<h3>${esc(clip.title)}</h3>` +
      `<div class="curl">${esc(clip.url)}</div>` +
      `<div class="ctext">${esc((clip.text || '').slice(0, 220))}</div>`);
    const tags = (clip.tags || []).length
      ? `<div class="ctags">${(clip.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
      : '';
    inner.push(tags);
    inner.push(`<div class="tagrow"><input type="text" data-role="tags" value="${esc((clip.tags || []).join(', '))}" data-i18n-ph="${esc(i18n.t('tagsPh', i18n.current))}" placeholder="">` +
      `<button type="button" data-role="saveTags" data-i18n="${esc(i18n.t('tagsSave', i18n.current))}"></button></div>`);
    inner.push(`<div class="delrow"><button type="button" data-role="delete" data-i18n="${esc(i18n.t('deleteBtn', i18n.current))}"></button></div>`);
    card.innerHTML = inner.join('');
    const tagsInput = card.querySelector('[data-role=tags]');
    tagsInput.placeholder = i18n.t('tagsPh', i18n.current);
    card.querySelector('[data-role=saveTags]').textContent = i18n.t('tagsSave', i18n.current);
    card.querySelector('[data-role=delete]').textContent = i18n.t('deleteBtn', i18n.current);
    card.querySelector('[data-role=saveTags]').addEventListener('click', async () => {
      const clipRef = clips.find((c) => c.id === clip.id);
      if (!clipRef) return;
      clipRef.tags = tagsInput.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      await chrome.storage.local.set({ 'cd:clips': clips });
      flash(i18n.t('tagsOk', i18n.current));
      render();
    });
    card.querySelector('[data-role=delete]').addEventListener('click', async () => {
      clips = clips.filter((c) => c.id !== clip.id);
      await chrome.storage.local.set({ 'cd:clips': clips });
      flash(i18n.t('deletedOk', i18n.current));
      render();
    });
    deck.appendChild(card);
  }
}

async function capture() {
  const ex = await sendCapture();
  if (!ex || !ex.title) {
    flash(i18n.t('captureErr', i18n.current), true);
    return;
  }
  await loadClips();
  clips.unshift({
    id: 'cd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: (ex.title || '').slice(0, 240),
    url: ex.url || '',
    text: ex.text || '',
    image: ex.image || '',
    tags: [],
    ts: Date.now(),
  });
  await chrome.storage.local.set({ 'cd:clips': clips });
  flash(i18n.t('captureOk', i18n.current));
  render();
}

function download(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function exportMarkdown() {
  const list = filtered();
  const md = list.map((c) => {
    const lines = [`# ${c.title}`, '', `- URL: ${c.url}`, `- Captured: ${new Date(c.ts).toISOString()}`, `- Tags: ${(c.tags || []).join(', ') || '—'}`, '', (c.text || '').slice(0, 1000), '---', ''];
    return lines.join('\n');
  }).join('\n');
  download(`clipdeck-${Date.now()}.md`, 'text/markdown', md);
}

function exportJson() {
  const list = filtered().map(({ id, title, url, text, image, tags, ts }) => ({ id, title, url, text, image, tags, ts }));
  download(`clipdeck-${Date.now()}.json`, 'application/json', JSON.stringify(list, null, 2));
}

$('captureBtn').addEventListener('click', capture);
$('searchIn').addEventListener('input', (e) => {
  query = e.target.value;
  render();
});
$('exportMdBtn').addEventListener('click', exportMarkdown);
$('exportJsonBtn').addEventListener('click', exportJson);

async function init() {
  const lang = await i18n.getLang();
  i18n.current = lang;
  $('langSel').value = lang;
  i18n.apply(document);
  await loadClips();
  render();
}

$('langSel').addEventListener('change', async (e) => {
  const lang = await i18n.setLang(e.target.value);
  i18n.current = lang;
  i18n.apply(document);
  render();
});

init();