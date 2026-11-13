import './style.css';
import QRCode from 'qrcode';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { normalizeRoom, resolveResult, threshold, eligiblePlayers, requiredPlayers, MAX_PLAYERS } from './game.js';
import { membershipState } from './room-view.js';
import { LOCATION_SETS, locationSetId } from './locations.js';
import { unlockSound, toggleSound, soundEnabled, playSpyWin, playTimeout } from './sound.js';
import { avatar } from './avatars.js';
import { QUESTION_IDEAS } from './questions.js';
import { auth, db, identity, callGame } from './firebase.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',check:'<path d="m5 12 4 4L19 6"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',exit:'<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h11"/>'})[name] || ''}</svg>`;
const state = { code: new URLSearchParams(location.search).get('room')?.toUpperCase() || '', room: null, role: null, uid: null, tab: 'players', reveal: false, busy: false, loading: false, draft: null, stops: [], expireAttempt: 0, clockOffset: 0 };
let savedName = '';
let stopRole = null;
let connectionVersion = 0;
let heldPointer = null;
let heldKey = null;
let pendingWinSound = null;
let resolvingVote = false;
let lastScreen = '';
let lastPlayerIds = [];
let lastVotes = {};
let focusPlayers = false;
let questionIndex = 0;
let questionsOpen = false;
const inRound = r => ['active', 'accusing'].includes(r?.status);
const spyLabel = count => `${count} ${count === 1 ? 'spy' : 'spies'}`;
try { savedName = localStorage.getItem('spyfall-name') || ''; } catch {}

let noticeTimer;
function notice(message) { clearTimeout(noticeTimer); $('#notice').textContent = message; $('#notice').hidden = !message; if (message) noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 8000); }
function errorMessage(error) {
  if (error.code?.startsWith('auth/')) return 'Could not sign in. Check your connection and that anonymous sign-in is enabled in Firebase.';
  if (['functions/unavailable', 'functions/internal'].includes(error.code)) return 'The game server is unavailable. Please try again shortly.';
  if (error.code === 'permission-denied') return 'That action wasn’t allowed. The round may have changed; check your connection and try again.';
  return error.message || 'Something went wrong. Please try again.';
}
function header() {
  const r = state.room, active = inRound(r);
  return `<header class="floating-nav"><div class="nav-main"><a class="brand" href="/" aria-label="Spyfall home"><span class="brand-icon">${icon('eye', 26)}</span>spyfall<span class="brand-dot">✳</span></a><div class="header-tools">${active ? `<div class="nav-timer">${icon('clock', 16)}<span id="timer" aria-label="Time remaining">--:--</span></div>` : '<span class="edition">THE SOCIAL<br>DEDUCTION GAME</span>'}<button type="button" class="sound-control" data-action="sound" aria-pressed="${soundEnabled()}">Sound ${soundEnabled() ? 'on' : 'off'}</button></div></div>${r ? `<nav class="room-nav" aria-label="Room navigation"><span class="room-tag">${esc(state.code)}${active ? ` · ROUND ${r.roundId}` : ''}</span><div>${active && r.hostId === state.uid ? '<button type="button" class="nav-stop" data-action="stop">Stop round</button>' : ''}<button type="button" class="nav-exit" data-action="exit-room">${icon('exit', 15)} Exit</button></div></nav>` : ''}</header>`;
}
function shell(content, footer = 'A little suspicion brings people together.') {
  const screen = `${state.code}:${inRound(state.room) ? 'round' : state.room?.status || 'home'}:${state.room?.roundId || 0}:${state.room?.status === 'lobby' ? state.tab : ''}`;
  const entered = lastScreen !== screen;
  $('#app').innerHTML = `<div class="shell">${header()}<main class="${entered ? 'screen-enter' : ''}">${content}</main><footer><span class="tiny-eye">${icon('eye', 16)}</span>${footer}</footer></div>`;
  document.querySelectorAll('[data-player-id]').forEach((row, index) => {
    if (entered || !lastPlayerIds.includes(row.dataset.playerId)) { row.classList.add('player-enter'); row.style.setProperty('--arrival', `${Math.min(index, 5) * 45}ms`); }
    if (!entered && row.dataset.vote !== lastVotes[row.dataset.playerId]) row.querySelector('.player-meta')?.classList.add('vote-updated');
  });
  lastScreen = screen;
  lastPlayerIds = state.room?.memberIds || [];
  lastVotes = Object.fromEntries([...document.querySelectorAll('[data-player-id]')].map(row => [row.dataset.playerId, row.dataset.vote]));
  if (state.busy) document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  updateClock();
  if (focusPlayers && !state.busy) { focusPlayers = false; const tab = $('[data-action="players"]'); tab?.focus({ preventScroll: true }); tab?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
}
function home() {
  shell(`<section class="hero"><div class="eyebrow"><span class="dot"></span> SAME ROOM. SEPARATE PHONES.</div><h1>Good friends.<br><em>Great liars.</em></h1><p>One secret location. Spies in your midst.<br>Find out who’s hiding in plain sight.</p><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="agent agent-one">${icon('eye', 44)}</div><div class="agent agent-two">${icon('eye', 44)}</div><div class="agent agent-three">?</div><span class="art-note">trust no one.</span><span class="spark">✳</span></div><div class="facts"><span>${icon('users', 16)}2–15 players</span><span>${icon('clock', 16)}2–20 minutes</span><span>1–7 spies.</span></div></section><section class="panel entry"><label for="name">WHAT SHOULD WE CALL YOU?</label><input id="name" maxlength="20" autocomplete="nickname" placeholder="Your name" value="${esc(savedName)}"><button class="button primary" data-action="create">Create a room ${icon('plus')}</button><div class="divider"><span>or join your friends</span></div><form id="join-form"><label class="sr-only" for="code">Room code</label><div class="join-row"><input id="code" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ROOM CODE" value="${esc(state.code)}" required pattern="[A-Za-z2-9]{6}"><button class="button secondary" type="submit">Join ${icon('arrow')}</button></div></form><p class="fineprint">Got a QR code? Scan it with your phone’s camera.</p></section><section class="how"><div class="section-heading"><h2>A quick briefing</h2><span>01—03</span></div><div class="step"><span>01</span><div><h3>Get your secret</h3><p>Everyone learns the location. Except the spies.</p></div></div><div class="step"><span>02</span><div><h3>Ask. Answer. Act natural.</h3><p>Question each other out loud. Be specific enough to fit in, vague enough to keep the secret.</p></div></div><div class="step"><span>03</span><div><h3>Make your move</h3><p>Vote out the spy, or guess the location if you are one. Watch the clock.</p></div></div></section>`);
}
function playerList(voting = false) {
  const r = state.room;
  return r.players.map((p, index) => {
    const count = Object.values(r.votes || {}).filter(id => id === p.id).length;
    const caught = r.caughtIds.includes(p.id), canVote = r.status === 'active' && !r.caughtIds.includes(state.uid);
    return `<div class="player ${caught ? 'caught-player' : ''}" data-player-id="${esc(p.id)}" data-vote="${count}"><span class="avatar portrait">${avatar(p.id)}</span><div class="player-name">${esc(p.name)} ${p.id === state.uid ? '<small>(you)</small>' : ''}<span class="player-meta">${caught ? 'SPY CAUGHT' : voting ? `${count} ${count === 1 ? 'vote' : 'votes'}` : p.id === r.hostId ? 'HOST' : 'READY TO PLAY'}</span></div>${voting ? (caught ? '<span class="caught-badge">Caught</span>' : p.id !== state.uid ? `<button class="vote-button ${r.votes[state.uid] === p.id ? 'selected' : ''}" data-action="vote" data-target="${esc(p.id)}" aria-label="Vote for ${esc(p.name)}" ${!canVote ? 'disabled' : ''}>${r.votes[state.uid] === p.id ? icon('check') : 'Vote'}</button>` : '') : p.id === state.uid ? '<button class="text-button" data-action="rename">Edit name</button>' : state.uid === r.hostId ? `<button class="icon-button remove" data-action="remove" data-target="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button>` : `<span class="ready-dot"></span>`}</div>`;
  }).join('');
}
function readRulesForm() {
  return { minutes: Number($('#minutes').value), spies: Number($('#spies').value), voting: $('#voting').value, locations: [...document.querySelectorAll('.location-input')].map(input => input.value.trim()) };
}
function editLocation(type, index) {
  const draft = readRulesForm();
  if (type === 'add-location') {
    const value = $('#new-location').value.trim();
    if (!value) { notice('Enter a location name first.'); return; }
    if (draft.locations.length >= 40) { notice('You can use up to 40 locations.'); return; }
    if (draft.locations.some(location => location.toLowerCase() === value.toLowerCase())) { notice('That location is already in the list.'); return; }
    draft.locations.push(value);
  } else {
    if (draft.locations.length <= 3) { notice('Keep at least 3 locations.'); return; }
    draft.locations.splice(index, 1);
  }
  state.draft = draft; render();
  if (type === 'add-location') $('#new-location')?.focus();
}
function rules() {
  const r = state.room, host = r.hostId === state.uid, d = state.draft || r.settings;
  return `<section class="panel settings"><div class="section-heading"><h2>Set the scene</h2><span>${host ? 'HOST CONTROLS' : 'HOUSE RULES'}</span></div>${host ? `<form id="rules-form">
    <label for="minutes">ROUND LENGTH <output id="minutes-label">${d.minutes} min</output></label><input type="range" id="minutes" min="2" max="20" value="${d.minutes}"><p class="fineprint">Choose between 2 and 20 minutes.</p>
    <label for="voting">VOTING RULE</label><select id="voting"><option value="majority" ${d.voting === 'majority' ? 'selected' : ''}>Majority wins</option><option value="unanimous" ${d.voting === 'unanimous' ? 'selected' : ''}>Everyone except the accused</option></select>
    <label for="spies">NUMBER OF SPIES</label><select id="spies">${Array.from({ length: 7 }, (_, i) => `<option value="${i + 1}" ${d.spies === i + 1 ? 'selected' : ''}>${spyLabel(i + 1)} · ${requiredPlayers(i + 1)}+ players</option>`).join('')}</select><p class="fineprint">Catch every spy to win. Caught spies stop voting and guessing. A wrong accusation or a correct spy guess wins for the spies; a wrong guess wins for the group.</p>
    <label for="location-set">LOCATION SET</label><select id="location-set">${LOCATION_SETS.map(set => `<option value="${set.id}" ${locationSetId(d.locations) === set.id ? 'selected' : ''}>${set.name}</option>`).join('')}${locationSetId(d.locations) === 'custom' ? '<option value="custom" selected>Custom selection</option>' : ''}</select><p class="fineprint">Choosing a set replaces the list below. Add, edit, or remove locations to make it your own.</p>
    <div class="location-editor-heading">POSSIBLE LOCATIONS <span>${d.locations.length}/40 · minimum 3</span></div>
    <div class="location-editor">${d.locations.map((location, i) => `<div class="location-row"><input class="location-input" aria-label="Location ${i + 1}" maxlength="40" value="${esc(location)}" required><button type="button" class="remove-location" data-action="remove-location" data-index="${i}" aria-label="Remove ${esc(location)}" ${d.locations.length <= 3 ? 'disabled' : ''}>×</button></div>`).join('')}</div>
    <label for="new-location">ADD A LOCATION</label><div class="add-location-row"><input id="new-location" maxlength="40" placeholder="e.g. Ski resort"><button type="button" class="button secondary" data-action="add-location" ${d.locations.length >= 40 ? 'disabled' : ''}>Add ${icon('plus', 16)}</button></div>
    <p class="fineprint">Everyone can see this list. Only non-spies see the chosen location. Save your changes before starting.</p><button class="button secondary full" type="submit">Save rules ${icon('check')}</button>
  </form>` : `<dl class="rule-summary"><div><dt>Round length</dt><dd>${r.settings.minutes} minutes</dd></div><div><dt>Spies</dt><dd>${r.settings.spies}</dd></div><div><dt>Voting</dt><dd>${r.settings.voting === 'majority' ? 'Majority' : 'All except accused'}</dd></div></dl><div class="location-chips">${r.settings.locations.map(l => `<span>${esc(l)}</span>`).join('')}</div>`}</section>`;
}
function lobby() {
  const r = state.room, host = r.hostId === state.uid;
  const minimum = requiredPlayers(r.settings.spies), needed = minimum - r.players.length;
  shell(`<div class="lobby-intro"><h1>${host ? 'Gather your suspects.' : 'You’re in. Look innocent.'}</h1><p>${host ? 'Scan the code or share the link to join.' : 'Your host will start the round.'}</p></div>
    <section class="invite panel"><div><label>ROOM CODE</label><strong class="room-code">${esc(state.code)}</strong><button class="text-button" data-action="share">${icon('copy', 16)} Copy invite link</button></div><canvas id="qr" aria-label="Scan to join this room" role="img"></canvas></section>
    <div class="tabs" role="tablist" aria-label="Lobby sections"><button role="tab" aria-selected="${state.tab === 'players'}" data-action="players">Players <span>${r.players.length}/${MAX_PLAYERS}</span></button><button role="tab" aria-selected="${state.tab === 'rules'}" data-action="rules">Game rules ${icon('clock', 16)}</button></div>
    ${state.tab === 'players' ? `<section class="panel roster">${playerList()}${needed > 0 ? `<p class="waiting">Waiting for ${needed} more ${needed === 1 ? 'player' : 'players'} for ${spyLabel(r.settings.spies)}…</p>` : ''}</section><div class="round-summary">${icon('clock', 16)} ${r.settings.minutes} min <span>·</span> ${r.settings.locations.length} locations <span>·</span> ${spyLabel(r.settings.spies)}</div>${host ? '<button class="button secondary full edit-rules" data-action="rules">Edit game rules</button>' : ''}` : rules()}
    <div class="bottom-action">${host ? `<button class="button primary full" data-action="start" ${needed > 0 ? 'disabled' : ''}>Start the game ${icon('arrow')}</button>` : `<div class="waiting-host"><span class="pulse"></span> Waiting for the host to start</div>`}</div>`);
  QRCode.toCanvas($('#qr'), inviteUrl(), { width: 116, margin: 1, color: { dark: '#252a25', light: '#ffffff' } }).catch(() => notice('QR code unavailable. You can still share the invite link.'));
}
function active() {
  const r = state.room, role = state.role?.roundId === r.roundId ? state.role : null;
  const spy = role?.isSpy;
  const locations = `<section class="locations-detail" aria-labelledby="locations-heading">
    <div class="section-heading"><h2 id="locations-heading">Possible locations</h2><span>${r.settings.locations.length} ${icon('pin', 16)}</span></div>
    <p class="fineprint">Spies can tap a location to make a guess. Everyone can use this list to ask questions.</p>
    <div class="location-chips guess-grid">${r.settings.locations.map(l => `<button data-action="guess" data-location="${esc(l)}" aria-label="Guess ${esc(l)}" ${r.status === 'accusing' || r.caughtIds.includes(state.uid) ? 'disabled' : ''}>${esc(l)}</button>`).join('')}</div>
  </section>`;
  shell(`<div class="active-spacer"></div>
    ${r.settings.spies > 1 ? `<p class="spy-progress">${r.caughtIds.length}/${r.settings.spies} spies caught · Catch them all to win</p>` : ''}
    ${r.status === 'accusing' ? '<p class="round-status" role="status"><span class="pulse"></span> Checking the accusation…</p>' : ''}
    ${r.caughtIds.includes(state.uid) ? '<p class="round-status">You’ve been caught. Watch the remaining players finish the round.</p>' : ''}
    <section class="role-card ${state.reveal && spy ? 'spy-card' : ''}" id="role-card"><div id="role-content">${roleContent(role)}</div><button class="button secondary hold-reveal" id="reveal-role" type="button" aria-pressed="${state.reveal}" aria-describedby="reveal-help" ${!role ? 'disabled' : ''}>Hold to reveal ${icon('eye')}</button><p id="reveal-help" class="reveal-help">Release to hide. Keyboard: hold Space or Enter.</p></section>
    <details class="question-ideas panel" ${questionsOpen ? 'open' : ''}><summary>Question ideas <span>A little inspiration</span></summary><p class="fineprint">Keep answers broad. These prompts fit lots of places.</p><ul id="question-list">${[0,1,2].map(i => `<li>${QUESTION_IDEAS[(questionIndex + i) % QUESTION_IDEAS.length]}</li>`).join('')}</ul><button class="text-button" data-action="more-questions">More ideas ${icon('arrow', 16)}</button></details>
    ${locations}
    <div class="section-heading section-space"><h2>Vote for a player</h2><span>${Object.keys(r.votes).length}/${eligiblePlayers(r).length} VOTED</span></div>
    <p class="section-description">Everyone still in play can vote, including spies. ${threshold(r)} ${threshold(r) === 1 ? 'vote confirms' : 'votes confirm'} an accusation. ${r.settings.spies > 1 ? 'Catch every spy to win. Accusing an innocent player lets the spies win.' : 'An accusation ends the round.'}</p>
    <section class="panel roster">${playerList(true)}</section><p class="fineprint centered">You can change your vote until an accusation passes.</p>
    <p class="round-hint">${icon('users', 18)} Questions happen out loud. Decisions happen here.</p>`, 'Stay curious. Stay suspicious.');
}
function ended() {
  const r = state.room, result = r.result;
  if (!result?.winner) return shell('<div class="loading"><span class="pulse"></span><h2>Opening the case file…</h2><button class="text-button" data-action="refresh-result">Try again</button></div>');
  const spies = r.players.filter(p => result.spyIds.includes(p.id)), multiple = spies.length > 1;
  const spy = r.players.find(p => p.id === result.guesserId) || spies[0];
  const accused = r.players.find(p => p.id === result.accusedId);
  const reason = result.reason === 'timeout' ? 'Time ran out before all spies were caught.' : result.reason === 'guess' ? `${spy?.name} guessed “${result.guess}”. ${result.winner === 'spy' ? 'Right on the mark.' : 'The secret stayed safe.'}` : `${accused?.name} was accused. ${result.winner === 'players' ? 'Every spy has been caught.' : 'An innocent player. The spies win.'}`;
  shell(`<div class="eyebrow page-label"><span class="dot"></span> ROUND ${r.roundId} COMPLETE</div><div class="result-art">${icon('eye', 80)}<span>CASE CLOSED</span></div><h1 class="page-title result-title">${result.winner === 'spy' ? `${multiple ? 'The spies' : 'The spy'}<br><em>got away.</em>` : 'Cover<br><em>blown.</em>'}</h1><p class="subtitle">${result.winner === 'spy' ? `${multiple ? 'The spies win' : 'The spy wins'} this round.` : 'The group wins this round.'}</p><section class="panel result-panel"><label>${multiple ? 'THE SPIES WERE' : 'THE SPY WAS'}</label><h2>${spies.map(p => esc(p.name)).join(', ')}</h2><div class="result-location">${icon('pin')}<div><label>THE SECRET LOCATION</label><strong>${esc(result.location)}</strong></div></div><p>${esc(reason)}</p></section><div class="bottom-action">${state.uid === r.hostId ? `<button class="button primary full" data-action="reset">Back to lobby ${icon('arrow')}</button>` : '<div class="waiting-host"><span class="pulse"></span> Waiting for the host’s next round</div>'}<p class="fineprint centered">Same friends. A new secret.</p></div>`);
}
function render() {
  if (state.reveal) concealRole();
  if (state.loading && !state.room) return shell('<div class="loading"><span class="pulse"></span><h2>Finding your room…</h2><button class="text-button" data-action="home">Return home</button></div>');
  if (!state.room) return home();
  if (state.room.status === 'lobby') lobby();
  else if (inRound(state.room)) active();
  else ended();
}
function inviteUrl() { const url = new URL(location.origin); url.searchParams.set('room', state.code); return url.href; }
function disconnect() { connectionVersion++; state.stops.forEach(stop => stop()); state.stops = []; stopRole?.(); stopRole = null; state.room = null; state.role = null; state.loading = false; state.draft = null; state.reveal = false; }
async function loadResult() {
  const roundId = state.room?.roundId, code = state.code;
  try {
    const secret = (await getDoc(doc(db, 'rooms', code, 'secrets', 'current'))).data();
    if (state.code === code && state.room?.roundId === roundId && state.room.status === 'ended' && secret?.roundId === roundId) {
      state.room.result = resolveResult(state.room.result, secret);
      if (pendingWinSound === `${code}:${roundId}`) {
        pendingWinSound = null;
        if (state.room.result.reason === 'guess' && state.room.result.winner === 'spy') playSpyWin();
        else if (state.room.result.reason === 'timeout') playTimeout();
      }
      render();
    }
  } catch (error) { notice(errorMessage(error)); }
}
async function connect(code) {
  disconnect(); state.code = code; state.loading = true; render();
  const version = connectionVersion;
  history.replaceState(null, '', `?room=${encodeURIComponent(code)}`);
  try {
    state.uid = (await identity()).uid;
    if (version !== connectionVersion) return;
    state.stops.push(onSnapshot(doc(db, 'rooms', code), { includeMetadataChanges: true }, snap => {
      if (version !== connectionVersion) return;
      const membership = membershipState(snap, state.uid);
      if (membership === 'pending') return;
      if (membership === 'removed') { disconnect(); render(); notice('You are no longer in this room.'); return; }
      const next = normalizeRoom(snap.data());
      if (next.status === 'lobby' && inRound(state.room)) notice('Round stopped. You’re back in the lobby.');
      if (next.status === 'ended' && inRound(state.room) && next.roundId === state.room.roundId) pendingWinSound = `${code}:${next.roundId}`;
      if (next.caughtIds.length > (state.room?.caughtIds.length || 0)) notice('A spy was caught. Votes reset—keep looking for the others.');
      if (next.roundId !== state.room?.roundId || next.status !== state.room?.status) { state.reveal = false; state.expireAttempt = 0; $('#confirm').close(); }
      state.room = next; state.loading = false; render();
      if (inRound(next) && !stopRole) stopRole = onSnapshot(doc(db, 'rooms', code, 'roles', state.uid), roleSnap => { state.role = roleSnap.exists() ? roleSnap.data() : null; if (inRound(state.room)) render(); }, async error => {
        state.role = null; stopRole = null;
        // A stop/reset can revoke role reads before the room listener catches up.
        if (error.code === 'permission-denied') {
          try {
            const confirmed = await getDoc(doc(db, 'rooms', code));
            if (version !== connectionVersion || !confirmed.exists() || !inRound(confirmed.data())) return;
          } catch { return; }
        }
        notice(errorMessage(error));
      });
      if (!inRound(next) && stopRole) { stopRole(); stopRole = null; state.role = null; }
      if (next.status === 'ended') loadResult();
      if (next.status === 'accusing' && !snap.metadata.hasPendingWrites) resolveAccusation();
    }, error => { if (version !== connectionVersion) return; disconnect(); render(); notice(errorMessage(error)); }));
  } catch (error) { if (version !== connectionVersion) return; disconnect(); render(); notice(errorMessage(error)); }
}
async function resolveAccusation() {
  if (resolvingVote || state.room?.status !== 'accusing' || !navigator.onLine) return;
  resolvingVote = true;
  try { await action('resolve-vote'); } catch (error) { notice(errorMessage(error)); }
  finally { resolvingVote = false; }
}
function confirmAction(title, text, label, task) {
  const dialog = $('#confirm');
  dialog.innerHTML = `<form method="dialog"><span class="eyebrow">MAKE YOUR MOVE</span><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="button primary full" id="confirm-action" type="button">${esc(label)}</button><button class="button quiet full" value="cancel">Not yet</button></form>`;
  dialog.showModal();
  $('#confirm-action').onclick = () => { dialog.close(); run(task); };
}
async function run(task) {
  if (state.busy) return;
  if (!navigator.onLine) { notice('You’re offline. Reconnect to make your move.'); return; }
  state.busy = true; notice('');
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try { await task(); } catch (error) { notice(errorMessage(error)); }
  finally { state.busy = false; render(); }
}
async function action(type, extra = {}) { return callGame({ action: type, code: state.code, roundId: state.room?.roundId, ...extra }); }
function getName() { const name = $('#name')?.value.trim(); if (!name) throw new Error('Enter your name first.'); savedName = name; try { localStorage.setItem('spyfall-name', name); } catch {} return name; }
function roleContent(role) {
  if (!role) return `<div class="role-icon">${icon('lock', 28)}</div><h2>Retrieving your role…</h2><p>Your secret briefing is on its way.</p>`;
  if (!state.reveal) return `<div class="role-icon">${icon('lock', 28)}</div><h2>For your eyes only.</h2><p>Make sure no one is peeking.</p>`;
  return `<span class="eyebrow">${role.isSpy ? 'YOUR MISSION' : 'YOU ARE NOT THE SPY'}</span><h2>${role.isSpy ? 'You’re the spy.' : esc(role.location)}</h2><p>${role.isSpy ? 'Blend in. Guess a location, or vote to throw them off.' : 'Ask clever questions. Keep this location secret.'}</p>`;
}
function concealRole() {
  heldPointer = null; heldKey = null;
  setRoleRevealed(false);
}
function setRoleRevealed(reveal) {
  state.reveal = Boolean(reveal && inRound(state.room) && state.role?.roundId === state.room.roundId);
  const card = $('#role-card'), content = $('#role-content'), button = $('#reveal-role');
  if (content) content.innerHTML = roleContent(state.role?.roundId === state.room?.roundId ? state.role : null);
  card?.classList.toggle('spy-card', Boolean(state.reveal && state.role?.isSpy));
  card?.classList.toggle('is-revealed', state.reveal);
  button?.setAttribute('aria-pressed', String(state.reveal));
}
$('#app').addEventListener('pointerdown', event => {
  if (!event.target.closest('#reveal-role') || event.button !== 0 || !event.isPrimary || state.busy) return;
  event.preventDefault(); heldPointer = event.pointerId;
  $('#app').setPointerCapture(event.pointerId);
  setRoleRevealed(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, event => {
  if (event.pointerId === heldPointer) concealRole();
});
$('#app').addEventListener('keydown', event => {
  if (event.target.id === 'new-location' && event.key === 'Enter') { event.preventDefault(); editLocation('add-location'); return; }
  if (event.target.id !== 'reveal-role' || ![' ', 'Enter'].includes(event.key) || state.busy) return;
  event.preventDefault(); heldKey = event.key; setRoleRevealed(true);
});
window.addEventListener('keyup', event => { if (event.key === heldKey) { event.preventDefault(); concealRole(); } });
$('#app').addEventListener('focusout', event => { if (event.target.id === 'reveal-role') concealRole(); });
$('#app').addEventListener('contextmenu', event => { if (event.target.closest('#reveal-role')) event.preventDefault(); });
window.addEventListener('blur', concealRole);
document.addEventListener('pointerdown', unlockSound, { passive: true });
document.addEventListener('keydown', unlockSound);
$('#app').addEventListener('change', event => {
  if (event.target.id !== 'location-set') return;
  const selected = LOCATION_SETS.find(set => set.id === event.target.value);
  if (!selected) return;
  state.draft = { ...readRulesForm(), locations: [...selected.locations] };
  render();
});
$('#app').addEventListener('input', event => {
  if (event.target.id === 'name') savedName = event.target.value;
  if (event.target.id === 'code') { event.target.value = event.target.value.toUpperCase(); state.code = event.target.value; }
  if (event.target.closest('#rules-form')) {
    state.draft = readRulesForm();
    $('#minutes-label').textContent = `${state.draft.minutes} min`;
  }
});
$('#app').addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'join-form') run(async () => { const code = $('#code').value.trim().toUpperCase(); const name = getName(); await callGame({ action: 'join', code, name }); await connect(code); });
  if (event.target.id === 'rules-form') run(async () => { if ($('#new-location').value.trim()) throw new Error('Press Add to include your new location before saving.'); await action('settings', { settings: readRulesForm() }); state.draft = null; state.tab = 'players'; focusPlayers = true; notice('Game rules saved.'); });
});
$('#app').addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const type = button.dataset.action;
  if (type === 'more-questions') { questionIndex = (questionIndex + 3) % QUESTION_IDEAS.length; const list = $('#question-list'); list.innerHTML = [0,1,2].map(i => `<li>${QUESTION_IDEAS[(questionIndex + i) % QUESTION_IDEAS.length]}</li>`).join(''); return; }
  if (type === 'rename') {
    const dialog = $('#confirm');
    dialog.innerHTML = `<form id="rename-form"><h2>Your agent name</h2><label for="player-name">NAME</label><input id="player-name" maxlength="20" required autocomplete="nickname" value="${esc(state.room.players.find(p => p.id === state.uid).name)}"><button class="button primary full name-save" type="submit">Save name ${icon('check')}</button><button class="button quiet full" type="button" id="cancel-name">Cancel</button></form>`;
    dialog.showModal();
    $('#cancel-name').onclick = () => dialog.close();
    $('#rename-form').onsubmit = event => { event.preventDefault(); const name = $('#player-name').value.trim(); dialog.close(); run(async () => { await action('rename', { name }); savedName = name; try { localStorage.setItem('spyfall-name', name); } catch {} }); };
    return;
  }
  if (type === 'stop') return confirmAction('Stop this round?', 'Everyone will return to the lobby. No winner will be recorded.', 'Stop round', () => action('stop'));
  if (type === 'exit-room') return confirmAction('Exit the room?', state.room.status === 'lobby' ? 'You can rejoin using the room code. If you are hosting, the next player becomes host.' : 'This will return everyone to the lobby and reset the round. If you are hosting, the next player becomes host.', 'Exit room', async () => { await action('leave'); disconnect(); state.code = ''; history.replaceState(null, '', '/'); render(); });
  if (type === 'sound') { toggleSound(); button.textContent = `Sound ${soundEnabled() ? 'on' : 'off'}`; button.setAttribute('aria-pressed', String(soundEnabled())); return; }
  if (type === 'add-location' || type === 'remove-location') return editLocation(type, Number(button.dataset.index));
  if (type === 'refresh-result') return loadResult();
  if (type === 'create') return run(async () => { const { code } = await callGame({ action: 'create', name: getName() }); await connect(code); });
  if (type === 'players' || type === 'rules') { state.tab = type; render(); return; }
  if (type === 'home') { disconnect(); history.replaceState(null, '', '/'); state.code = ''; render(); return; }
  if (type === 'share') return run(async () => { try { await navigator.clipboard.writeText(inviteUrl()); notice('Invite link copied. Send it to your friends.'); } catch { notice(`Invite link: ${inviteUrl()}`); } });
  if (type === 'vote') { const player = state.room.players.find(p => p.id === button.dataset.target); return confirmAction(`Accuse ${player.name}?`, 'If enough players agree, their role is checked. Catch every spy to win. A wrong accusation lets the spies win.', 'Cast my vote', () => action('vote', { target: player.id })); }
  if (type === 'guess') {
    if (!state.role?.isSpy) { notice('Only the spy can submit a location guess. You can vote for a player below.'); return; }
    return confirmAction(`Guess ${button.dataset.location}?`, 'This is your only guess. Get it wrong and the other players win.', 'Lock in my guess', () => action('guess', { location: button.dataset.location }));
  }
  if (type === 'remove') return confirmAction('Remove this player?', 'They can rejoin using the room code while the lobby is open.', 'Remove player', () => action('remove', { target: button.dataset.target }));
  if (type === 'leave') return run(async () => { await action('leave'); disconnect(); state.code = ''; history.replaceState(null, '', '/'); render(); });
  if (type === 'start' && state.draft) { notice('Save your game rules before starting.'); state.tab = 'rules'; render(); return; }
  if (['start', 'reset'].includes(type)) run(() => action(type));
});
function updateClock() {
  const r = state.room; if (!inRound(r)) return;
  const seconds = Math.max(0, Math.ceil((r.endsAt - Date.now() - state.clockOffset) / 1000));
  const timer = $('#timer');
  if (timer) { timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; timer.classList.toggle('urgent', seconds < 30); }
  if (r.status === 'accusing') resolveAccusation();
  if (seconds === 0 && navigator.onLine && !state.busy && Date.now() - state.expireAttempt > 5000) {
    state.expireAttempt = Date.now();
    action('expire').catch(error => notice(errorMessage(error)));
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) concealRole(); else updateClock(); });
$('#app').addEventListener('toggle', event => { if (event.target.matches('.question-ideas')) questionsOpen = event.target.open; }, true);
window.addEventListener('offline', () => notice('You’re offline. Your place is saved; reconnect to keep playing.'));
window.addEventListener('online', () => { notice('Back online.'); updateClock(); });
setInterval(updateClock, 1000);
state.loading = Boolean(state.code);
render();
// QR and invite links enter the room automatically; the name can be edited in the lobby.
identity().then(async user => {
  state.uid = user.uid;
  if (state.code) {
    const snap = await getDoc(doc(db, 'rooms', state.code));
    if (!snap.exists()) throw new Error('That room does not exist. Check the invite link.');
    if (!snap.data().memberIds.includes(user.uid)) {
      const codename = () => `Agent ${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      let name = savedName || codename();
      if (Object.values(snap.data().players).some(p => p.name.toLowerCase() === name.toLowerCase())) name = codename();
      await callGame({ action: 'join', code: state.code, name });
      savedName = name; try { localStorage.setItem('spyfall-name', name); } catch {}
    }
    await connect(state.code);
  }
}).catch(error => { state.loading = false; render(); notice(errorMessage(error)); });
