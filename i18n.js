'use strict';

const LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de'];

const I18N = {
  en: {
    appTitle: 'ClipDeck', tagline: 'clip the page, keep the card', credit: 'Built by Harley Vásquez',
    captureBtn: '[ clip this page ]', captureOk: 'ok: card added to the deck',
    captureErr: 'cannot read this page (content script missing)', searchPh: 'search deck (title, tag, text)…',
    noClips: '~ the deck is empty, clip a page', noResults: '~ no cards match',
    tagsPh: 'tags, comma separated', tagsSave: '[ save tags ]', tagsOk: 'ok: tags saved',
    deleteBtn: '[ discard ]', deletedOk: 'ok: card discarded',
    exportMd: 'export .md', exportJson: 'export .json', countLabel: 'cards:',
  },
  es: {
    appTitle: 'ClipDeck', tagline: 'recorta la página, guarda la ficha', credit: 'Creado por Harley Vásquez',
    captureBtn: '[ recortar esta página ]', captureOk: 'ok: ficha añadida al mazo',
    captureErr: 'no se puede leer esta página (content script ausente)', searchPh: 'buscar en el mazo (título, tag, texto)…',
    noClips: '~ el mazo está vacío, recorta una página', noResults: '~ ninguna ficha coincide',
    tagsPh: 'tags, separados por coma', tagsSave: '[ guardar tags ]', tagsOk: 'ok: tags guardados',
    deleteBtn: '[ descartar ]', deletedOk: 'ok: ficha descartada',
    exportMd: 'exportar .md', exportJson: 'exportar .json', countLabel: 'fichas:',
  },
  fr: {
    appTitle: 'ClipDeck', tagline: 'capture la page, garde la fiche', credit: 'Créé par Harley Vásquez',
    captureBtn: '[ découper cette page ]', captureOk: 'ok : fiche ajoutée au paquet',
    captureErr: 'page illisible (script de contenu absent)', searchPh: 'chercher dans le paquet (titre, tag, texte)…',
    noClips: '~ le paquet est vide, découpez une page', noResults: '~ aucune fiche ne correspond',
    tagsPh: 'tags, séparés par des virgules', tagsSave: '[ enregistrer les tags ]', tagsOk: 'ok : tags enregistrés',
    deleteBtn: '[ jeter ]', deletedOk: 'ok : fiche jetée',
    exportMd: 'exporter .md', exportJson: 'exporter .json', countLabel: 'fiches :',
  },
  pt: {
    appTitle: 'ClipDeck', tagline: 'recorte a página, guarde a ficha', credit: 'Criado por Harley Vásquez',
    captureBtn: '[ recortar esta página ]', captureOk: 'ok: ficha adicionada ao baralho',
    captureErr: 'não dá para ler a página (sem script de conteúdo)', searchPh: 'buscar no baralho (título, tag, texto)…',
    noClips: '~ o baralho está vazio, recorte uma página', noResults: '~ nenhuma ficha corresponde',
    tagsPh: 'tags, separados por vírgula', tagsSave: '[ salvar tags ]', tagsOk: 'ok: tags salvos',
    deleteBtn: '[ descartar ]', deletedOk: 'ok: ficha descartada',
    exportMd: 'exportar .md', exportJson: 'exportar .json', countLabel: 'fichas:',
  },
  it: {
    appTitle: 'ClipDeck', tagline: 'ritaglia la pagina, conserva la scheda', credit: 'Creato da Harley Vásquez',
    captureBtn: '[ ritaglia questa pagina ]', captureOk: 'ok: scheda aggiunta al mazzo',
    captureErr: 'pagina illeggibile (nessun content script)', searchPh: 'cerca nel mazzo (titolo, tag, testo)…',
    noClips: '~ il mazzo è vuoto, ritaglia una pagina', noResults: '~ nessuna scheda corrisponde',
    tagsPh: 'tag, separati da virgola', tagsSave: '[ salva tag ]', tagsOk: 'ok: tag salvati',
    deleteBtn: '[ scarta ]', deletedOk: 'ok: scheda scartata',
    exportMd: 'esporta .md', exportJson: 'esporta .json', countLabel: 'schede:',
  },
  de: {
    appTitle: 'ClipDeck', tagline: 'Seite clippen, Karte behalten', credit: 'Erstellt von Harley Vásquez',
    captureBtn: '[ diese Seite clippen ]', captureOk: 'ok: Karte zum Stapel hinzugefügt',
    captureErr: 'Seite nicht lesbar (kein Content-Script)', searchPh: 'Stapel durchsuchen (Titel, Tag, Text)…',
    noClips: '~ der Stapel ist leer, clippe eine Seite', noResults: '~ keine Karte passt',
    tagsPh: 'Tags, getrennt durch Kommas', tagsSave: '[ Tags speichern ]', tagsOk: 'ok: Tags gespeichert',
    deleteBtn: '[ verwerfen ]', deletedOk: 'ok: Karte verworfen',
    exportMd: '.md exportieren', exportJson: '.json exportieren', countLabel: 'Karten:',
  },
};

const apply = (root) => {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (I18N[current][key] !== undefined) el.textContent = I18N[current][key];
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const key = el.getAttribute('data-i18n-ph');
    if (I18N[current][key] !== undefined) el.placeholder = I18N[current][key];
  });
};

const getLang = () =>
  chrome.storage.local.get('cd:lang').then(({ 'cd:lang': lang }) => (LANGUAGES.includes(lang) ? lang : detect()));
const setLang = (lang) => chrome.storage.local.set({ 'cd:lang': lang }).then(() => (LANGUAGES.includes(lang) ? lang : 'en'));
const detect = () => {
  const nav = (navigator.language || 'en').toLowerCase().split('-')[0];
  return LANGUAGES.includes(nav) ? nav : 'en';
};

let current = 'en';

window.ClipDeckI18N = {
  apply, getLang, setLang,
  t: (key, lang) => (I18N[lang] || I18N.en)[key] !== undefined ? (I18N[lang] || I18N.en)[key] : key,
  get current() { return current; },
  set current(l) { current = l; },
};