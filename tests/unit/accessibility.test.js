import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import { captureFocus, restoreFocus, bindTabNavigation } from '../../src/accessibility.js';
import { setLanguage } from '../../src/i18n.js';

const dom = new JSDOM(
  '<!doctype html><html lang="en"><head><title>Spyfall</title></head><body><main id="app" tabindex="-1"></main><dialog id="confirm"></dialog></body></html>',
  { pretendToBeVisual: true, runScripts: 'outside-only' },
);
const previous = new Map();
for (const name of [
  'window',
  'document',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  globalThis[name] =
    typeof dom.window[name] === 'function' && name.endsWith('AnimationFrame')
      ? dom.window[name].bind(dom.window)
      : name === 'window'
        ? dom.window
        : dom.window[name];
}
const { renderHtml } = await import('../../src/render-html.js');
const { homeView } = await import('../../src/home-view.js');
const { showDialog, bindDialogViewport } = await import('../../src/dialog.js');
const { roleContent } = await import('../../src/role-view.js');
const root = document.querySelector('#app');
const dialog = document.querySelector('#confirm');
// jsdom has no native modal focus trap. Browser checks cover that behavior.
dialog.showModal = () => {
  dialog.open = true;
};
dialog.close = () => {
  dialog.open = false;
  dialog.dispatchEvent(new dom.window.Event('close'));
};
bindDialogViewport(dialog);
dom.window.eval(axe.source);

after(async () => {
  await setLanguage('en');
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

test('live rerenders restore the same player control and input selection without taking dialog focus', () => {
  const markup =
    '<input id="entry-name" value="Avery"><div data-player-id="one"><button data-action="rename">Edit</button></div><div data-player-id="two"><button data-action="rename">Edit</button></div>';
  renderHtml(root, markup);
  const field = root.querySelector('input');
  field.focus();
  field.setSelectionRange(1, 4);
  let saved = captureFocus(root);
  renderHtml(root, markup);
  assert.equal(restoreFocus(root, saved), true);
  assert.equal(document.activeElement.selectionStart, 1);
  assert.equal(document.activeElement.selectionEnd, 4);
  root.querySelector('[data-player-id="two"] button').focus();
  saved = captureFocus(root);
  renderHtml(root, markup);
  restoreFocus(root, saved);
  assert.equal(document.activeElement.closest('[data-player-id]').dataset.playerId, 'two');
  showDialog(dialog, '<h2>Profile</h2><button>Close</button>');
  assert.equal(restoreFocus(root, saved), false);
  assert.equal(document.activeElement, dialog.querySelector('h2'));
  renderHtml(root, markup);
  dialog.close();
  assert.equal(document.activeElement.closest('[data-player-id]').dataset.playerId, 'two');
});

test('tabs support manual activation, wrapping, Home/End and right-to-left arrow keys', () => {
  renderHtml(
    root,
    '<div role="tablist"><button role="tab" tabindex="0" aria-selected="true">One</button><button role="tab" tabindex="-1" aria-selected="false">Two</button><button role="tab" disabled>Unavailable</button></div>',
  );
  bindTabNavigation(root);
  const [first, second] = root.querySelectorAll('button');
  let clicks = 0;
  root.addEventListener('click', () => clicks++);
  const key = (value) =>
    document.activeElement.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }),
    );
  first.focus();
  key('ArrowRight');
  assert.equal(document.activeElement, second);
  assert.equal(first.tabIndex, -1);
  assert.equal(second.tabIndex, 0);
  assert.equal(clicks, 0, 'arrows must not fetch or activate the panel');
  assert.equal(first.getAttribute('aria-selected'), 'true');
  key('ArrowRight');
  assert.equal(document.activeElement, first);
  key('End');
  assert.equal(document.activeElement, second);
  key('Home');
  assert.equal(document.activeElement, first);
  key('ArrowRight');
  root.focus();
  assert.equal(first.tabIndex, 0, 'returning to the tablist starts at its selected tab');
  assert.equal(second.tabIndex, -1);
  first.focus();
  document.documentElement.dir = 'rtl';
  key('ArrowLeft');
  assert.equal(document.activeElement, second);
  document.documentElement.dir = 'ltr';
});

test('dialogs receive a title, focus name fields, and clear private content on close', () => {
  renderHtml(root, '<button id="open-profile">Edit profile</button>');
  root.querySelector('button').focus();
  showDialog(
    dialog,
    '<h2>Your profile</h2><label for="player-name">Name</label><input id="player-name" data-initial-focus>',
  );
  assert.equal(dialog.getAttribute('aria-labelledby'), dialog.querySelector('h2').id);
  assert.equal(document.activeElement.id, 'player-name');
  showDialog(
    dialog,
    `<h2>Your role</h2>${roleContent({ isSpy: false, location: 'Airport' }, true)}<button>Close</button>`,
  );
  assert.equal(document.activeElement, dialog.querySelector('h2'));
  assert.match(dialog.textContent, /Airport/);
  const close = dialog.querySelector('button');
  close.focus();
  close.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
  );
  assert.equal(document.activeElement, close, 'a single-button dialog keeps focus inside');
  dialog.close();
  assert.equal(dialog.textContent, '');
  assert.equal(document.activeElement.id, 'open-profile');
});

test('hidden roles never include a secret; revealed user text remains literal', () => {
  for (const isSpy of [true, false]) {
    const role = { isSpy, location: '<img src=x onerror=alert(1)>' };
    renderHtml(root, roleContent(role));
    assert.doesNotMatch(root.textContent, /img|spy/i);
    renderHtml(root, roleContent(role, true));
    assert.equal(root.querySelector('img'), null);
    assert.equal(root.textContent.includes(role.location), !isSpy);
  }
});

test('rendered welcome and named dialog markup pass automated accessibility rules in English and Arabic', async () => {
  for (const language of ['en', 'ar']) {
    await setLanguage(language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    renderHtml(
      root,
      homeView({
        name: 'Avery',
        code: '',
        account: '<button type="button" aria-label="Continue with Google">G</button>',
      }),
    );
    showDialog(
      dialog,
      '<h2>Profile</h2><label for="player-name">Name</label><input id="player-name"><button>Save</button>',
    );
    const result = await dom.window.axe.run(document, {
      rules: { 'color-contrast': { enabled: false } },
    });
    assert.equal(
      result.violations.length,
      0,
      JSON.stringify(
        result.violations.map(({ id, nodes }) => ({
          id,
          elements: nodes.map((node) => node.html),
        })),
      ),
    );
    dialog.close();
  }
});
