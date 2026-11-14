import DOMPurify from 'dompurify';

const options = {
  USE_PROFILES: { html: true, svg: true },
  RETURN_DOM_FRAGMENT: true,
  FORBID_TAGS: ['style', 'foreignObject'],
};

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

// Keep escaped text in templates and sanitize the complete markup at the DOM boundary.
export function renderHtml(target, markup) {
  target.replaceChildren(DOMPurify.sanitize(markup, options));
}

export function appendHtml(target, markup) {
  target.append(DOMPurify.sanitize(markup, options));
}
