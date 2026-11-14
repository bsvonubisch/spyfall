import { t, locationName } from './i18n.js';
import { escapeHtml as esc } from './render-html.js';

export function roleContent(role, revealed = false) {
  if (!role)
    return /* HTML */ `<strong class="role-title">${t('Retrieving your role…')}</strong
      ><span class="role-note">${t('Your secret briefing is on its way.')}</span>`;
  if (!revealed)
    return /* HTML */ `<strong class="role-title">${t('For your eyes only.')}</strong
      ><span class="role-note">${t('Hold to reveal · release to hide')}</span>`;
  return /* HTML */ `<span class="role-label"
      >${role.isSpy ? t('YOUR MISSION') : t('YOU ARE NOT THE SPY')}</span
    ><strong class="role-title"
      >${role.isSpy ? t('You’re the spy.') : esc(locationName(role.location))}</strong
    ><span class="role-note"
      >${role.isSpy ? t('Blend in. Guess the location.') : t('Keep this location secret.')}</span
    >`;
}
