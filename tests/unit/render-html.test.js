import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { playerAvatar } from '../../src/avatars.js';

const dom = new JSDOM('<!doctype html><main id="app"></main>');
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
globalThis.window = dom.window;
const { renderHtml, appendHtml, escapeHtml } = await import('../../src/render-html.js');
after(() => {
  dom.window.close();
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else delete globalThis.window;
});
const target = dom.window.document.querySelector('#app');

test('HTML boundaries strip active payloads from both rendered and appended content', () => {
  const payloads = [
    '<img src=x onerror="alert(1)"><script>alert(1)</script>',
    '<svg onload="alert(1)"><a href="javascript:alert(1)">click</a></svg>',
    '<a href="java&#x09;script:alert(1)">click</a><iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>',
    '<form id="attributes"><input name="parentNode"></form>',
  ];
  for (const insert of [renderHtml, appendHtml]) {
    for (const payload of payloads) {
      target.replaceChildren();
      insert(target, payload);
      assert.equal(
        target.querySelector(
          'script, iframe, style, foreignObject, math, [id="attributes"], [name="parentNode"]',
        ),
        null,
      );
      for (const element of target.querySelectorAll('*')) {
        for (const attribute of element.attributes) {
          assert.ok(!/^on/i.test(attribute.name), attribute.name);
          if (['href', 'src', 'xlink:href'].includes(attribute.name))
            assert.ok(!/^javascript:/i.test(attribute.value.replace(/[\s\u0000-\u001f]/g, '')));
        }
      }
    }
  }
});

test('player names and location text stay literal in text and form attributes', () => {
  const value = "\"><img src=x onerror=alert(1)> & 'quoted'";
  renderHtml(target, `<strong>${escapeHtml(value)}</strong><input value="${escapeHtml(value)}">`);
  assert.equal(target.querySelector('strong').textContent, value);
  assert.equal(target.querySelector('input').value, value);
  assert.equal(target.querySelector('img'), null);
});

test('sanitization preserves form controls, inline SVG avatars, and layout attributes', () => {
  renderHtml(
    target,
    `<form id="join-form"><label for="entry-name">Name</label><input id="entry-name" value="Agent"><input id="minutes" type="range" min="2" max="20" value="8" style="--range-progress: 33%"><select id="spies"><option value="2" selected>2 spies</option></select><button data-action="join" aria-label="Join room">Join</button></form><canvas id="qr"></canvas>${playerAvatar({ id: 'agent', avatarUrl: 'https://lh3.googleusercontent.com/a/photo' })}`,
  );
  assert.equal(target.querySelector('#entry-name')?.value, 'Agent');
  assert.equal(target.querySelector('#minutes').value, '8');
  assert.equal(target.querySelector('#minutes').style.getPropertyValue('--range-progress'), '33%');
  assert.equal(target.querySelector('#spies').value, '2');
  assert.equal(
    target.querySelector('[data-action="join"]').getAttribute('aria-label'),
    'Join room',
  );
  assert.ok(target.querySelector('#qr'));
  assert.ok(target.querySelector('svg path'));
  assert.equal(
    target.querySelector('.google-avatar').getAttribute('src'),
    'https://lh3.googleusercontent.com/a/photo',
  );
  appendHtml(target, '<p>Appended content</p>');
  assert.ok(target.querySelector('#join-form'));
  assert.equal(target.lastChild.textContent, 'Appended content');
});
