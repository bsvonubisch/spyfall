import './style.css';
import QRCode from 'qrcode';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { normalizeRoom, resolveResult, threshold } from './game.js';
import { membershipState } from './room-view.js';
import { auth, db, identity, callGame } from './firebase.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',check:'<path d="m5 12 4 4L19 6"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',exit:'<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h11"/>'})[name] || ''}</svg>`;
const state = { code: new URLSearchParams(location.search).get('room')?.toUpperCase() || '', room: null, role: null, uid: null, tab: 'players', reveal: false, busy: false, loading: false, draft: null, stops: [], expireAttempt: 0, clockOffset: 0 };
let savedName = '';
let stopRole = null;
let connectionVersion = 0;
try { savedName = localStorage.getItem('spyfall-name') || ''; } catch {}

let noticeTimer;
function notice(message) { clearTimeout(noticeTimer); $('#notice').textContent = message; $('#notice').hidden = !message; if (message) noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 8000); }
function errorMessage(error) {
  if (error.code?.startsWith('auth/')) return 'Could not sign in. Check your connection and that anonymous sign-in is enabled in Firebase.';
  if (['functions/unavailable', 'functions/internal'].includes(error.code)) return 'The game server is unavailable. Please try again shortly.';
  if (error.code === 'permission-denied') return 'That action wasn’t allowed. The round may have changed; check your connection and try again.';
  return error.message || 'Something went wrong. Please try again.';
}
function header() { return `<header><a class="brand" href="/" aria-label="Spyfall home"><span class="brand-icon">${icon('eye', 26)}</span>spyfall<span class="brand-dot">✳</span></a><span class="edition">THE SOCIAL<br>DEDUCTION GAME</span></header>`; }
function shell(content, footer = 'A little suspicion brings people together.') {
  $('#app').innerHTML = `<div class="shell">${header()}<main>${content}</main><footer><span class="tiny-eye">${icon('eye', 16)}</span>${footer}</footer></div>`;
  if (state.busy) document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  updateClock();
}
function home() {
  shell(`<section class="hero"><div class="eyebrow"><span class="dot"></span> SAME ROOM. SEPARATE PHONES.</div><h1>Good friends.<br><em>Great liars.</em></h1><p>One secret location. One undercover spy.<br>Find out who’s hiding in plain sight.</p><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="agent agent-one">${icon('eye', 44)}</div><div class="agent agent-two">${icon('eye', 44)}</div><div class="agent agent-three">?</div><span class="art-note">trust no one.</span><span class="spark">✳</span></div><div class="facts"><span>${icon('users', 16)}2–12 players</span><span>${icon('clock', 16)}2–20 minutes</span><span>One spy.</span></div></section><section class="panel entry"><label for="name">WHAT SHOULD WE CALL YOU?</label><input id="name" maxlength="20" autocomplete="nickname" placeholder="Your name" value="${esc(savedName)}"><button class="button primary" data-action="create">Create a room ${icon('plus')}</button><div class="divider"><span>or join your friends</span></div><form id="join-form"><label class="sr-only" for="code">Room code</label><div class="join-row"><input id="code" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ROOM CODE" value="${esc(state.code)}" required pattern="[A-Za-z2-9]{6}"><button class="button secondary" type="submit">Join ${icon('arrow')}</button></div></form><p class="fineprint">Got a QR code? Scan it with your phone’s camera.</p></section><section class="how"><div class="section-heading"><h2>A quick briefing</h2><span>01—03</span></div><div class="step"><span>01</span><div><h3>Get your secret</h3><p>Everyone learns the location. Except the spy.</p></div></div><div class="step"><span>02</span><div><h3>Ask. Answer. Act natural.</h3><p>Question each other out loud. Be specific enough to fit in, vague enough to keep the secret.</p></div></div><div class="step"><span>03</span><div><h3>Make your move</h3><p>Vote out the spy, or guess the location if you are one. Watch the clock.</p></div></div></section>`);
}
function playerList(voting = false) {
  const r = state.room;
  return r.players.map((p, index) => {
    const count = Object.values(r.votes || {}).filter(id => id === p.id).length;
    return `<div class="player"><span class="avatar tone-${index % 4}">${esc(p.name.charAt(0).toUpperCase())}</span><div class="player-name">${esc(p.name)} ${p.id === state.uid ? '<small>(you)</small>' : ''}<span class="player-meta">${voting ? `${count} ${count === 1 ? 'vote' : 'votes'}` : p.id === r.hostId ? 'HOST' : 'READY TO PLAY'}</span></div>${voting ? (p.id !== state.uid ? `<button class="vote-button ${r.votes[state.uid] === p.id ? 'selected' : ''}" data-action="vote" data-target="${esc(p.id)}" aria-label="Vote for ${esc(p.name)}">${r.votes[state.uid] === p.id ? icon('check') : 'Vote'}</button>` : '') : state.uid === r.hostId && p.id !== state.uid ? `<button class="icon-button remove" data-action="remove" data-target="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button>` : `<span class="ready-dot"></span>`}</div>`;
  }).join('');
}
function rules() {
  const r = state.room, host = r.hostId === state.uid, d = state.draft || r.settings;
  return `<section class="panel settings"><div class="section-heading"><h2>Set the scene</h2><span>${host ? 'HOST CONTROLS' : 'HOUSE RULES'}</span></div>${host ? `<form id="rules-form"><label for="minutes">ROUND LENGTH <output id="minutes-label">${d.minutes} min</output></label><input type="range" id="minutes" min="2" max="20" value="${d.minutes}"><label for="voting">VOTING RULE</label><select id="voting"><option value="majority" ${d.voting === 'majority' ? 'selected' : ''}>Majority wins</option><option value="unanimous" ${d.voting === 'unanimous' ? 'selected' : ''}>Everyone except the accused</option></select><label for="locations">POSSIBLE LOCATIONS <span>One per line · 3–40</span></label><textarea id="locations" rows="8" maxlength="1640">${esc(d.locations.join('\n'))}</textarea><p class="fineprint">Everyone can see this list. Only non-spies see the chosen location.</p><button class="button secondary full" type="submit">Save rules ${icon('check')}</button></form>` : `<dl class="rule-summary"><div><dt>Round length</dt><dd>${r.settings.minutes} minutes</dd></div><div><dt>Voting</dt><dd>${r.settings.voting === 'majority' ? 'Majority' : 'All except accused'}</dd></div></dl><div class="location-chips">${r.settings.locations.map(l => `<span>${esc(l)}</span>`).join('')}</div>`}</section>`;
}
function lobby() {
  const r = state.room, host = r.hostId === state.uid;
  shell(`<div class="eyebrow page-label"><span class="dot"></span> THE LOBBY</div><h1 class="page-title">${host ? 'Gather your<br><em>usual suspects.</em>' : 'You’re in.<br><em>Look innocent.</em>'}</h1><p class="subtitle">${host ? 'Share the code. Let the mind games begin.' : 'Get comfortable. Your host will start the round.'}</p><section class="invite panel"><div><label>ROOM CODE</label><strong class="room-code">${esc(state.code)}</strong><button class="text-button" data-action="share">${icon('copy', 16)} Copy invite link</button></div><canvas id="qr" aria-label="Scan to join this room" role="img"></canvas></section><div class="tabs" role="tablist" aria-label="Lobby sections"><button role="tab" aria-selected="${state.tab === 'players'}" data-action="players">Players <span>${r.players.length}/12</span></button><button role="tab" aria-selected="${state.tab === 'rules'}" data-action="rules">Game rules ${icon('clock', 16)}</button></div>${state.tab === 'players' ? `<section class="panel roster">${playerList()}${r.players.length < 2 ? `<p class="waiting">Waiting for ${2 - r.players.length} more player to begin…</p>` : ''}</section><div class="round-summary">${icon('clock', 16)} ${r.settings.minutes} min <span>·</span> ${r.settings.locations.length} locations <span>·</span> 1 spy</div>` : rules()}<div class="bottom-action">${host ? `<button class="button primary full" data-action="start" ${r.players.length < 2 ? 'disabled' : ''}>Start the game ${icon('arrow')}</button>` : `<div class="waiting-host"><span class="pulse"></span> Waiting for the host to start</div>`}<button class="text-button leave" data-action="leave">${icon('exit', 16)} Leave room</button></div>`);
  QRCode.toCanvas($('#qr'), inviteUrl(), { width: 116, margin: 1, color: { dark: '#252a25', light: '#ffffff' } }).catch(() => notice('QR code unavailable. You can still share the invite link.'));
}
function active() {
  const r = state.room, role = state.role?.roundId === r.roundId ? state.role : null;
  const spy = role?.isSpy;
  shell(`<div class="round-top"><span class="eyebrow">ROUND ${r.roundId.toString().padStart(2, '0')}</span><span class="room-tag">${esc(state.code)}</span></div><div class="timer-wrap"><div class="timer-ring"><span id="timer" aria-label="Time remaining">--:--</span><span class="timer-caption">KEEP YOUR COOL</span></div></div><section class="role-card ${state.reveal && spy ? 'spy-card' : ''}">${!role ? `<div class="role-icon">${icon('lock', 28)}</div><h2>Retrieving your role…</h2><p>Your secret briefing is on its way.</p>` : !state.reveal ? `<div class="role-icon">${icon('lock', 28)}</div><h2>For your eyes only.</h2><p>Make sure no one is peeking.</p><button class="button secondary" data-action="reveal">Reveal my role ${icon('eye')}</button>` : `<span class="eyebrow">${spy ? 'YOUR MISSION' : 'YOU ARE NOT THE SPY'}</span><h2>${spy ? 'You’re the spy.' : esc(role.location)}</h2><p>${spy ? 'Blend in. Listen closely. Find the location.' : 'Ask clever questions. Keep this location secret.'}</p><button class="text-button" data-action="hide">${icon('lock', 15)} Hide my role</button>`}</section><div class="section-heading section-space"><h2>Who’s the spy?</h2><span>${Object.keys(r.votes).length}/${r.players.length} VOTED</span></div><p class="section-description">${r.settings.voting === 'majority' ? `${threshold(r)} ${threshold(r) === 1 ? 'vote' : 'votes'}` : 'Everyone except the accused'} on one player ends the round. Choose carefully.</p><section class="panel roster">${playerList(true)}</section><p class="fineprint centered">You can change your vote until an accusation passes.</p><details class="locations-detail"><summary>Possible locations <span>${r.settings.locations.length} ${icon('pin', 16)}</span></summary><p class="fineprint">${spy ? 'You get one guess. A wrong guess gives the group the win.' : 'Use these to guide your questions without giving the answer away.'}</p><div class="location-chips ${spy ? 'guess-grid' : ''}">${r.settings.locations.map(l => spy ? `<button data-action="guess" data-location="${esc(l)}">${esc(l)}</button>` : `<span>${esc(l)}</span>`).join('')}</div></details><p class="round-hint">${icon('users', 18)} Questions happen out loud. Decisions happen here.</p>`, 'Stay curious. Stay suspicious.');
}
function ended() {
  const r = state.room, result = r.result;
  if (!result?.winner) return shell('<div class="loading"><span class="pulse"></span><h2>Opening the case file…</h2><button class="text-button" data-action="refresh-result">Try again</button></div>');
  const spy = r.players.find(p => p.id === result.spyId);
  const accused = r.players.find(p => p.id === result.accusedId);
  const reason = result.reason === 'timeout' ? 'Time ran out. The spy kept their cover.' : result.reason === 'guess' ? `${spy?.name} guessed “${result.guess}”. ${result.winner === 'spy' ? 'Right on the mark.' : 'The secret stayed safe.'}` : `${accused?.name} was accused. ${result.winner === 'players' ? 'You found your spy.' : 'The real spy slipped away.'}`;
  shell(`<div class="eyebrow page-label"><span class="dot"></span> ROUND ${r.roundId} COMPLETE</div><div class="result-art">${icon('eye', 80)}<span>CASE CLOSED</span></div><h1 class="page-title result-title">${result.winner === 'spy' ? 'The spy<br><em>got away.</em>' : 'Cover<br><em>blown.</em>'}</h1><p class="subtitle">${result.winner === 'spy' ? 'The spy wins this round.' : 'The group wins this round.'}</p><section class="panel result-panel"><label>THE SPY WAS</label><h2>${esc(spy?.name)}</h2><div class="result-location">${icon('pin')}<div><label>THE SECRET LOCATION</label><strong>${esc(result.location)}</strong></div></div><p>${esc(reason)}</p></section><div class="bottom-action">${state.uid === r.hostId ? `<button class="button primary full" data-action="reset">Back to lobby ${icon('arrow')}</button>` : '<div class="waiting-host"><span class="pulse"></span> Waiting for the host’s next round</div>'}<p class="fineprint centered">Same friends. A new secret.</p></div>`);
}
function render() {
  if (state.loading && !state.room) return shell('<div class="loading"><span class="pulse"></span><h2>Finding your room…</h2><button class="text-button" data-action="home">Return home</button></div>');
  if (!state.room) return home();
  if (state.room.status === 'lobby') lobby();
  else if (state.room.status === 'active') active();
  else ended();
}
function inviteUrl() { const url = new URL(location.origin); url.searchParams.set('room', state.code); return url.href; }
function disconnect() { connectionVersion++; state.stops.forEach(stop => stop()); state.stops = []; stopRole?.(); stopRole = null; state.room = null; state.role = null; state.loading = false; state.draft = null; state.reveal = false; }
async function loadResult() {
  const roundId = state.room?.roundId, code = state.code;
  try {
    const secret = (await getDoc(doc(db, 'rooms', code, 'secrets', 'current'))).data();
    if (state.code === code && state.room?.roundId === roundId && state.room.status === 'ended' && secret?.roundId === roundId) {
      state.room.result = resolveResult(state.room.result, secret); render();
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
      if (next.roundId !== state.room?.roundId || next.status !== state.room?.status) { state.reveal = false; state.expireAttempt = 0; $('#confirm').close(); }
      state.room = next; state.loading = false; render();
      if (next.status === 'active' && !stopRole) stopRole = onSnapshot(doc(db, 'rooms', code, 'roles', state.uid), roleSnap => { state.role = roleSnap.exists() ? roleSnap.data() : null; if (state.room?.status === 'active') render(); }, error => { state.role = null; stopRole = null; notice(errorMessage(error)); });
      if (next.status !== 'active' && stopRole) { stopRole(); stopRole = null; state.role = null; }
      if (next.status === 'ended') loadResult();
    }, error => { if (version !== connectionVersion) return; disconnect(); render(); notice(errorMessage(error)); }));
  } catch (error) { if (version !== connectionVersion) return; disconnect(); render(); notice(errorMessage(error)); }
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
$('#app').addEventListener('input', event => {
  if (event.target.id === 'name') savedName = event.target.value;
  if (event.target.id === 'code') { event.target.value = event.target.value.toUpperCase(); state.code = event.target.value; }
  if (event.target.closest('#rules-form')) {
    state.draft = { minutes: Number($('#minutes').value), voting: $('#voting').value, locations: $('#locations').value.split('\n') };
    $('#minutes-label').textContent = `${state.draft.minutes} min`;
  }
});
$('#app').addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'join-form') run(async () => { const code = $('#code').value.trim().toUpperCase(); const name = getName(); await callGame({ action: 'join', code, name }); await connect(code); });
  if (event.target.id === 'rules-form') run(async () => { const next = { minutes: Number($('#minutes').value), voting: $('#voting').value, locations: $('#locations').value.split('\n').map(l => l.trim()).filter(Boolean) }; await action('settings', { settings: next }); state.draft = null; notice('Game rules saved.'); });
});
$('#app').addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const type = button.dataset.action;
  if (type === 'refresh-result') return loadResult();
  if (type === 'create') return run(async () => { const { code } = await callGame({ action: 'create', name: getName() }); await connect(code); });
  if (type === 'players' || type === 'rules') { state.tab = type; render(); return; }
  if (type === 'reveal' || type === 'hide') { state.reveal = type === 'reveal'; render(); return; }
  if (type === 'home') { disconnect(); history.replaceState(null, '', '/'); state.code = ''; render(); return; }
  if (type === 'share') return run(async () => { try { await navigator.clipboard.writeText(inviteUrl()); notice('Invite link copied. Send it to your friends.'); } catch { notice(`Invite link: ${inviteUrl()}`); } });
  if (type === 'vote') { const player = state.room.players.find(p => p.id === button.dataset.target); return confirmAction(`Accuse ${player.name}?`, 'If enough players agree, the round ends immediately. A wrong accusation lets the spy win.', 'Cast my vote', () => action('vote', { target: player.id })); }
  if (type === 'guess') return confirmAction(`Guess ${button.dataset.location}?`, 'This is your only guess. Get it wrong and the other players win.', 'Lock in my guess', () => action('guess', { location: button.dataset.location }));
  if (type === 'remove') return confirmAction('Remove this player?', 'They can rejoin using the room code while the lobby is open.', 'Remove player', () => action('remove', { target: button.dataset.target }));
  if (type === 'leave') return run(async () => { await action('leave'); disconnect(); state.code = ''; history.replaceState(null, '', '/'); render(); });
  if (type === 'start' && state.draft) { notice('Save your game rules before starting.'); state.tab = 'rules'; render(); return; }
  if (['start', 'reset'].includes(type)) run(() => action(type));
});
function updateClock() {
  const r = state.room; if (r?.status !== 'active') return;
  const seconds = Math.max(0, Math.ceil((r.endsAt - Date.now() - state.clockOffset) / 1000));
  const timer = $('#timer');
  if (timer) { timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; timer.classList.toggle('urgent', seconds < 30); }
  const ring = $('.timer-ring'); if (ring) ring.style.setProperty('--progress', `${Math.max(0, Math.min(100, seconds / (r.settings.minutes * 60) * 100))}%`);
  if (seconds === 0 && navigator.onLine && !state.busy && Date.now() - state.expireAttempt > 5000) {
    state.expireAttempt = Date.now();
    action('expire').catch(error => notice(errorMessage(error)));
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && state.reveal) { state.reveal = false; render(); } else updateClock(); });
window.addEventListener('offline', () => notice('You’re offline. Your place is saved; reconnect to keep playing.'));
window.addEventListener('online', () => { notice('Back online.'); updateClock(); });
setInterval(updateClock, 1000);
render();
// Restore membership only for an existing identity; QR visitors first choose a name.
identity().then(async user => {
  state.uid = user.uid;
  if (state.code) {
    const snap = await getDoc(doc(db, 'rooms', state.code));
    if (snap.exists() && snap.data().memberIds.includes(user.uid)) connect(state.code);
  }
}).catch(() => {});
