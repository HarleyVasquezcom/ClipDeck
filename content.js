'use strict';

const TEXT_MAX = 5000;
const IMG_MIN = 48;

function mainText() {
  const strip = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, svg, canvas, img, video, audio, iframe').forEach((n) => n.remove());
    return clone;
  };
  let best = null;
  for (const el of Array.from(document.querySelectorAll('article, main, [role=main], section'))) {
    const text = (strip(el).innerText || '').trim();
    if (text.length > 200 && (!best || text.length > best.text.length)) best = { el, text };
  }
  if (best) return best.text.slice(0, TEXT_MAX);
  const bodyText = (strip(document.body).innerText || '').trim();
  return bodyText.slice(0, TEXT_MAX);
}

function mainImage() {
  const imgs = Array.from(document.querySelectorAll('img[src]'))
    .filter((img) => {
      const w = img.naturalWidth || img.clientWidth || 0;
      const h = img.naturalHeight || img.clientHeight || 0;
      return (w >= IMG_MIN && h >= IMG_MIN) || /^data:image\//.test(img.src || '');
    })
    .sort((a, b) => {
      const area = (i) => (i.naturalWidth || i.clientWidth || 0) * (i.naturalHeight || i.clientHeight || 0);
      return area(b) - area(a);
    });
  if (!imgs.length) return '';
  const img = imgs[0];
  return img.currentSrc || img.src || '';
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'cd:capture') return;
  sendResponse({
    title: document.title || location.hostname,
    url: location.href,
    text: mainText(),
    image: mainImage(),
  });
});