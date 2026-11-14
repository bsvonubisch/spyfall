import english from './locales/en.json' with { type: 'json' };

export const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' }, { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文（普通话）' }, { code: 'ja', name: '日本語' },
  { code: 'nl', name: 'Nederlands' }, { code: 'ar', name: 'العربية' },
  { code: 'es', name: 'Español' }, { code: 'it', name: 'Italiano' }
];
const loaders = {
  de: () => import('./locales/de.js'),
  fr: () => import('./locales/fr.js'),
  ru: () => import('./locales/ru.js'),
  zh: () => import('./locales/zh.js'),
  ja: () => import('./locales/ja.js'),
  nl: () => import('./locales/nl.js'),
  ar: () => import('./locales/ar.js'),
  es: () => import('./locales/es.js'),
  it: () => import('./locales/it.js')
};
let language = 'en', catalog = english, request = 0;
export const getLanguage = () => language;
export function preferredLanguage() {
  try { const saved = localStorage.getItem('spyfall-language'); return LANGUAGES.some(l => l.code === saved) ? saved : 'en'; } catch { return 'en'; }
}
export async function setLanguage(code) {
  if (!LANGUAGES.some(l => l.code === code)) throw new Error('Unsupported language');
  const version = ++request;
  const next = code === 'en' ? english : (await loaders[code]()).default;
  if (version !== request) return false;
  language = code; catalog = next;
  try { localStorage.setItem('spyfall-language', code); } catch { /* Guest play also works without storage. */ }
  return true;
}
export function t(key, values = {}) {
  const message = Object.hasOwn(catalog.ui, key) ? catalog.ui[key] : Object.hasOwn(english.ui, key) ? english.ui[key] : key;
  return message.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
export const locationName = value => Object.hasOwn(catalog.locations, value) ? catalog.locations[value] : value;
export const questionText = value => Object.hasOwn(catalog.questions, value) ? catalog.questions[value] : value;
// Translated labels never become room settings, role answers, or guesses.
export function canonicalLocation(value) {
  const text = value.trim();
  return Object.keys(english.locations).find(key => key.toLocaleLowerCase() === text.toLocaleLowerCase())
    || Object.keys(catalog.locations).find(key => catalog.locations[key].toLocaleLowerCase() === text.toLocaleLowerCase()) || text;
}
export function locationInputValue(input) {
  return input.value === input.dataset.label ? input.dataset.canonical : canonicalLocation(input.value);
}
export const formatNumber = value => new Intl.NumberFormat(language).format(value);
export const formatDate = (value, options) => new Intl.DateTimeFormat(language, options).format(value);
export function applyDocumentLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-Hans' : language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = t('Spyfall — Trust no one.');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('A room full of friends. One secret spy. Play Spyfall together, each on your own phone.'));
}
