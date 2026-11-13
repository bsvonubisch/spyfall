// Mobile keyboards resize the visual viewport, not always the layout viewport.
// All dialogs share this positioning and remain internally scrollable when short.
export function bindDialogViewport(dialog, viewport = window.visualViewport) {
  let frame;
  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      dialog.style.setProperty('--modal-top', `${viewport?.offsetTop || 0}px`);
      dialog.style.setProperty('--modal-height', `${viewport?.height || window.innerHeight}px`);
      const field = document.activeElement;
      if (dialog.open && dialog.contains(field) && field.matches('input, textarea, select')) {
        const bounds = dialog.getBoundingClientRect(), input = field.getBoundingClientRect();
        if (input.bottom > bounds.bottom - 16) dialog.scrollTop += input.bottom - bounds.bottom + 16;
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
