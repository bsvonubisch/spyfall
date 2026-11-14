import { t } from './i18n.js';
import { escapeHtml as esc } from './render-html.js';
import { icon } from './icons.js';

export function homeView({ name, code, account }) {
  return /* HTML */ `<section class="hero">
      <div class="eyebrow"><span class="dot"></span> ${t('SAME ROOM. SEPARATE PHONES.')}</div>
      <h1>${t('Good friends.')}<br /><em>${t('Great liars.')}</em></h1>
      <p>
        ${t('One secret location. Spies in your midst.')}<br />${t('Find out who’s hiding in plain sight.')}
      </p>
      <div class="hero-art" aria-hidden="true">
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <div class="agent agent-one">${icon('eye', 44)}</div>
        <div class="agent agent-two">${icon('eye', 44)}</div>
        <div class="agent agent-three">?</div>
        <span class="art-note">${t('trust no one.')}</span><span class="spark">✳</span>
      </div>
      <div class="facts">
        <span>${icon('users', 16)}${t('2–15 players')}</span
        ><span>${icon('clock', 16)}${t('2–20 minutes')}</span><span>${t('1–3 spies.')}</span>
      </div>
    </section>
    <section class="panel entry">
      <label for="entry-name">${t('WHAT SHOULD WE CALL YOU?')}</label>
      <div class="name-field">
        <input
          id="entry-name"
          maxlength="20"
          autocomplete="nickname"
          placeholder="${t('Your name')}"
          value="${esc(name)}"
        />${account}
      </div>
      <button class="button primary" data-action="create">
        ${t('Create a room')} ${icon('plus')}
      </button>
      <div class="divider"><span>${t('or join your friends')}</span></div>
      <form id="join-form">
        <label class="sr-only" for="code">${t('Room code')}</label>
        <div class="join-row">
          <input
            id="code"
            maxlength="6"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            placeholder="${t('ROOM CODE')}"
            value="${esc(code)}"
            required
            pattern="[A-Za-z2-9]{6}"
          /><button class="button secondary" type="submit">${t('Join')} ${icon('arrow')}</button>
        </div>
      </form>
      <p class="fineprint">${t('Got a QR code? Scan it with your phone’s camera.')}</p>
    </section>
    <button class="text-button leaderboard-link" data-action="scores">
      ${t('View overall leaderboard')}
    </button>
    <section class="how">
      <div class="section-heading">
        <h2>${t('A quick briefing')}</h2>
        <span>01—03</span>
      </div>
      <div class="step">
        <span>01</span>
        <div>
          <h3>${t('Get your secret')}</h3>
          <p>${t('Everyone learns the location. Except the spies.')}</p>
        </div>
      </div>
      <div class="step">
        <span>02</span>
        <div>
          <h3>${t('Ask. Answer. Act natural.')}</h3>
          <p>
            ${t('Question each other out loud. Be specific enough to fit in, vague enough to keep the secret.')}
          </p>
        </div>
      </div>
      <div class="step">
        <span>03</span>
        <div>
          <h3>${t('Make your move')}</h3>
          <p>${t('Vote out the spy, or guess the location if you are one. Watch the clock.')}</p>
        </div>
      </div>
    </section>`;
}
