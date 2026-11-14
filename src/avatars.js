export function safeAvatarUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^[a-zA-Z0-9-]+\.googleusercontent\.com$/.test(url.hostname) && !url.username && !url.password && !url.port ? url.href : '';
  } catch { return ''; }
}
export function playerAvatar(player) {
  const image = safeAvatarUrl(player.avatarUrl);
  const escaped = image.replace(/[&"<>]/g, char => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'})[char]);
  return `${avatar(player.avatarSeed || player.id)}${image ? `<img class="google-avatar" src="${escaped}" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async">` : ''}`;
}

// Stable, randomized-looking portraits derived only from player ID, never role.
export function avatar(id) {
  let seed = 2166136261;
  for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const pick = values => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return values[seed % values.length]; };
  const background = pick(['#dce8af','#f7cdb5','#c9e1df','#e0d4eb','#f2dfa8','#d0def1']);
  const skin = pick(['#f7cfa5','#e4ae86','#c7845f','#a96c49','#754b36']);
  const coat = pick(['#49615b','#75547a','#385f85','#ba6249','#777a3f']);
  const hair = pick(['#30342e','#5b392b','#a7683e','#d4a559','#e0d6c4']);
  const style = pick([0,1,2,3]);
  const glasses = pick([true,false]);
  const hairPath = ['<path d="M13 22v-5C13 5 36 5 36 20l-5-5-4 4-5-5-9 8Z"/>','<path d="M12 22v-7C12 4 36 3 36 20l-5-3-2-6-8 7-9 4Z"/>','<path d="M11 20C9 7 38 7 37 20h-6v-7H17v9Z"/>','<path d="M10 18h28v5H10zM15 8h18l2 11H13Z"/>'][style];
  return `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false"><rect width="48" height="48" rx="15" fill="${background}"/><path d="M7 48v-5c0-14 34-14 34 0v5" fill="${coat}"/><path d="m19 34 5 9 5-9" fill="#f9f5e9"/><rect x="20" y="29" width="8" height="8" rx="3" fill="${skin}"/><rect x="13" y="10" width="22" height="24" rx="10" fill="${skin}"/><g fill="${hair}">${hairPath}</g>${glasses ? '<g fill="none" stroke="#28312d" stroke-width="1.7"><circle cx="19" cy="23" r="4"/><circle cx="29" cy="23" r="4"/><path d="M23 23h2"/></g>' : '<g fill="#28312d"><circle cx="19" cy="23" r="1.4"/><circle cx="29" cy="23" r="1.4"/></g>'}<path d="M21 29q3 2 6 0" fill="none" stroke="#704c3b" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}
