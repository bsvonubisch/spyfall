const paths = {
  eye: /* HTML */ `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle
      cx="12"
      cy="12"
      r="3"
    />`,
  arrow: /* HTML */ `<path d="M4 12h16m-6-6 6 6-6 6" />`,
  plus: /* HTML */ `<path d="M12 5v14M5 12h14" />`,
  users: /* HTML */ `<circle cx="9" cy="8" r="3" /><path
      d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"
    />`,
  clock: /* HTML */ `<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />`,
  lock: /* HTML */ `<rect x="5" y="10" width="14" height="11" rx="3" /><path
      d="M8 10V7a4 4 0 0 1 8 0v3"
    />`,
  check: /* HTML */ `<path d="m5 12 4 4L19 6" />`,
  copy: /* HTML */ `<rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" />`,
  pin: /* HTML */ `<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle
      cx="12"
      cy="10"
      r="2"
    />`,
  exit: /* HTML */ `<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h11" />`,
};

export const icon = (name, size = 20) =>
  /* HTML */ `<svg
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${paths[name] || ''}
  </svg>`;

export function soundIcon(enabled) {
  return /* HTML */ `<svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="m11 4-5 4H3v8h3l5 4Z" />
    ${enabled ? /* HTML */ `<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />` : /* HTML */ `<path d="m16 9 6 6m0-6-6 6" />`}
  </svg>`;
}
