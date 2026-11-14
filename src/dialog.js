// Mobile keyboards resize the visual viewport, not always the layout viewport.
// All dialogs share this positioning and remain internally scrollable when short.
import { renderHtml } from './render-html.js';
import { captureFocus, restoreFocus } from './accessibility.js';

const returnFocus = new WeakMap();

export function showDialog(dialog, markup) {
  const wasOpen = dialog.open;
  const previous = dialog.ownerDocument.activeElement;
  if (!wasOpen) returnFocus.set(dialog, captureFocus(dialog.ownerDocument.body));
  renderHtml(dialog, markup);
  const heading = dialog.querySelector('h2');
  if (heading) {
    heading.id = `${dialog.id}-title`;
    heading.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  if (!wasOpen) dialog.showModal();
  // Replacing an open dialog must not send focus behind the modal.
  const replacement =
    wasOpen && previous?.id
      ? [...dialog.querySelectorAll('[id]')].find((node) => node.id === previous.id)
      : null;
  (replacement || dialog.querySelector('[data-initial-focus]') || heading)?.focus({
    preventScroll: true,
  });
}

export function bindDialogViewport(dialog, viewport = window.visualViewport) {
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [
      ...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'),
    ].filter((node) => {
      const style = dialog.ownerDocument.defaultView.getComputedStyle(node);
      return (
        node.tabIndex >= 0 &&
        !node.disabled &&
        !node.closest('[hidden]') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    });
    const first = controls[0],
      last = controls.at(-1);
    const active = dialog.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !controls.includes(active))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener('close', () => {
    // A close event may arrive after the same dialog has been reopened.
    if (dialog.open) return;
    dialog.replaceChildren();
    dialog.removeAttribute('aria-labelledby');
    restoreFocus(
      dialog.ownerDocument.body,
      returnFocus.get(dialog),
      dialog.ownerDocument.querySelector('main'),
    );
    returnFocus.delete(dialog);
  });
  let frame;
  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      dialog.style.setProperty('--modal-top', `${viewport?.offsetTop || 0}px`);
      dialog.style.setProperty('--modal-height', `${viewport?.height || window.innerHeight}px`);
      const field = document.activeElement;
      if (dialog.open && dialog.contains(field) && field.matches('input, textarea, select')) {
        const bounds = dialog.getBoundingClientRect(),
          input = field.getBoundingClientRect();
        if (input.bottom > bounds.bottom - 16)
          dialog.scrollTop += input.bottom - bounds.bottom + 16;
        else if (input.top < bounds.top + 16) dialog.scrollTop -= bounds.top + 16 - input.top;
      }
    });
  }
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  dialog.addEventListener('focusin', update);
  new MutationObserver(update).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  update();
}
