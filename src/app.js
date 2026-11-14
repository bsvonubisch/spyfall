import './style.css';
import './game-table.css';
import QRCode from 'qrcode';
import { doc, onSnapshot, getDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import { onIdTokenChanged } from 'firebase/auth';
import { normalizeRoom, resolveResult, threshold, eligiblePlayers, requiredPlayers, MAX_PLAYERS, MAX_SPIES } from './game.js';
import { membershipState } from './room-view.js';
import { LOCATION_SETS, locationSetId } from './locations.js';
import { unlockSound, toggleSound, soundEnabled, playSpyWin, playTimeout, playVote, playVotingSoon } from './sound.js';
import { avatar, playerAvatar } from './avatars.js';
import { QUESTION_IDEAS } from './questions.js';
import { clockCue } from './round-clock.js';
import { bindDialogViewport } from './dialog.js';
import { settleRound, saveProfile, updateProfile } from './scores.js';
import { auth, db, identity, callGame } from './firebase.js';
import { googleAccount, adminAccount, connectGoogle, useGoogleAccount, returnToGuest, accountError } from './account.js';
import { googleProfile, syncGoogleProfile } from './google-profile.js';
import { loadAdminStats, watchLiveStats } from './admin.js';
import { startUsage, stopUsage, trackUsage, usageScreen } from './usage.js';

const $ = selector => document.querySelector(selector);
bindDialogViewport($('#confirm'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',check:'<path d="m5 12 4 4L19 6"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',exit:'<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h11"/>'})[name] || ''}</svg>`;
const state = { code: new URLSearchParams(location.search).get('room')?.toUpperCase() || '', room: null, role: null, uid: null, tab: 'players', reveal: false, busy: false, loading: false, draft: null, stops: [], clockOffset: 0 };
let savedName = '';
let ownProfile = null, accountChanging = false, adminStats = null;
let profileIdentity = '';
const accountIdentity = user => user ? `${user.uid}:${googleAccount(user)}` : '';
const googleLogo = '<img class="google-logo" src="/google-icon.svg" width="40" height="40" alt="" aria-hidden="true">';
let stopAdminLive = null;
$('#confirm').addEventListener('close', () => { stopAdminLive?.(); stopAdminLive = null; });
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
let confirmedVotes = null, voteSoundRound = null;
let clockRound = null, previousSeconds = null;
const settlements = new Map();
function saveScores() {
  const r = state.room, code = state.code;
  if (r?.status !== 'ended' || !r.roundKey) return Promise.resolve();
  if (!settlements.has(r.roundKey)) settlements.set(r.roundKey, settleRound(db, state.uid, code).catch(error => { settlements.delete(r.roundKey); throw error; }));
  return settlements.get(r.roundKey);
}
async function showLeaderboard(scope = state.room ? 'room' : 'overall') {
  trackUsage('leaderboard_opened');
  const dialog = $('#confirm'), code = state.code;
  const roomAvailable = Boolean(state.room);
  dialog.innerHTML = `<h2>Leaderboards</h2><div class="tabs score-tabs" role="tablist" aria-label="Leaderboard">${roomAvailable ? `<button role="tab" data-scope="room" aria-selected="${scope === 'room'}">This room</button>` : ''}<button role="tab" data-scope="overall" aria-selected="${scope === 'overall'}">Overall</button></div><div id="scores-content" aria-live="polite"><p>Loading standings…</p></div><button class="button quiet full" id="close-scores">Close</button>`;
  if (!dialog.open) dialog.showModal();
  $('#close-scores').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-scope]').forEach(button => { button.onclick = () => showLeaderboard(button.dataset.scope); });
  const content = $('#scores-content');
  try {
    const user = await identity();
    await saveScores();
    const path = scope === 'room' ? ['rooms', code, 'scores'] : ['profiles'];
    const [snapshot, own] = await Promise.all([getDocs(query(collection(db, ...path), orderBy('wins', 'desc'), limit(25))), getDoc(doc(db, ...path, user.uid))]);
    if (!dialog.open || $('#scores-content') !== content) return;
    const entries = snapshot.docs.map(doc => doc.data()).filter(player => player.gamesPlayed > 0);
    if (scope === 'room') await Promise.all(entries.map(async player => {
      const profile = await getDoc(doc(db, 'profiles', player.id));
      if (profile.exists()) { player.avatarSeed = profile.data().avatarSeed || player.id; player.avatarUrl = profile.data().avatarUrl || ''; }
    }));
    if (!dialog.open || $('#scores-content') !== content) return;
    let rank = 0;
    const row = (p, position) => `<div class="score-row ${p.id === user.uid ? 'your-score' : ''}"><span class="score-rank">${position}</span><span class="avatar portrait">${playerAvatar(p)}</span><span class="score-name">${esc(scope === 'room' ? state.room?.players.find(player => player.id === p.id)?.name || p.name : p.name)}${p.id === user.uid ? ' <small>(you)</small>' : ''}<small>${p.gamesPlayed} ${p.gamesPlayed === 1 ? 'round' : 'rounds'} · ${Math.round(p.wins / p.gamesPlayed * 100)}% wins</small></span><strong>${p.wins}<small>${p.wins === 1 ? 'point' : 'points'}</small></strong></div>`;
    content.innerHTML = `<p class="score-explainer">1 point per team win. Every completed round counts.</p>${entries.length ? `<div class="score-list">${entries.map((p, i) => { if (!i || p.wins !== entries[i - 1].wins) rank = i + 1; return row(p, rank); }).join('')}</div>` : '<p class="score-empty">No scores yet. Finish a round to get on the board.</p>'}${own.exists() && own.data().gamesPlayed && !entries.some(p => p.id === user.uid) ? `<p class="fineprint">Your total</p>${row(own.data(), '—')}` : ''}<p class="fineprint score-identity">${scope === 'overall' ? 'Top 25 players. ' : ''}${googleAccount(user) ? 'Your profile follows your Google account.' : 'Your guest profile belongs to this browser. Connect Google from your profile to keep it across devices.'}</p>`;
  } catch (error) {
    if ($('#scores-content') === content) content.innerHTML = `<p>${esc(errorMessage(error))}</p><button class="button secondary full" id="retry-scores">Try again</button>`;
    $('#retry-scores')?.addEventListener('click', () => showLeaderboard(scope));
  }
}
const inRound = r => ['active', 'accusing'].includes(r?.status);
const spyLabel = count => `${count} ${count === 1 ? 'spy' : 'spies'}`;
try { savedName = localStorage.getItem('spyfall-name') || ''; } catch {}

function rememberName(name) {
  savedName = name;
  try { localStorage.setItem('spyfall-name', name); } catch {}
}
async function refreshProfile(user, { forceGoogle = false } = {}) {
  const expectedIdentity = accountIdentity(user);
  const profile = googleAccount(user)
    ? await syncGoogleProfile(db, user, { force: forceGoogle, code: state.code })
    : (await getDoc(doc(db, 'profiles', user.uid))).data();
  if (accountIdentity(auth.currentUser) !== expectedIdentity) return;
  ownProfile = profile || null;
  profileIdentity = accountIdentity(user);
  if (ownProfile) rememberName(ownProfile.name);
  else if (googleAccount(user)) rememberName(googleProfile(user).name);
}
function canChangeAccount() { return !state.room || state.room.status === 'lobby'; }
async function completeGoogleSession(user) {
  if (state.uid !== user.uid) { disconnect(); state.code = ''; history.replaceState(null, '', '/'); }
  state.uid = user.uid;
  startUsage(user.uid);
  await refreshProfile(user, { forceGoogle: true });
  render();
  trackUsage('google_signin');
}
async function signInGoogle(source = 'account') {
  if (accountChanging || state.busy) return;
  if (!auth.currentUser) { notice('Your guest profile is still connecting. Try again in a moment.'); return; }
  if (!canChangeAccount()) { notice('Return to the lobby before connecting a Google account.'); return; }
  accountChanging = true;
  state.busy = true;
  const request = connectGoogle();
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    const result = await request;
    if (result.credential) {
      const dialog = $('#confirm');
      dialog.innerHTML = '<h2>Use your saved Google profile?</h2><p>This account already has a profile. Switching will leave this room. Your guest scores and saved locations stay with the guest profile; they will not be merged.</p><button class="button primary full" id="switch-account">Use Google profile</button><button class="button quiet full" id="keep-guest">Keep playing as guest</button>';
      if (!dialog.open) dialog.showModal();
      $('#keep-guest').onclick = () => dialog.close();
      $('#switch-account').onclick = () => {
        dialog.close();
        run(async () => {
          accountChanging = true;
          try {
            if (state.room) await action('leave');
            stopUsage(); disconnect(); state.code = ''; history.replaceState(null, '', '/');
            await completeGoogleSession(await useGoogleAccount(result.credential));
            if (source !== 'home') showAccount();
            else notice('Google connected. Your profile is ready.');
          } finally { accountChanging = false; }
        });
      };
      return;
    }
    await completeGoogleSession(result.user);
    if (source === 'profile') showProfileEditor();
    else if (source !== 'home') showAccount();
    else notice('Google connected. Your profile is ready.');
  } catch (error) { notice(error.code?.startsWith('auth/') ? accountError(error) : errorMessage(error)); if (source !== 'home') showAccount(); }
  finally { accountChanging = false; state.busy = false; render(); $('#confirm').querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
function showAccount() {
  if (adminAccount(auth.currentUser)) return showAdmin();
  concealRole();
  const user = auth.currentUser, connected = googleAccount(user), editable = canChangeAccount(), dialog = $('#confirm');
  dialog.innerHTML = `<span class="eyebrow">YOUR ACCOUNT</span><h2>${connected ? 'Welcome back.' : 'Keep your identity.'}</h2><p>${connected ? `Signed in as ${esc(user.email)}. Your profile and saved locations follow your Google account.` : 'Guest play stays free and needs no account. Connect Google to keep your profile, scores, and saved locations across devices.'}</p>${connected ? `<button class="button secondary full" id="account-profile" ${!editable ? 'disabled' : ''}>Edit profile</button><button class="button quiet full" id="account-signout" ${!editable ? 'disabled' : ''}>Sign out</button>` : `<button class="button google-signin full" data-login-google ${!editable ? 'disabled' : ''}>${googleLogo} Continue with Google</button>`}${!editable ? '<p class="fineprint">Return to the lobby to change your account or profile.</p>' : ''}<button class="button quiet full" id="close-account">${connected ? 'Close' : 'Keep playing as guest'}</button>`;
  if (!dialog.open) dialog.showModal();
  $('#close-account').onclick = () => dialog.close();
  $('[data-login-google]')?.addEventListener('click', () => signInGoogle());
  $('#account-profile')?.addEventListener('click', showProfileEditor);
  $('#account-signout')?.addEventListener('click', signOutAccount);
}
function signOutAccount() {
  if (!canChangeAccount()) return notice('Return to the lobby before signing out.');
  $('#confirm').close();
  confirmAction('Sign out?', state.room ? 'You will leave this room and continue as a new guest. Your Google profile, scores, and saved locations remain saved.' : 'You will continue as a new guest. Your Google profile, scores, and saved locations remain saved.', 'Sign out', async () => {
    accountChanging = true;
    try {
      if (state.room) await action('leave');
      disconnect(); state.code = ''; history.replaceState(null, '', '/');
      stopUsage(); state.uid = (await returnToGuest()).uid; startUsage(state.uid);
      ownProfile = null; adminStats = null; rememberName('');
    } finally { accountChanging = false; }
  });
}
async function showAdmin(force = false) {
  if (!adminAccount(auth.currentUser)) return showAccount();
  concealRole();
  const dialog = $('#confirm'), user = auth.currentUser;
  stopAdminLive?.();
  dialog.innerHTML = '<div class="section-heading"><span class="eyebrow">ADMIN AREA</span><button class="text-button" id="refresh-admin">Refresh</button></div><h2>The whole game.</h2><div id="admin-live" class="admin-live" aria-live="polite">Connecting to live activity…</div><p class="fineprint">Live means a visible app checked in during the last 3 minutes. Multiple tabs count as one player.</p><div id="admin-content" aria-live="polite"><p>Loading game stats…</p></div><button class="button primary full" id="close-admin">Back to game</button><button class="button quiet full" id="admin-signout">Sign out</button>';
  if (!dialog.open) dialog.showModal();
  const content = $('#admin-content');
  $('#close-admin').onclick = () => dialog.close();
  $('#refresh-admin').onclick = () => showAdmin(true);
  $('#admin-signout').onclick = signOutAccount;
  $('#admin-signout').disabled = !canChangeAccount();
  stopAdminLive = watchLiveStats(db, live => {
    if (!dialog.open || !$('#admin-live')) return;
    $('#admin-live').innerHTML = `<span class="dot"></span><span><strong>${live.users}${live.capped ? '+' : ''}</strong> live players</span><span><strong>${live.rooms}${live.capped ? '+' : ''}</strong> live rooms</span>`;
  }, () => { if ($('#admin-live')) $('#admin-live').textContent = 'Live activity is unavailable. Refresh to retry.'; });
  try {
    if (force || !adminStats || Date.now() - adminStats.loadedAt > 60000) {
      await user.getIdToken(true);
      adminStats = await loadAdminStats(db);
    }
    if (!dialog.open || $('#admin-content') !== content || auth.currentUser?.uid !== user.uid) return;
    const stats = adminStats;
    const metric = (label, value) => `<div class="admin-metric"><strong>${Number(value).toLocaleString()}</strong><span>${label}</span></div>`;
    const status = room => Date.now() - room.createdAt.toMillis() > 86400000 ? 'Expired' : ({lobby:'Lobby',active:'Playing',accusing:'Voting',ended:'Finished'})[room.status] || room.status;
    content.innerHTML = `<div class="admin-metrics">${metric('Player profiles', stats.players)}${metric('Completed rounds', stats.rounds)}${metric('Rounds · last 7 days', stats.weekly)}${metric('Recent rooms · 24 hours', stats.dailyRooms)}</div><p class="fineprint">Profiles include guests. Completed rounds come from saved results. Room counts exclude rooms deleted when the last player leaves.</p><h3>Recent rooms</h3><div class="admin-rooms">${stats.rooms.length ? stats.rooms.map(room => `<div class="admin-room"><strong>${esc(room.code)}</strong><span>${room.memberIds.length} players · ${esc(status(room))}</span><small>${room.createdAt.toDate().toLocaleDateString()}</small></div>`).join('') : '<p>No rooms yet.</p>'}</div><h3>Most active players</h3>${stats.leaders.length ? stats.leaders.map(player => `<div class="score-row"><span class="avatar portrait">${playerAvatar(player)}</span><span class="score-name">${esc(player.name)}<small>${player.gamesPlayed} rounds · ${player.wins} wins</small></span></div>`).join('') : '<p>No completed rounds yet.</p>'}<p class="fineprint">Updated ${new Date(stats.loadedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}. Latest 12 rooms and top 5 players.</p>`;
    const peak = Math.max(1, ...stats.days.map(day => day.count));
    content.insertAdjacentHTML('beforeend', `<h3>Activity · last 7 days</h3><div class="usage-chart" role="img" aria-label="Daily usage event counts">${stats.days.map(day => `<div class="usage-day"><strong>${day.count}</strong><i style="height:${Math.round(day.count / peak * 70)}px"></i><span>${new Date(day.date).toLocaleDateString([], {weekday:'short'})}</span></div>`).join('')}</div><h3>Usage totals</h3>${stats.usage.map(item => `<div class="usage-row"><span>${item.label}</span><strong>${item.count.toLocaleString()}</strong></div>`).join('')}<p class="fineprint">Usage events are recorded from this update onward. Recoverable room creations are backfilled; earlier visits, votes, and guesses were not recorded. Secret roles and answers are never included.</p>`);
  } catch (error) {
    if ($('#admin-content') === content) content.innerHTML = `<p>${esc(errorMessage(error))}</p><p class="fineprint">Admin access requires the verified owner’s Google account.</p>`;
  }
}
function showProfileEditor() {
  if (!canChangeAccount()) return notice('Profiles can be changed in the lobby.');
  const user = auth.currentUser;
  if (!user) return showAccount();
  const dialog = $('#confirm'), player = ownProfile || state.room?.players.find(p => p.id === state.uid) || { id: user.uid, name: savedName || 'Agent' };
  const connected = googleAccount(user);
  let avatarSeed = player.avatarSeed || player.id, avatarUrl = connected ? googleProfile(user, player).avatarUrl : player.avatarUrl || '';
  dialog.innerHTML = `<form id="rename-form"><h2>Your agent profile</h2><div class="avatar-editor"><span class="avatar portrait" id="profile-avatar">${playerAvatar({ ...player, avatarSeed, avatarUrl })}</span>${connected ? '<span class="fineprint">Google profile photo</span>' : '<button type="button" class="button secondary" id="regenerate-avatar">New avatar</button>'}</div><label for="player-name">NAME</label><input id="player-name" maxlength="20" required autocomplete="nickname" value="${esc(player.name)}">${connected ? `<p class="account-identity">Connected to ${esc(user.email)}</p>` : `<button type="button" class="button google-signin full profile-google" data-login-google>${googleLogo} Connect Google</button><p class="fineprint">Use your Google name and photo, and keep your profile across devices.</p>`}<button class="button primary full name-save" type="submit">Save profile ${icon('check')}</button><button class="button quiet full" type="button" id="cancel-name">Cancel</button></form>`;
  if (!dialog.open) dialog.showModal();
  $('#regenerate-avatar')?.addEventListener('click', () => { avatarSeed = crypto.randomUUID(); avatarUrl = ''; $('#profile-avatar').innerHTML = avatar(avatarSeed); });
  $('[data-login-google]')?.addEventListener('click', () => signInGoogle('profile'));
  $('#cancel-name').onclick = () => dialog.close();
  $('#rename-form').onsubmit = event => {
    event.preventDefault();
    const name = $('#player-name').value.trim();
    if (!name) { $('#player-name').focus(); return; }
    dialog.close();
    run(async () => {
      if (state.room) await action('rename', { name, avatarSeed, avatarUrl });
      else await updateProfile(db, user.uid, { name, avatarSeed, avatarUrl });
      rememberName(name); await refreshProfile(user); trackUsage('profile_saved'); notice('Profile saved.');
    });
  };
}

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
  return `<header class="floating-nav ${active ? 'in-round' : ''}">
    <a class="brand" href="/" aria-label="Spyfall home"><img class="brand-wordmark" src="/wordmark.svg" alt="" width="112" height="38"><img class="brand-mini" src="/favicon.svg" alt="" width="34" height="34"></a>
    ${r ? `<span class="room-tag" aria-label="Room ${esc(state.code)}" title="Room code">${esc(state.code)}</span>` : ''}
    <nav class="nav-actions" aria-label="${r ? 'Room' : 'Game'} controls">
      ${active ? '<div class="nav-timer"><span id="timer" aria-label="Suggested time remaining">--:--</span></div>' : ''}
      <button type="button" class="nav-icon sound-control" data-action="sound" aria-label="Sound" aria-pressed="${soundEnabled()}" title="${soundEnabled() ? 'Mute sound' : 'Enable sound'}">${soundIcon()}</button>
      ${active && r.hostId === state.uid ? '<button type="button" class="nav-icon nav-stop" data-action="end-round" aria-label="Round controls" title="Round controls"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"/></svg></button>' : ''}
      ${r ? `<button type="button" class="nav-icon nav-exit" data-action="exit-room" aria-label="Exit room" title="Exit room">${icon('exit', 20)}</button>` : ''}
    </nav>
  </header>`;
}
function soundIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 4-5 4H3v8h3l5 4Z"/>${soundEnabled() ? '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>' : '<path d="m16 9 6 6m0-6-6 6"/>'}</svg>`;
}
function shell(content) {
  const screen = `${state.code}:${inRound(state.room) ? 'round' : state.room?.status || 'home'}:${state.room?.roundId || 0}:${state.room?.status === 'lobby' ? state.tab : ''}`;
  const entered = lastScreen !== screen;
  const usageView = state.room ? (inRound(state.room) ? 'round' : state.room.status === 'ended' ? 'result' : 'lobby') : state.loading ? 'loading' : 'home';
  usageScreen(usageView, state.room ? state.code : '');
  if (entered) trackUsage('screen_view', { screen: usageView, roundId: state.room?.roundId || 0 });
  $('#app').innerHTML = `<div class="shell game-table">${header()}<main class="${entered ? 'screen-enter' : ''}">${content}</main><footer><button type="button" class="footer-credit" data-action="account" aria-label="${adminAccount(auth.currentUser) ? 'Open admin area' : 'Open account and sign in'}">made with <span class="footer-heart" role="img" aria-label="love">♥</span> by vonUbisch</button></footer></div>`;
  document.querySelectorAll('[data-player-id]').forEach((row, index) => {
    if (entered || !lastPlayerIds.includes(row.dataset.playerId)) { row.classList.add('player-enter'); row.style.setProperty('--arrival', `${Math.min(index, 5) * 45}ms`); }
    if (!entered && row.dataset.vote !== lastVotes[row.dataset.playerId]) row.querySelector('.player-meta')?.classList.add('vote-updated');
  });
  lastScreen = screen;
  lastPlayerIds = state.room?.memberIds || [];
  lastVotes = Object.fromEntries([...document.querySelectorAll('[data-player-id]')].map(row => [row.dataset.playerId, row.dataset.vote]));
  if (state.busy) $('#app').querySelectorAll('button').forEach(button => { button.disabled = true; });
  updateClock();
  if (focusPlayers && !state.busy) { focusPlayers = false; const tab = $('[data-action="players"]'); tab?.focus({ preventScroll: true }); tab?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
}
function homeAccount() {
  const user = auth.currentUser;
  if (googleAccount(user)) {
    const profile = ownProfile || googleProfile(user);
    return `<button class="input-account connected" type="button" data-action="rename" aria-label="Edit your Google profile" title="Connected with Google · Edit profile"><span class="avatar portrait">${playerAvatar(profile)}</span></button>`;
  }
  return `<button class="input-account" type="button" data-action="google" aria-label="Continue with Google" title="Continue with Google">${googleLogo}</button>`;
}
function home() {
  shell(`<section class="hero"><div class="eyebrow"><span class="dot"></span> SAME ROOM. SEPARATE PHONES.</div><h1>Good friends.<br><em>Great liars.</em></h1><p>One secret location. Spies in your midst.<br>Find out who’s hiding in plain sight.</p><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="agent agent-one">${icon('eye', 44)}</div><div class="agent agent-two">${icon('eye', 44)}</div><div class="agent agent-three">?</div><span class="art-note">trust no one.</span><span class="spark">✳</span></div><div class="facts"><span>${icon('users', 16)}2–15 players</span><span>${icon('clock', 16)}2–20 minutes</span><span>1–3 spies.</span></div></section><section class="panel entry"><label for="name">WHAT SHOULD WE CALL YOU?</label><div class="name-field"><input id="name" maxlength="20" autocomplete="nickname" placeholder="Your name" value="${esc(savedName)}">${homeAccount()}</div><button class="button primary" data-action="create">Create a room ${icon('plus')}</button><div class="divider"><span>or join your friends</span></div><form id="join-form"><label class="sr-only" for="code">Room code</label><div class="join-row"><input id="code" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ROOM CODE" value="${esc(state.code)}" required pattern="[A-Za-z2-9]{6}"><button class="button secondary" type="submit">Join ${icon('arrow')}</button></div></form><p class="fineprint">Got a QR code? Scan it with your phone’s camera.</p></section><button class="text-button leaderboard-link" data-action="scores">View overall leaderboard</button><section class="how"><div class="section-heading"><h2>A quick briefing</h2><span>01—03</span></div><div class="step"><span>01</span><div><h3>Get your secret</h3><p>Everyone learns the location. Except the spies.</p></div></div><div class="step"><span>02</span><div><h3>Ask. Answer. Act natural.</h3><p>Question each other out loud. Be specific enough to fit in, vague enough to keep the secret.</p></div></div><div class="step"><span>03</span><div><h3>Make your move</h3><p>Vote out the spy, or guess the location if you are one. Watch the clock.</p></div></div></section>`);
}
function playerList(voting = false) {
  const r = state.room;
  return r.players.map(p => {
    const count = Object.values(r.votes || {}).filter(id => id === p.id).length;
    const caught = r.caughtIds.includes(p.id), canVote = r.status === 'active' && !r.caughtIds.includes(state.uid);
    const selected = r.votes[state.uid] === p.id;
    return `<div class="player ${caught ? 'caught-player' : ''} ${selected && voting ? 'vote-selected' : ''}" data-player-id="${esc(p.id)}" data-vote="${count}"><span class="avatar portrait">${playerAvatar(p)}</span><div class="player-name">${esc(p.name)}${p.id === state.uid ? ' <small>(you)</small>' : ''}<span class="player-meta">${caught ? 'Spy caught' : voting ? `${count} ${count === 1 ? 'vote' : 'votes'}${selected ? ' · yours' : ''}` : p.id === r.hostId ? 'Host' : 'Ready'}</span></div>${voting ? (caught ? '<span class="caught-badge">Caught</span>' : p.id !== state.uid ? `<button class="vote-button ${selected ? 'selected' : ''}" data-action="vote" data-target="${esc(p.id)}" aria-label="Vote for ${esc(p.name)}" aria-pressed="${selected}" ${!canVote ? 'disabled' : ''}>${selected ? icon('check', 16) : '<span class="sr-only">Vote</span>'}</button>` : '') : p.id === state.uid ? '<button class="text-button profile-action" data-action="rename">Edit profile</button>' : state.uid === r.hostId ? `<button class="icon-button remove" data-action="remove" data-target="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button>` : ''}</div>`;
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
    <label for="minutes">ROUND LENGTH <output id="minutes-label">${d.minutes} min</output></label><input type="range" id="minutes" min="2" max="20" step="1" value="${d.minutes}" aria-valuetext="${d.minutes} minutes" style="--range-progress: ${(d.minutes - 2) / 18 * 100}%"><p class="fineprint">Choose between 2 and 20 minutes.</p>
    <label for="voting">VOTING RULE</label><select id="voting"><option value="majority" ${d.voting === 'majority' ? 'selected' : ''}>Majority wins</option><option value="unanimous" ${d.voting === 'unanimous' ? 'selected' : ''}>Everyone except the accused</option></select>
    <label for="spies">NUMBER OF SPIES</label><select id="spies">${Array.from({ length: MAX_SPIES }, (_, i) => `<option value="${i + 1}" ${d.spies === i + 1 ? 'selected' : ''}>${spyLabel(i + 1)} · ${requiredPlayers(i + 1)}+ players</option>`).join('')}</select><p class="fineprint">Catch every spy to win. Caught spies sit out.</p>
    <label for="location-set">LOCATION SET</label><select id="location-set">${LOCATION_SETS.map(set => `<option value="${set.id}" ${locationSetId(d.locations) === set.id ? 'selected' : ''}>${set.name}</option>`).join('')}${locationSetId(d.locations) === 'custom' ? '<option value="custom" selected>Custom selection</option>' : ''}</select><p class="fineprint">Choosing a set replaces the list below. Add, edit, or remove locations to make it your own.</p>
    <div class="location-editor-heading">POSSIBLE LOCATIONS <span>${d.locations.length}/40 · minimum 3</span></div>
    <div class="location-editor">${d.locations.map((location, i) => `<div class="location-row"><input class="location-input" aria-label="Location ${i + 1}" maxlength="40" value="${esc(location)}" required><button type="button" class="remove-location" data-action="remove-location" data-index="${i}" aria-label="Remove ${esc(location)}" ${d.locations.length <= 3 ? 'disabled' : ''}>×</button></div>`).join('')}</div>
    <label for="new-location">ADD A LOCATION</label><div class="add-location-row"><input id="new-location" maxlength="40" placeholder="e.g. Ski resort"><button type="button" class="button outline" data-action="add-location" ${d.locations.length >= 40 ? 'disabled' : ''}>Add ${icon('plus', 16)}</button></div>
    <p class="fineprint">Everyone can see this list. Only non-spies see the chosen location. Save your changes before starting. This list is saved to your profile for future rooms.</p><button class="button secondary full" type="submit">Save rules ${icon('check')}</button>
  </form>` : `<dl class="rule-summary"><div><dt>Round length</dt><dd>${r.settings.minutes} minutes</dd></div><div><dt>Spies</dt><dd>${r.settings.spies}</dd></div><div><dt>Voting</dt><dd>${r.settings.voting === 'majority' ? 'Majority' : 'All except accused'}</dd></div></dl><div class="location-chips">${r.settings.locations.map(l => `<span>${esc(l)}</span>`).join('')}</div>`}</section>`;
}
function lobbySettings() {
  return state.room.hostId === state.uid ? state.draft || state.room.settings : state.room.settings;
}
function updateLobbyReadiness() {
  if (state.room?.status !== 'lobby') return;
  const spies = lobbySettings().spies, needed = requiredPlayers(spies) - state.room.players.length;
  const waiting = $('#lobby-waiting');
  if (waiting) {
    waiting.hidden = needed <= 0;
    waiting.textContent = needed > 0 ? `Waiting for ${needed} more ${needed === 1 ? 'player' : 'players'} for ${spyLabel(spies)}…` : '';
  }
  const start = $('[data-action="start"]');
  if (start) start.disabled = state.busy || needed > 0;
}
function lobby() {
  const r = state.room, host = r.hostId === state.uid;
  const settings = lobbySettings();
  shell(`<div class="lobby-intro"><span class="eyebrow">THE LOBBY</span><h1>The usual suspects.</h1><p>${host ? 'Scan the code. Take your place.' : 'You’re in. Your host will start the round.'}<br>Best played with 4 or more people.</p></div>
    <section class="invite panel" aria-label="Invite friends"><div><label>INVITE YOUR FRIENDS</label><strong class="room-code">${esc(state.code)}</strong><button class="text-button" data-action="share">${icon('copy', 16)} Copy invite link</button></div><canvas id="qr" aria-label="Scan to join this room" role="img"></canvas></section>
    <div class="tabs lobby-tabs" role="tablist" aria-label="Lobby sections"><button role="tab" aria-selected="${state.tab === 'players'}" data-action="players">Players <span>${r.players.length}/${MAX_PLAYERS}</span></button><button role="tab" aria-selected="${state.tab === 'rules'}" data-action="rules">Game rules ${icon('clock', 16)}</button></div>
    ${state.tab === 'players' ? `<section class="roster player-grid lobby-roster" aria-label="Players">${playerList()}</section><div class="round-summary">${icon('clock', 16)} ${settings.minutes} min <span>·</span> ${settings.locations.length} locations <span>·</span> ${spyLabel(settings.spies)}${host && state.draft ? '<span>· Unsaved changes</span>' : ''}</div>` : rules()}
    <p class="waiting" id="lobby-waiting" aria-live="polite" hidden></p>
    <div class="bottom-action">${host ? `<button class="button primary full" data-action="start" disabled>Start the game ${icon('arrow')}</button>` : `<div class="waiting-host"><span class="pulse"></span> Waiting for the host to start</div>`}</div><button class="text-button leaderboard-link" data-action="scores">Leaderboards</button>`);
  updateLobbyReadiness();
  QRCode.toCanvas($('#qr'), inviteUrl(), { width: 256, margin: 4, color: { dark: '#10213c', light: '#ffffff' } }).catch(() => notice('QR code unavailable. You can still share the invite link.'));
}
function active() {
  const r = state.room, role = state.role?.roundId === r.roundId ? state.role : null;
  const spy = role?.isSpy;
  const locations = `<section class="locations-detail" aria-labelledby="locations-heading">
    <div class="section-heading"><h2 id="locations-heading">Possible locations</h2><span>${r.settings.locations.length} ${icon('pin', 16)}</span></div>
    <p class="fineprint">Your shared shortlist. Spies can tap a place to guess.</p>
    <div class="location-chips guess-grid">${r.settings.locations.map(l => `<button data-action="guess" data-location="${esc(l)}" aria-label="Guess ${esc(l)}" ${r.status === 'accusing' || r.caughtIds.includes(state.uid) ? 'disabled' : ''}>${esc(l)}</button>`).join('')}</div>
  </section>`;
  shell(`<div class="round-context"><span>ROUND ${String(r.roundId).padStart(2, '0')} · ${spyLabel(r.settings.spies).toUpperCase()}</span>${r.settings.spies > 1 ? `<span>${r.caughtIds.length}/${r.settings.spies} caught</span>` : ''}</div><h1 class="round-title">Trust your instincts.</h1>
    ${r.status === 'accusing' ? '<p class="round-status" role="status"><span class="pulse"></span> Checking the accusation…</p>' : ''}
    ${r.caughtIds.includes(state.uid) ? '<p class="round-status">You’ve been caught. Watch the remaining players finish the round.</p>' : ''}
    <section class="role-card ${state.reveal && spy ? 'spy-card' : ''}" id="role-card"><button class="hold-reveal role-trigger" id="reveal-role" type="button" aria-label="Hold to reveal your role" aria-pressed="${state.reveal}" aria-describedby="reveal-help" ${!role ? 'disabled' : ''}><span id="role-content">${roleContent(role)}</span><span class="role-control">${icon('eye', 24)}</span></button><span id="reveal-help" class="sr-only">Release to hide. Keyboard: hold Space or Enter.</span></section>
    <p id="timer-guidance" class="round-status timer-guidance" role="status" hidden></p>
    <div class="section-heading section-space"><h2>Who’s the spy?</h2><span>${Object.keys(r.votes).length}/${eligiblePlayers(r).length} VOTED</span></div>
    <p class="section-description">Tap a player to vote. ${threshold(r)} ${threshold(r) === 1 ? 'vote confirms' : 'votes confirm'} an accusation.${r.settings.spies > 1 ? ' Catch every spy to win.' : ''}</p>
    <section class="roster player-grid voting-roster" aria-label="Vote for a player">${playerList(true)}</section>
    <p class="fineprint centered vote-help">You can change your vote until an accusation passes.</p>
    ${locations}
    <section class="question-ideas" aria-label="Question ideas"><div><span class="eyebrow">ASK AROUND</span><p id="question-text" aria-live="polite">${QUESTION_IDEAS[questionIndex % QUESTION_IDEAS.length]}</p></div><button class="nav-icon" data-action="more-questions" aria-label="Next question idea">${icon('arrow', 20)}</button></section>`);
}
function ended() {
  const r = state.room, result = r.result;
  if (!result?.winner) return shell('<div class="loading"><span class="pulse"></span><h2>Opening the case file…</h2><button class="text-button" data-action="refresh-result">Try again</button></div>');
  const spies = r.players.filter(p => result.spyIds.includes(p.id)), multiple = spies.length > 1;
  const spy = r.players.find(p => p.id === result.guesserId) || spies[0];
  const accused = r.players.find(p => p.id === result.accusedId);
  const reason = result.reason === 'host' ? 'The host ended the round with spies still in play.' : result.reason === 'timeout' ? 'Time ran out before all spies were caught.' : result.reason === 'guess' ? `${spy?.name} guessed “${result.guess}”. ${result.winner === 'spy' ? 'Right on the mark.' : 'The secret stayed safe.'}` : `${accused?.name} was accused. ${result.winner === 'players' ? 'Every spy has been caught.' : 'An innocent player. The spies win.'}`;
  shell(`<div class="eyebrow page-label"><span class="dot"></span> ROUND ${r.roundId} COMPLETE</div><div class="result-art">${icon('eye', 80)}<span>CASE CLOSED</span></div><h1 class="page-title result-title">${result.winner === 'spy' ? `${multiple ? 'The spies' : 'The spy'}<br><em>got away.</em>` : 'Cover<br><em>blown.</em>'}</h1><p class="subtitle">${result.winner === 'spy' ? `${multiple ? 'The spies win' : 'The spy wins'} this round.` : 'The group wins this round.'}</p><section class="panel result-panel"><label>${multiple ? 'THE SPIES WERE' : 'THE SPY WAS'}</label><h2>${spies.map(p => `<span class="named-player"><span class="avatar portrait">${playerAvatar(p)}</span>${esc(p.name)}</span>`).join('')}</h2><div class="result-location">${icon('pin')}<div><label>THE SECRET LOCATION</label><strong>${esc(result.location)}</strong></div></div><p class="result-reason">${(result.reason === 'vote' ? accused : result.reason === 'guess' ? spy : null) ? `<span class="avatar portrait">${playerAvatar(result.reason === 'vote' ? accused : spy)}</span>` : ''}<span>${esc(reason)}</span></p></section><div class="bottom-action">${state.uid === r.hostId ? `<button class="button primary full" data-action="reset">Back to lobby ${icon('arrow')}</button>` : '<div class="waiting-host"><span class="pulse"></span> Waiting for the host’s next round</div>'}<button class="text-button leaderboard-link" data-action="scores">Leaderboards</button><p class="fineprint centered">Same friends. A new secret.</p></div>`);
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
function disconnect() { clockRound = null; previousSeconds = null; confirmedVotes = null; voteSoundRound = null; connectionVersion++; state.stops.forEach(stop => stop()); state.stops = []; stopRole?.(); stopRole = null; state.room = null; state.role = null; state.loading = false; state.draft = null; state.reveal = false; }
async function loadResult() {
  const roundId = state.room?.roundId, code = state.code;
  try {
    const secret = (await getDoc(doc(db, 'rooms', code, 'secrets', 'current'))).data();
    if (state.code === code && state.room?.roundId === roundId && state.room.status === 'ended' && secret?.roundId === roundId) {
      state.room.result = resolveResult(state.room.result, secret);
      if (pendingWinSound === `${code}:${roundId}`) {
        pendingWinSound = null;
        if (state.room.result.reason === 'guess' && state.room.result.winner === 'spy') playSpyWin();
        else playTimeout();
      }
      render();
      void saveScores().catch(() => notice('Scores haven’t synced yet. Open Leaderboards to retry.'));
    }
  } catch (error) { notice(errorMessage(error)); }
}
async function connect(code) {
  disconnect(); state.tab = 'players'; state.code = code; state.loading = true; render();
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
      if (!snap.metadata.hasPendingWrites && !snap.metadata.fromCache) {
        const key = `${code}:${next.roundId}`;
        if (voteSoundRound === key && confirmedVotes && Object.entries(next.votes).some(([id, target]) => target !== confirmedVotes[id])) playVote();
        confirmedVotes = { ...next.votes }; voteSoundRound = key;
      }
      if (next.status === 'lobby' && inRound(state.room)) notice('Round stopped. You’re back in the lobby.');
      if (next.status === 'ended' && inRound(state.room) && next.roundId === state.room.roundId) pendingWinSound = `${code}:${next.roundId}`;
      if (next.caughtIds.length > (state.room?.caughtIds.length || 0)) notice('A spy was caught. Votes reset—keep looking for the others.');
      if (next.roundId !== state.room?.roundId || next.status !== state.room?.status) { state.reveal = false; $('#confirm').close(); }
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
function confirmAction(title, text, label, task, player = null) {
  const dialog = $('#confirm');
  dialog.innerHTML = `<form method="dialog"><span class="eyebrow">MAKE YOUR MOVE</span><h2>${esc(title)}</h2>${player ? `<div class="named-player"><span class="avatar portrait">${playerAvatar(player)}</span><strong>${esc(player.name)}</strong></div>` : ''}<p>${esc(text)}</p><button class="button primary full" id="confirm-action" type="button">${esc(label)}</button><button class="button quiet full" value="cancel">Not yet</button></form>`;
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
async function action(type, extra = {}) {
  const context = { roomCode: state.code, roundId: state.room?.roundId || 0 };
  const result = await callGame({ action: type, code: state.code, roundId: context.roundId, ...extra });
  const event = { start: 'round_started', vote: 'vote_cast', guess: 'guess_submitted', end: 'round_ended', stop: 'round_cancelled', leave: 'room_left', settings: 'rules_saved' }[type];
  if (event) trackUsage(event, { ...context, roundId: context.roundId + (type === 'start' ? 1 : 0) });
  return result;
}
function getName() { const name = $('#name')?.value.trim(); if (!name) throw new Error('Enter your name first.'); savedName = name; try { localStorage.setItem('spyfall-name', name); } catch {} return name; }
function roleContent(role) {
  if (!role) return '<strong class="role-title">Retrieving your role…</strong><span class="role-note">Your secret briefing is on its way.</span>';
  if (!state.reveal) return '<strong class="role-title">For your eyes only.</strong><span class="role-note">Hold to reveal · release to hide</span>';
  return `<span class="role-label">${role.isSpy ? 'YOUR MISSION' : 'YOU ARE NOT THE SPY'}</span><strong class="role-title">${role.isSpy ? 'You’re the spy.' : esc(role.location)}</strong><span class="role-note">${role.isSpy ? 'Blend in. Guess the location.' : 'Keep this location secret.'}</span>`;
}
function concealRole() {
  heldPointer = null; heldKey = null;
  setRoleRevealed(false);
}
function setRoleRevealed(reveal) {
  const wasRevealed = state.reveal;
  state.reveal = Boolean(reveal && inRound(state.room) && state.role?.roundId === state.room.roundId);
  if (state.reveal && !wasRevealed) trackUsage('role_revealed', { roundId: state.room.roundId });
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
  if (event.target.id === 'spies') { state.draft = readRulesForm(); updateLobbyReadiness(); return; }
  if (event.target.id !== 'location-set') return;
  const selected = LOCATION_SETS.find(set => set.id === event.target.value);
  if (!selected) return;
  trackUsage('location_set');
  state.draft = { ...readRulesForm(), locations: [...selected.locations] };
  render();
});
$('#app').addEventListener('input', event => {
  if (event.target.id === 'name') savedName = event.target.value;
  if (event.target.id === 'code') { event.target.value = event.target.value.toUpperCase(); state.code = event.target.value; }
  if (event.target.closest('#rules-form')) {
    state.draft = readRulesForm();
    $('#minutes-label').textContent = `${state.draft.minutes} min`;
    $('#minutes').style.setProperty('--range-progress', `${(state.draft.minutes - 2) / 18 * 100}%`);
    $('#minutes').setAttribute('aria-valuetext', `${state.draft.minutes} minutes`);
    updateLobbyReadiness();
  }
});
$('#app').addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'join-form') run(async () => { const code = $('#code').value.trim().toUpperCase(); const name = getName(); await callGame({ action: 'join', code, name }); trackUsage('room_joined', { roomCode: code }); await connect(code); });
  if (event.target.id === 'rules-form') run(async () => { if ($('#new-location').value.trim()) throw new Error('Press Add to include your new location before saving.'); await action('settings', { settings: readRulesForm() }); state.draft = null; state.tab = 'players'; focusPlayers = true; notice('Rules saved. Your locations will be used in your next room.'); });
});
$('#app').addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const type = button.dataset.action;
  if (type === 'scores') return showLeaderboard();
  if (type === 'more-questions') { trackUsage('question_idea'); questionIndex = (questionIndex + 1) % QUESTION_IDEAS.length; $('#question-text').textContent = QUESTION_IDEAS[questionIndex]; return; }
  if (type === 'rename') return showProfileEditor();
  if (type === 'account') return showAccount();
  if (type === 'google') return signInGoogle('home');
  if (type === 'end-round') {
    confirmAction('End this round?', 'Any spies still in play win. The timer is only a guide—you decide when time is up.', 'End round', () => action('end'));
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button quiet full'; cancel.textContent = 'Cancel round without scores';
    cancel.onclick = () => { $('#confirm').close(); confirmAction('Cancel this round?', 'Everyone returns to the lobby. No scores are recorded.', 'Cancel round', () => action('stop')); };
    $('#confirm form').append(cancel);
    return;
  }
  if (type === 'exit-room') return confirmAction('Exit the room?', state.room.status === 'lobby' ? 'You can rejoin using the room code. If you are hosting, the next player becomes host.' : 'This will return everyone to the lobby and reset the round. If you are hosting, the next player becomes host.', 'Exit room', async () => { await action('leave'); disconnect(); state.code = ''; history.replaceState(null, '', '/'); render(); });
  if (type === 'sound') { toggleSound(); button.innerHTML = soundIcon(); button.setAttribute('aria-pressed', String(soundEnabled())); button.title = soundEnabled() ? 'Mute sound' : 'Enable sound'; return; }
  if (type === 'add-location' || type === 'remove-location') return editLocation(type, Number(button.dataset.index));
  if (type === 'refresh-result') return loadResult();
  if (type === 'create') return run(async () => { const { code } = await callGame({ action: 'create', name: getName() }); trackUsage('room_created', { roomCode: code }); await connect(code); });
  if (type === 'players' || type === 'rules') { state.tab = type; render(); return; }
  if (type === 'home') { disconnect(); history.replaceState(null, '', '/'); state.code = ''; render(); return; }
  if (type === 'share') return run(async () => { try { await navigator.clipboard.writeText(inviteUrl()); trackUsage('invite_copied'); notice('Invite link copied. Send it to your friends.'); } catch { notice(`Invite link: ${inviteUrl()}`); } });
  if (type === 'vote') { const player = state.room.players.find(p => p.id === button.dataset.target); return confirmAction('Accuse this player?', 'If enough players agree, their role is checked. Catch every spy to win. A wrong accusation lets the spies win.', 'Cast my vote', () => action('vote', { target: player.id }), player); }
  if (type === 'guess') {
    if (!state.role?.isSpy) { notice('Only the spy can submit a location guess. Tap a player above to vote.'); return; }
    return confirmAction(`Guess ${button.dataset.location}?`, 'This is your only guess. Get it wrong and the other players win.', 'Lock in my guess', () => action('guess', { location: button.dataset.location }));
  }
  if (type === 'remove') return confirmAction('Remove this player?', 'They can rejoin using the room code while the lobby is open.', 'Remove player', () => action('remove', { target: button.dataset.target }), state.room.players.find(p => p.id === button.dataset.target));
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
  const key = `${state.code}:${r.roundId}`;
  if (clockRound !== key) { clockRound = key; previousSeconds = null; }
  const cue = clockCue(previousSeconds, seconds);
  previousSeconds = seconds;
  if (cue === 'vote') playVotingSoon();
  if (cue === 'time') playTimeout();
  const guidance = $('#timer-guidance');
  if (guidance) {
    guidance.hidden = seconds > 60;
    guidance.textContent = seconds === 0 ? 'Time’s up. Keep playing—the host decides when to end the round.' : 'One minute left. Time to vote for your suspects.';
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) concealRole(); else updateClock(); });
window.addEventListener('offline', () => notice('You’re offline. Your place is saved; reconnect to keep playing.'));
window.addEventListener('online', () => { notice('Back online.'); updateClock(); });
setInterval(updateClock, 1000);
state.loading = Boolean(state.code);
render();
// QR and invite links enter the room automatically; the name can be edited in the lobby.
identity().then(async user => {
  state.uid = user.uid; startUsage(user.uid); lastScreen = '';
  await refreshProfile(user);
  if (state.code) {
    const snap = await getDoc(doc(db, 'rooms', state.code));
    if (!snap.exists()) throw new Error('That room does not exist. Check the invite link.');
    if (!snap.data().memberIds.includes(user.uid)) {
      const codename = () => `Agent ${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      let name = savedName || codename();
      if (Object.values(snap.data().players).some(p => p.name.toLowerCase() === name.toLowerCase())) name = codename();
      await callGame({ action: 'join', code: state.code, name });
      trackUsage('room_joined', { roomCode: state.code });
      savedName = name; try { localStorage.setItem('spyfall-name', name); } catch {}
    }
    await saveProfile(db, user.uid, savedName || snap.data().players[user.uid]?.name || `Agent ${user.uid.slice(0, 6)}`);
    await connect(state.code);
  } else render();
}).catch(error => { state.loading = false; render(); notice(errorMessage(error)); });

// A change in another tab must not leave the old player's room or secret visible.
onIdTokenChanged(auth, user => {
  if (!state.uid || accountChanging || profileIdentity === accountIdentity(user)) return;
  if (state.uid === user?.uid) {
    refreshProfile(user).then(() => { if ($('#rename-form')) showProfileEditor(); render(); }).catch(error => notice(errorMessage(error)));
    return;
  }
  stopUsage(); disconnect(); state.code = ''; state.uid = user?.uid || null;
  ownProfile = null; adminStats = null; rememberName('');
  $('#confirm').close(); history.replaceState(null, '', '/'); render();
  (user ? Promise.resolve(user) : identity()).then(async next => {
    state.uid = next.uid; startUsage(next.uid); await refreshProfile(next); render();
  }).catch(error => notice(errorMessage(error)));
});
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains('google-avatar')) event.target.remove();
}, true);
