// Keep keyboard position stable when a Firestore snapshot replaces a screen.
const focusAttributes = [
  'id',
  'data-action',
  'data-target',
  'data-location',
  'data-index',
  'data-scope',
  'data-focus-key',
];

export function captureFocus(root) {
  const element = root.ownerDocument.activeElement;
  if (!root.contains(element)) return null;
  const attributes = focusAttributes
    .filter((name) => element.hasAttribute(name))
    .map((name) => [name, element.getAttribute(name)]);
  const form = element.closest('form')?.id;
  if (!attributes.length && !form) return null;
  return {
    tag: element.tagName,
    type: element.type,
    attributes,
    form,
    player: element.closest('[data-player-id]')?.dataset.playerId,
    selection:
      typeof element.selectionStart === 'number'
        ? [element.selectionStart, element.selectionEnd, element.selectionDirection]
        : null,
  };
}

export function restoreFocus(root, saved, fallback = null) {
  const document = root.ownerDocument;
  // An open dialog owns focus, even when the room behind it updates.
  if (document.querySelector('dialog[open]')) return false;
  const target =
    saved &&
    [...root.querySelectorAll(saved.tag)].find(
      (element) =>
        !element.disabled &&
        element.type === saved.type &&
        !element.closest('[hidden]') &&
        saved.attributes.every(([name, value]) => element.getAttribute(name) === value) &&
        (!saved.form || element.closest('form')?.id === saved.form) &&
        (!saved.player || element.closest('[data-player-id]')?.dataset.playerId === saved.player),
    );
  const next = target || fallback;
  if (!next) return false;
  next.focus({ preventScroll: true });
  if (target && saved.selection) target.setSelectionRange?.(...saved.selection);
  return document.activeElement === next;
}

// Tabs use manual activation: arrows move focus; Enter/Space selects a panel.
// This avoids starting a leaderboard request on every arrow-key press.
export function bindTabNavigation(root) {
  root.addEventListener('focusout', (event) => {
    const list = event.target.closest('[role="tablist"]');
    if (!list || list.contains(event.relatedTarget)) return;
    list.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    });
  });
  root.addEventListener('keydown', (event) => {
    const current = event.target.closest('[role="tab"]');
    const list = current?.closest('[role="tablist"]');
    if (!list || event.altKey || event.ctrlKey || event.metaKey) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')].filter((tab) => !tab.disabled);
    const index = tabs.indexOf(current);
    const rtl = root.ownerDocument.documentElement.dir === 'rtl';
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
    else if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
    else return;
    event.preventDefault();
    tabs.forEach((tab) => {
      tab.tabIndex = -1;
    });
    const target = tabs[(next + tabs.length) % tabs.length];
    target.tabIndex = 0;
    target.focus();
  });
}
