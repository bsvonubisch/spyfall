import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  LANGUAGES,
  setLanguage,
  getLanguage,
  preferredLanguage,
  t,
  locationName,
  canonicalLocation,
  locationInputValue,
  questionText,
  applyDocumentLanguage,
} from '../../src/i18n.js';
import { LOCATION_SETS } from '../../src/locations.js';
import { QUESTION_IDEAS } from '../../src/questions.js';
import { USAGE_EVENTS } from '../../src/usage-events.js';
import { SOUND_PREVIEWS } from '../../src/sound.js';

const english = JSON.parse(readFileSync('src/locales/en.json'));
const placeholders = (text) => [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
after(() => setLanguage('en'));

test('every language covers the complete interface, locations, and questions with matching placeholders', () => {
  assert.equal(LANGUAGES.length, 10);
  for (const { code } of LANGUAGES) {
    const catalog = JSON.parse(readFileSync(`src/locales/${code}.json`));
    for (const section of ['ui', 'locations', 'questions']) {
      assert.deepEqual(
        Object.keys(catalog[section]).sort(),
        Object.keys(english[section]).sort(),
        `${code}/${section}`,
      );
      for (const [key, text] of Object.entries(catalog[section])) {
        assert.equal(typeof text, 'string');
        assert.ok(text.trim(), `${code}: ${key}`);
        assert.deepEqual(placeholders(text), placeholders(key), `${code}: ${key}`);
        assert.ok(
          !/<\/?[a-z]/i.test(text),
          'translations are text; markup is passed by the renderer',
        );
      }
    }
    assert.deepEqual(
      Object.keys(catalog.locations).sort(),
      [...new Set(LOCATION_SETS.flatMap((set) => set.locations))].sort(),
    );
    assert.deepEqual(Object.keys(catalog.questions), QUESTION_IDEAS);
  }
  for (const key of [
    ...Object.values(USAGE_EVENTS),
    ...SOUND_PREVIEWS.map((sound) => sound.label),
    ...LOCATION_SETS.map((set) => set.name),
  ])
    assert.ok(Object.hasOwn(english.ui, key), key);
  // New literal message calls cannot silently fall back to English in another locale.
  for (const file of readdirSync('src').filter((file) => file.endsWith('.js'))) {
    const source = readFileSync(`src/${file}`, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*(['"])(.*?)\1/g))
      assert.ok(Object.hasOwn(english.ui, match[2]), `${file}: ${match[2]}`);
  }
});

test('translated locations round-trip to English while user text and custom locations stay unchanged', async () => {
  for (const { code } of LANGUAGES) {
    await setLanguage(code);
    for (const canonical of Object.keys(english.locations)) {
      const label = locationName(canonical);
      assert.equal(canonicalLocation(label), canonical, `${code}: ${canonical}`);
      assert.equal(locationInputValue({ value: label, dataset: { canonical, label } }), canonical);
    }
    assert.equal(locationName('My custom cabin'), 'My custom cabin');
    assert.equal(locationName('constructor'), 'constructor');
    assert.equal(t('__proto__'), '__proto__');
    assert.equal(canonicalLocation(' My custom cabin '), 'My custom cabin');
    assert.equal(
      locationInputValue({
        value: 'New custom place',
        dataset: { canonical: 'Airport', label: locationName('Airport') },
      }),
      'New custom place',
    );
    const hostile = '<img src=x onerror=alert(1)>';
    assert.ok(
      t('Remove {name}', { name: hostile }).includes(hostile),
      'parameter content is not interpreted as another translation key',
    );
    assert.ok(questionText(QUESTION_IDEAS[0]));
    if (code !== 'en') assert.notEqual(questionText(QUESTION_IDEAS[0]), QUESTION_IDEAS[0]);
  }
  await setLanguage('de');
  assert.equal(locationName('Airport'), 'Flughafen');
  await setLanguage('fr');
  assert.equal(locationName('Airport'), 'Aéroport');
  assert.equal(LOCATION_SETS[0].locations[0], 'Airport');
});

test('language preference is local, validated, race-safe, and does not need storage permission', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    storage = new Map();
  try {
    globalThis.localStorage = {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    };
    assert.equal(preferredLanguage(), 'en');
    await setLanguage('it');
    assert.equal(preferredLanguage(), 'it');
    await Promise.all([setLanguage('ru'), setLanguage('ja')]);
    assert.equal(getLanguage(), 'ja');
    await assert.rejects(setLanguage('unknown'), /Unsupported/);
    assert.equal(getLanguage(), 'ja');
    storage.set('spyfall-language', '<script>');
    assert.equal(preferredLanguage(), 'en');
    globalThis.localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    assert.equal(preferredLanguage(), 'en');
    await setLanguage('es');
    assert.equal(getLanguage(), 'es');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('Arabic sets RTL and accessible document language, then switching back restores LTR', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><head><meta name="description"></head><body></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    globalThis.document = dom.window.document;
    await setLanguage('ar');
    applyDocumentLanguage();
    assert.equal(document.documentElement.dir, 'rtl');
    assert.equal(document.documentElement.lang, 'ar');
    assert.ok(document.title.includes('لا تثق'));
    await setLanguage('zh');
    applyDocumentLanguage();
    assert.equal(document.documentElement.lang, 'zh-Hans');
    assert.equal(document.documentElement.dir, 'ltr');
    await setLanguage('en');
    applyDocumentLanguage();
    assert.equal(document.title, 'Spyfall — Trust no one.');
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
});
