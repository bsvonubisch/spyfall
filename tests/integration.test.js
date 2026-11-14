import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, updateDoc, setDoc, writeBatch, serverTimestamp, query, orderBy, limit, Timestamp, onSnapshot, disableNetwork, enableNetwork } from 'firebase/firestore';
import { settleRound, awardResult, updateProfile } from '../src/scores.js';
import { loadAdminStats, watchLiveStats } from '../src/admin.js';
import { syncGoogleProfile } from '../src/google-profile.js';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, linkWithCredential, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { execute, DEFAULT_SETTINGS, resolveResult, eligiblePlayers, threshold } from '../src/game.js';
import { membershipState } from '../src/room-view.js';
import { LANGUAGES, setLanguage, locationName, canonicalLocation, locationInputValue } from '../src/i18n.js';

let env;
const db = id => env.authenticatedContext(id).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-spyfall', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => env.clearFirestore());
after(async () => env?.cleanup());
async function lobby(count = 3) {
  const { code } = await execute(db('p0'), 'p0', { action: 'create', name: 'Player 0' });
  for (let i = 1; i < count; i++) await execute(db(`p${i}`), `p${i}`, { action: 'join', code, name: `Player ${i}` });
  return code;
}
async function start(code) {
  await execute(db('p0'), 'p0', { action: 'start', code });
  const room = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  const roles = await Promise.all(room.memberIds.map(async id => ({ id, ...(await getDoc(doc(db(id), 'rooms', code, 'roles', id))).data() })));
  return { room, roles, spy: roles.find(r => r.isSpy), civilian: roles.find(r => !r.isSpy) };
}

const ownerClaims = { admin: true, email: 'owner@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['owner-google-id'] } } };
const ownerDb = () => env.authenticatedContext('owner', ownerClaims).firestore();
const usageEvent = (uid = 'p0') => ({ uid, type: 'visit', sessionId: crypto.randomUUID(), screen: 'home', roomCode: '', roundId: 0, device: 'mobile', source: 'client', createdAt: serverTimestamp() });

test('mixed-language clients save, receive, and guess the same canonical English locations', async () => {
  try {
    const code = await lobby(2);
    await setLanguage('fr');
    const locations = DEFAULT_SETTINGS.locations.map(canonical => {
      const label = locationName(canonical);
      return locationInputValue({ value: label, dataset: { canonical, label } });
    });
    await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, locations } });
    assert.deepEqual((await getDoc(doc(db('p0'), 'profiles', 'p0', 'preferences', 'game'))).data().locations, DEFAULT_SETTINGS.locations);
    const before = (await getDoc(doc(db('p0'), 'rooms', code))).data();
    await setLanguage('ar');
    assert.deepEqual((await getDoc(doc(db('p1'), 'rooms', code))).data(), before, 'changing a local language never changes the room');
    const { room, spy, civilian } = await start(code);
    assert.ok(DEFAULT_SETTINGS.locations.includes(civilian.location));
    assert.equal(spy.location, null);
    await setLanguage('ja');
    const guess = canonicalLocation(locationName(civilian.location));
    await execute(db(spy.id), spy.id, { action: 'guess', code, roundId: room.roundId, location: guess });
    const ended = (await getDoc(doc(db(spy.id), 'rooms', code))).data();
    const secret = (await getDoc(doc(db(spy.id), 'rooms', code, 'secrets', 'current'))).data();
    assert.equal(ended.result.guess, civilian.location);
    assert.equal(resolveResult(ended.result, secret).winner, 'spy');
    assert.deepEqual(ended.settings.locations, DEFAULT_SETTINGS.locations);
  } finally { await setLanguage('en'); }
});

test('language analytics accept supported codes, remain private, and preserve older clients', async () => {
  const event = usageEvent();
  await assertSucceeds(setDoc(doc(db('p0'), 'usage', 'legacy'), event));
  for (const { code } of LANGUAGES) {
    const ref = doc(db('p0'), 'usage', `language-${code}`);
    await assertSucceeds(setDoc(ref, { ...event, type: 'language_changed', language: code }));
    assert.equal((await getDoc(ref)).data().language, code);
    await assertFails(getDoc(doc(db('p1'), 'usage', `language-${code}`)));
  }
  for (const language of ['xx', 'German', null, {}, 'fr<script>']) await assertFails(setDoc(doc(db('p0'), 'usage', crypto.randomUUID()), { ...event, language }));
  const stats = await loadAdminStats(ownerDb());
  assert.equal(stats.usage.find(item => item.type === 'language_changed').count, LANGUAGES.length);
  assert.deepEqual(stats.languages.map(item => [item.code, item.events]), LANGUAGES.map(item => [item.code, 1]));
});

test('linking a Google identity retains the guest UID, profile, and saved locations; existing accounts can be restored', async () => {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-spyfall' }, crypto.randomUUID());
  try {
    const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    const guest = (await signInAnonymously(auth)).user;
    const code = (await execute(firestore, guest.uid, { action: 'create', name: 'Guest' })).code;
    const locations = ['Bakery', 'Garden', 'School'];
    await execute(firestore, guest.uid, { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, locations } });
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const jwt = `${encode({ alg: 'none' })}.${encode({ sub: crypto.randomUUID(), email: `qa-${crypto.randomUUID()}@example.test`, email_verified: true, name: 'Google test', picture: 'https://lh3.googleusercontent.com/a/test-photo', iss: 'https://accounts.google.com', aud: 'demo-spyfall', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 })}.`;
    const credential = GoogleAuthProvider.credential(jwt);
    const linked = (await linkWithCredential(guest, credential)).user;
    assert.equal(linked.uid, guest.uid); assert.equal(linked.isAnonymous, false);
    await linked.getIdToken(true);
    assert.deepEqual((await getDoc(doc(firestore, 'profiles', linked.uid, 'preferences', 'game'))).data().locations, locations);
    assert.equal((await getDoc(doc(firestore, 'profiles', linked.uid))).data().name, 'Guest');
    assert.ok((await linked.getIdTokenResult()).claims.firebase.identities['google.com']);
    // Real linked guests can have empty top-level fields while Google has both.
    const providerOnly = { uid: linked.uid, providerData: linked.providerData, displayName: null, photoURL: null };
    const imported = await syncGoogleProfile(firestore, providerOnly, { code });
    assert.equal(imported.name, 'Google test');
    assert.equal(imported.avatarUrl, 'https://lh3.googleusercontent.com/a/test-photo');
    assert.equal((await getDoc(doc(firestore, 'rooms', code))).data().players[linked.uid].avatarUrl, imported.avatarUrl);
    assert.equal((await getDoc(doc(firestore, 'rooms', code))).data().players[linked.uid].name, imported.name);
    const markerRef = doc(firestore, 'profiles', linked.uid, 'preferences', 'identity');
    assert.equal((await getDoc(markerRef)).data().googleProfileApplied, true);
    await assertFails(getDoc(doc(db('other'), 'profiles', linked.uid, 'preferences', 'identity')));
    await assertFails(setDoc(doc(db('other'), 'profiles', linked.uid, 'preferences', 'identity'), { googleProfileApplied: true, updatedAt: serverTimestamp() }));
    await updateProfile(firestore, linked.uid, { name: 'My codename', avatarSeed: 'my-new-avatar', avatarUrl: '' });
    const custom = await syncGoogleProfile(firestore, providerOnly, { code });
    assert.equal(custom.name, 'My codename'); assert.equal(custom.avatarUrl, imported.avatarUrl);
    assert.equal((await getDoc(doc(firestore, 'rooms', code))).data().players[linked.uid].name, 'My codename');
    assert.equal((await getDoc(doc(firestore, 'rooms', code))).data().players[linked.uid].avatarUrl, imported.avatarUrl);
    const unchanged = await syncGoogleProfile(firestore, providerOnly);
    assert.equal(unchanged.name, 'My codename'); assert.equal(unchanged.avatarUrl, imported.avatarUrl);
    const reconnected = await syncGoogleProfile(firestore, providerOnly, { force: true, code });
    assert.equal(reconnected.name, 'Google test'); assert.equal(reconnected.gamesPlayed, 0);
    assert.deepEqual((await getDoc(doc(firestore, 'profiles', linked.uid, 'preferences', 'game'))).data().locations, locations);
    const restored = (await signInWithCredential(auth, credential)).user;
    assert.equal(restored.uid, guest.uid);
  } finally { await deleteApp(app); }
});


test('only a verified Google account with an admin claim can query admin data, without access to private active roles', async () => {
  const code = await lobby(2); const { spy } = await start(code);
  for (const claims of [{}, { ...ownerClaims, email_verified: false }, { ...ownerClaims, admin: false }, { ...ownerClaims, admin: 'true' }, { ...ownerClaims, admin: undefined }, { ...ownerClaims, firebase: { sign_in_provider: 'anonymous', identities: {} } }]) {
    const outsider = env.authenticatedContext('outsider', claims).firestore();
    for (const path of ['profiles', 'rooms', 'results', 'usage', 'presence']) await assertFails(getDocs(collection(outsider, path)));
  }
  const admin = ownerDb();
  // The email is not an authorization rule; only a privileged service can assign the claim.
  const renamed = env.authenticatedContext('renamed-admin', { ...ownerClaims, email: 'changed@example.com' }).firestore();
  const renamedRooms = await assertSucceeds(getDocs(collection(renamed, 'rooms')));
  assert.deepEqual(renamedRooms.docs.map(room => room.id), [code]);
  for (const path of ['profiles', 'rooms', 'results', 'usage', 'presence']) await assertSucceeds(getDocs(collection(admin, path)));
  await assertFails(getDoc(doc(admin, 'rooms', code, 'roles', spy.id)));
  await assertFails(getDoc(doc(admin, 'rooms', code, 'secrets', 'current')));
  // A newly linked anonymous identity may retain its original sign-in provider in the token.
  const linked = env.authenticatedContext('owner', { ...ownerClaims, firebase: { ...ownerClaims.firebase, sign_in_provider: 'anonymous' } }).firestore();
  const linkedRooms = await assertSucceeds(getDocs(collection(linked, 'rooms')));
  assert.deepEqual(linkedRooms.docs.map(room => room.id), [code]);
});
test('Google photos persist through rooms and awards; changing a profile cannot change its scores', async () => {
  const photo = 'https://lh3.googleusercontent.com/a/test-photo=s96-c';
  await updateProfile(db('p0'), 'p0', { name: 'Google Agent', avatarSeed: 'portrait-1', avatarUrl: photo });
  const code = await lobby(2);
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().players.p0.avatarUrl, photo);
  await start(code); await execute(db('p0'), 'p0', { action: 'end', code }); await settleRound(db('p0'), 'p0', code);
  const before = (await getDoc(doc(db('p0'), 'profiles', 'p0'))).data();
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code, 'scores', 'p0'))).data().avatarUrl, photo);
  await updateProfile(db('p0'), 'p0', { name: 'New name', avatarSeed: 'portrait-2', avatarUrl: '' });
  const after = (await getDoc(doc(db('p0'), 'profiles', 'p0'))).data();
  assert.equal(after.gamesPlayed, before.gamesPlayed); assert.equal(after.wins, before.wins);
  for (const avatarUrl of ['javascript:alert(1)', 'https://evil.example/photo', 'https://lh3.googleusercontent.com.evil.example/a', 'http://lh3.googleusercontent.com/a']) await assertFails(updateDoc(doc(db('p0'), 'profiles', 'p0'), { avatarUrl, updatedAt: serverTimestamp() }));
  await assertFails(updateProfile(db('p1'), 'p0', { name: 'Impostor', avatarUrl: photo }));
});
test('saving locations creates private preferences reused in the next hosted room', async () => {
  const code = await lobby(2), locations = ['Garden', 'Bakery', 'Bus stop'];
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, locations } });
  assert.deepEqual((await getDoc(doc(db('p0'), 'profiles', 'p0', 'preferences', 'game'))).data().locations, locations);
  const next = (await execute(db('p0'), 'p0', { action: 'create', name: 'Player 0' })).code;
  assert.deepEqual((await getDoc(doc(db('p0'), 'rooms', next))).data().settings.locations, locations);
  const other = (await execute(db('p1'), 'p1', { action: 'create', name: 'Player 1' })).code;
  assert.deepEqual((await getDoc(doc(db('p1'), 'rooms', other))).data().settings.locations, DEFAULT_SETTINGS.locations);
  await assertFails(getDoc(doc(db('p1'), 'profiles', 'p0', 'preferences', 'game')));
  await assertFails(setDoc(doc(db('p1'), 'profiles', 'p0', 'preferences', 'game'), { locations, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db('p0'), 'profiles', 'p0', 'preferences', 'game'), { locations: ['Too few'], updatedAt: serverTimestamp() }));
});

test('Firestore rejects malformed locations even when app validation is bypassed, including slot 40', async () => {
  const code = await lobby(2), ref = doc(db('p0'), 'rooms', code);
  const preference = doc(db('p0'), 'profiles', 'p0', 'preferences', 'game');
  for (const location of [null, 7, {}, '', ' ', ' Beach', 'Hotel\nLobby', 'Hotel\tLobby', 'x'.repeat(41)]) {
    const locations = ['Beach', 'Train', location];
    await assertFails(updateDoc(ref, { settings: { ...DEFAULT_SETTINGS, locations } }));
    await assertFails(setDoc(preference, { locations, updatedAt: serverTimestamp() }));
  }
  await assertFails(updateDoc(ref, { settings: { ...DEFAULT_SETTINGS, locations: ['Beach', 'beach', 'Train'] } }));
  const forty = Array.from({ length: 40 }, (_, i) => `Place ${i + 1}`);
  await assertFails(updateDoc(ref, { settings: { ...DEFAULT_SETTINGS, locations: [...forty.slice(0, 39), null] } }));
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, locations: forty } });
  assert.deepEqual((await getDoc(preference)).data().locations, forty);
  await start(code);
  await assertFails(updateDoc(ref, { settings: DEFAULT_SETTINGS }));
});

test('invalid names and expired rooms cannot be changed through direct writes', async () => {
  const code = await lobby(2), ref = doc(db('p0'), 'rooms', code);
  const room = (await getDoc(ref)).data();
  await assertFails(updateDoc(ref, { players: { ...room.players, p0: { ...room.players.p0, name: '  ' } } }));
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), 'rooms', code), { createdAt: Timestamp.fromMillis(Date.now() - 86400001) }));
  await assertFails(updateDoc(ref, { settings: { ...DEFAULT_SETTINGS, minutes: 10 } }));
  await assert.rejects(execute(db('p2'), 'p2', { action: 'join', code, name: 'Late guest' }), /expired/);
});
test('usage events are immutable, contain no secret fields, and are private to admin queries', async () => {
  const event = usageEvent(), ref = doc(db('p0'), 'usage', 'valid-event');
  await assertSucceeds(setDoc(ref, event));
  await assertFails(updateDoc(ref, { type: 'vote_cast' }));
  await assertFails(getDoc(doc(db('p1'), 'usage', 'valid-event')));
  for (const extra of [{ uid: 'p1' }, { source: 'backfill' }, { location: 'Beach' }, { role: 'spy' }, { createdAt: Timestamp.fromMillis(0) }, { type: 'unknown' }]) await assertFails(setDoc(doc(db('p0'), 'usage', crypto.randomUUID()), { ...event, ...extra }));
  const stats = await loadAdminStats(ownerDb());
  assert.equal(stats.usage.find(item => item.type === 'visit').count, 1);
  assert.equal(stats.days.reduce((sum, day) => sum + day.count, 0), 1);
  await assert.rejects(loadAdminStats(db('p0')));
});
test('live stats require membership, deduplicate sessions, and exclude inactive or stale users', async () => {
  const code = await lobby(2), sessionId = crypto.randomUUID();
  const record = { uid: 'p0', sessionId, roomCode: code, screen: 'lobby', active: true, updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db('p0'), 'presence', `${sessionId}_p0`), record));
  await assertFails(setDoc(doc(db('outsider'), 'presence', `${sessionId}_outsider`), { ...record, uid: 'outsider' }));
  await assertFails(updateDoc(doc(db('p1'), 'presence', `${sessionId}_p0`), { ...record, uid: 'p1' }));
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(doc(admin, 'presence', 'second-tab'), record);
    await setDoc(doc(admin, 'presence', 'inactive'), { ...record, uid: 'p1', active: false });
    await setDoc(doc(admin, 'presence', 'stale'), { ...record, uid: 'old', updatedAt: Timestamp.fromMillis(Date.now() - 240000) });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error('Live stats timed out')); }, 8000);
    const stop = watchLiveStats(ownerDb(), live => { try { assert.equal(live.users, 1); assert.equal(live.rooms, 1); clearTimeout(timer); stop(); resolve(); } catch (error) { clearTimeout(timer); stop(); reject(error); } }, reject);
  });
});

test('profiles persist and only their owner can rename; leaderboard queries are bounded', async () => {
  const code = await lobby(2);
  assert.equal((await getDoc(doc(db('p0'), 'profiles', 'p0'))).data().name, 'Player 0');
  await execute(db('p0'), 'p0', { action: 'rename', code, name: 'Agent Zero' });
  assert.equal((await getDoc(doc(db('p0'), 'profiles', 'p0'))).data().name, 'Agent Zero');
  await assertFails(updateDoc(doc(db('p1'), 'profiles', 'p0'), { name: 'Impostor', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db('p0'), 'profiles', 'p0'), { wins: 99, gamesPlayed: 99, updatedAt: serverTimestamp() }));
  await assertFails(getDocs(collection(db('p0'), 'profiles')));
  await assertSucceeds(getDocs(query(collection(db('p0'), 'profiles'), orderBy('wins', 'desc'), limit(25))));
  await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(), 'profiles'), limit(25))));
});
test('regenerated avatars persist across rooms, results, and both leaderboards', async () => {
  const code = await lobby(2), avatarSeed = 'new-portrait-42';
  await execute(db('p0'), 'p0', { action: 'rename', code, name: 'Agent Zero', avatarSeed });
  const get = path => getDoc(doc(db('p0'), ...path)).then(snap => snap.data());
  assert.equal((await get(['rooms', code])).players.p0.avatarSeed, avatarSeed);
  assert.equal((await get(['profiles', 'p0'])).avatarSeed, avatarSeed);
  await assertFails(updateDoc(doc(db('p1'), 'profiles', 'p0'), { avatarSeed: 'fake', updatedAt: serverTimestamp() }));
  await start(code);
  await execute(db('p0'), 'p0', { action: 'end', code });
  await settleRound(db('p0'), 'p0', code);
  assert.equal((await get(['rooms', code, 'scores', 'p0'])).avatarSeed, avatarSeed);
  assert.equal((await get(['profiles', 'p0'])).avatarSeed, avatarSeed);
  const next = await execute(db('p0'), 'p0', { action: 'create', name: 'Agent Zero' });
  assert.equal((await get(['rooms', next.code])).players.p0.avatarSeed, avatarSeed);
});
test('room and overall scores award every participant exactly once despite concurrent retries', async () => {
  const code = await lobby(8);
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, spies: 2 } });
  const { spy, civilian, room, roles } = await start(code);
  await execute(db(spy.id), spy.id, { action: 'guess', code, roundId: 1, location: civilian.location });
  await Promise.all([settleRound(db('p0'), 'p0', code), settleRound(db('p1'), 'p1', code)]);
  await settleRound(db('p2'), 'p2', code);
  for (const role of roles) {
    const profile = (await getDoc(doc(db('p0'), 'profiles', role.id))).data();
    const score = (await getDoc(doc(db('p0'), 'rooms', code, 'scores', role.id))).data();
    assert.equal(profile.gamesPlayed, 1); assert.equal(score.gamesPlayed, 1);
    assert.equal(profile.wins, Number(role.isSpy)); assert.equal(score.wins, Number(role.isSpy));
  }
  const record = { key: room.roundKey, ...(await getDoc(doc(db('p0'), 'results', room.roundKey))).data() };
  await assertFails(updateDoc(doc(db('p0'), 'results', room.roundKey), { winnerIds: ['p0'] }));
  await execute(db('p0'), 'p0', { action: 'reset', code });
  await awardResult(db('p0'), record, 'p0');
  assert.equal((await getDoc(doc(db('p0'), 'profiles', 'p0'))).data().gamesPlayed, 1);
  const otherCode = (await execute(db('p0'), 'p0', { action: 'create', name: 'Player 0' })).code;
  await execute(db('p1'), 'p1', { action: 'join', code: otherCode, name: 'Player 1' });
  const next = await start(otherCode);
  await execute(db(next.spy.id), next.spy.id, { action: 'guess', code: otherCode, roundId: 1, location: next.civilian.location });
  await settleRound(db('p0'), 'p0', otherCode);
  assert.equal((await getDoc(doc(db('p0'), 'profiles', 'p0'))).data().gamesPlayed, 2);
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code, 'scores', 'p0'))).data().gamesPlayed, 1);
});
test('uncompleted rounds cannot score, forged or partial awards fail, and stopping records no games', async () => {
  const code = await lobby(2); const { room, spy, civilian } = await start(code);
  const record = { key: room.roundKey, code, roundId: room.roundId, memberIds: room.memberIds, players: room.players, winnerIds: ['p0'], completedAt: serverTimestamp() };
  const { key, ...data } = record;
  await assertFails(setDoc(doc(db('p0'), 'results', key), data));
  await settleRound(db('p0'), 'p0', code);
  assert.equal((await getDoc(doc(db('p0'), 'profiles', 'p0'))).data().gamesPlayed, 0);
  await execute(db('p0'), 'p0', { action: 'stop', code });
  assert.equal((await getDoc(doc(db('p0'), 'profiles', 'p0'))).data().gamesPlayed, 0);
  const next = await start(code);
  await execute(db(next.spy.id), next.spy.id, { action: 'guess', code, roundId: 2, location: next.civilian.location });
  const end = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  const validRecord = { ...data, roundId: 2, winnerIds: [next.spy.id] };
  await assertFails(setDoc(doc(db('outsider'), 'results', end.roundKey), validRecord));
  await assertSucceeds(setDoc(doc(db('p0'), 'results', end.roundKey), validRecord));
  await assertFails(setDoc(doc(db('p0'), 'results', end.roundKey, 'awards', 'p0'), { won: next.spy.id === 'p0', createdAt: serverTimestamp() }));
  const batchDb = db('p0'), batch = writeBatch(batchDb);
  batch.update(doc(batchDb, 'profiles', 'p0'), { wins: 50, gamesPlayed: 50, lastRoundKey: end.roundKey, updatedAt: serverTimestamp() });
  batch.set(doc(batchDb, 'results', end.roundKey, 'awards', 'p0'), { won: true, createdAt: serverTimestamp() });
  await assertFails(batch.commit());
  await assert.rejects(awardResult(db('outsider'), { key: end.roundKey, ...validRecord }, 'p0'));
  await execute(db('p0'), 'p0', { action: 'leave', code });
  assert.equal((await getDoc(doc(db('p1'), 'profiles', 'p0'))).data().gamesPlayed, 1);
});
test('fifteen-player scoring fits rule limits and a wrong guess credits all civilians', async () => {
  const code = await lobby(15); const { spy, civilian, roles } = await start(code);
  const wrong = DEFAULT_SETTINGS.locations.find(location => location !== civilian.location);
  await execute(db(spy.id), spy.id, { action: 'guess', code, roundId: 1, location: wrong });
  await settleRound(db('p0'), 'p0', code);
  const scores = await getDocs(query(collection(db('p0'), 'rooms', code, 'scores'), orderBy('wins', 'desc'), limit(25)));
  assert.equal(scores.size, 15);
  assert.equal(scores.docs.reduce((sum, doc) => sum + doc.data().wins, 0), 14);
  for (const role of roles) assert.equal((await getDoc(doc(db('p0'), 'profiles', role.id))).data().wins, Number(!role.isSpy));
});
test('room creation, private reads, host controls, and membership', async () => {
  const code = await lobby();
  await assertFails(getDocs(collection(db('p0'), 'rooms')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'rooms', code)));
  await assertFails(updateDoc(doc(db('p1'), 'rooms', code), { settings: { ...DEFAULT_SETTINGS, minutes: 2 } }));
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, minutes: 2 } });
  const { roles, spy, civilian } = await start(code);
  assert.equal(roles.filter(r => r.isSpy).length, 1);
  assert.equal(spy.location, null);
  await assertFails(getDoc(doc(db(spy.id), 'rooms', code, 'roles', civilian.id)));
  await assertFails(getDoc(doc(db('p0'), 'rooms', code, 'secrets', 'current')));
  await assertFails(getDocs(collection(db('p0'), 'rooms', code, 'roles')));
  await assertFails(updateDoc(doc(db('p0'), 'rooms', code, 'roles', spy.id), { location: 'Beach' }));
  await assertFails(updateDoc(doc(db(civilian.id), 'rooms', code), { status: 'ended', result: { reason: 'guess', guess: civilian.location } }));
  await assert.rejects(execute(db('p3'), 'p3', { action: 'join', code, name: 'Late' }));
});
test('correct spy guess reveals the result; reset permits another round', async () => {
  const code = await lobby(); const { spy, civilian } = await start(code);
  await execute(db(spy.id), spy.id, { action: 'guess', code, roundId: 1, location: civilian.location });
  const result = (await getDoc(doc(db('p0'), 'rooms', code))).data().result;
  const secret = (await getDoc(doc(db('p1'), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(resolveResult(result, secret).winner, 'spy');
  await execute(db('p0'), 'p0', { action: 'reset', code });
  await assertFails(getDoc(doc(db('p1'), 'rooms', code, 'secrets', 'current')));
  const { room } = await start(code); assert.equal(room.roundId, 2);
  await assert.rejects(execute(db('p1'), 'p1', { action: 'vote', code, roundId: 1, target: 'p0' }));
});
test('wrong spy guess gives the group a win', async () => {
  const code = await lobby(); const { spy, civilian } = await start(code);
  const wrong = DEFAULT_SETTINGS.locations.find(l => l !== civilian.location);
  await execute(db(spy.id), spy.id, { action: 'guess', code, roundId: 1, location: wrong });
  const r = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  const s = (await getDoc(doc(db('p0'), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(resolveResult(r.result, s).winner, 'players');
});
test('the spy can vote for an innocent player and help pass an accusation', async () => {
  const code = await lobby(); const { spy, civilian, room } = await start(code);
  await execute(db(spy.id), spy.id, { action: 'vote', code, roundId: 1, target: civilian.id });
  const voted = (await getDoc(doc(db(spy.id), 'rooms', code))).data();
  assert.equal(voted.votes[spy.id], civilian.id);
  assert.equal(voted.status, 'active');
  const other = room.memberIds.find(id => id !== spy.id && id !== civilian.id);
  await execute(db(other), other, { action: 'vote', code, roundId: 1, target: civilian.id });
  const ended = (await getDoc(doc(db(spy.id), 'rooms', code))).data();
  const secret = (await getDoc(doc(db(spy.id), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(resolveResult(ended.result, secret).winner, 'spy');
});
test('majority vote ends exactly once, even with concurrent votes', async () => {
  const code = await lobby(8); const { spy, room } = await start(code);
  const voters = room.memberIds.filter(id => id !== spy.id);
  await assertFails(updateDoc(doc(db(voters[0]), 'rooms', code), { votes: { [voters[1]]: spy.id } }));
  await assertFails(updateDoc(doc(db(voters[0]), 'rooms', code), { status: 'ended', result: { reason: 'vote', accusedId: spy.id } }));
  await Promise.all(voters.map(id => execute(db(id), id, { action: 'vote', code, roundId: 1, target: spy.id })));
  const final = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  assert.equal(final.status, 'ended'); assert.equal(final.result.accusedId, spy.id);
  assert.equal(Object.values(final.votes).filter(id => id === spy.id).length, 5);
});
test('unanimous vote requires everyone except the accused; wrong accusation wins for spy', async () => {
  const code = await lobby(4);
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, voting: 'unanimous' } });
  const { civilian, room } = await start(code); const voters = room.memberIds.filter(id => id !== civilian.id);
  for (const id of voters.slice(0, 2)) await execute(db(id), id, { action: 'vote', code, roundId: 1, target: civilian.id });
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().status, 'active');
  await execute(db(voters[2]), voters[2], { action: 'vote', code, roundId: 1, target: civilian.id });
  const r = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  const s = (await getDoc(doc(db('p0'), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(resolveResult(r.result, s).winner, 'spy');
});
test('timer is advisory; guesses and votes still work after zero and only the host can end manually', async () => {
  const code = await lobby(); const { spy, civilian } = await start(code);
  await assertFails(updateDoc(doc(db('p1'), 'rooms', code), { status: 'ended', result: { reason: 'timeout' } }));
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), 'rooms', code), { startedAt: Timestamp.fromMillis(Date.now() - 21 * 60000) }));
  await assertFails(updateDoc(doc(db('p1'), 'rooms', code), { status: 'ended', result: { reason: 'timeout' } }));
  await assert.rejects(execute(db('p1'), 'p1', { action: 'end', code }));
  await execute(db(civilian.id), civilian.id, { action: 'vote', code, roundId: 1, target: spy.id });
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().status, 'active');
  await execute(db(spy.id), spy.id, { action: 'guess', code, roundId: 1, location: civilian.location });
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().result.reason, 'guess');
  await execute(db('p0'), 'p0', { action: 'reset', code });
  await start(code);
  await execute(db('p0'), 'p0', { action: 'end', code });
  const ended = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  const secret = (await getDoc(doc(db('p0'), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(ended.result.reason, 'host'); assert.equal(resolveResult(ended.result, secret).winner, 'spy');
});
test('host transfer, removal, capacity, and a full 15-player deal', async () => {
  const code = await lobby(15);
  await assert.rejects(execute(db('overflow'), 'overflow', { action: 'join', code, name: 'Extra' }));
  await start(code);
  await execute(db('p0'), 'p0', { action: 'reset', code }).then(() => assert.fail('Cannot reset active round'), () => {});
  await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'rooms', code), { startedAt: Timestamp.fromMillis(Date.now() - 21 * 60000) }));
  await execute(db('p0'), 'p0', { action: 'end', code, roundId: 1 });
  await execute(db('p0'), 'p0', { action: 'reset', code });
  await execute(db('p0'), 'p0', { action: 'remove', code, target: 'p2' });
  await execute(db('p0'), 'p0', { action: 'leave', code });
  assert.equal((await getDoc(doc(db('p1'), 'rooms', code))).data().hostId, 'p1');
});

async function accuse(code, target) {
  const room = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  const voters = eligiblePlayers(room).filter(id => id !== target).slice(0, threshold(room));
  for (const id of voters) await execute(db(id), id, { action: 'vote', code, roundId: room.roundId, target });
  return (await getDoc(doc(db('p0'), 'rooms', code))).data();
}

test('multiple spies must all be caught; caught spies cannot act and the secret stays private', async () => {
  const code = await lobby(8);
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, spies: 2 } });
  const { roles, civilian, room } = await start(code), spies = roles.filter(r => r.isSpy);
  assert.equal(spies.length, 2);
  assert.ok(spies.every(r => r.location === null));
  let r = await accuse(code, spies[0].id);
  assert.equal(r.status, 'active'); assert.deepEqual(r.caughtIds, [spies[0].id]); assert.deepEqual(r.votes, {});
  assert.equal(r.startedAt.toMillis(), room.startedAt.toMillis());
  await assertFails(getDoc(doc(db(civilian.id), 'rooms', code, 'secrets', 'current')));
  await assertFails(getDoc(doc(db(civilian.id), 'rooms', code, 'roles', spies[1].id)));
  await assert.rejects(execute(db(spies[0].id), spies[0].id, { action: 'vote', code, roundId: 1, target: civilian.id }));
  await assert.rejects(execute(db(civilian.id), civilian.id, { action: 'vote', code, roundId: 1, target: spies[0].id }));
  await assertFails(updateDoc(doc(db(spies[0].id), 'rooms', code), { votes: { [spies[0].id]: civilian.id } }));
  await assertFails(updateDoc(doc(db(spies[0].id), 'rooms', code), { status: 'ended', result: { reason: 'guess', guess: civilian.location, guesserId: spies[0].id } }));
  await assertFails(updateDoc(doc(db(civilian.id), 'rooms', code), { caughtIds: spies.map(s => s.id) }));
  r = await accuse(code, spies[1].id);
  assert.equal(r.status, 'ended');
  const secret = (await getDoc(doc(db('p0'), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(resolveResult(r.result, secret).winner, 'players');
  await execute(db('p0'), 'p0', { action: 'reset', code });
  assert.deepEqual((await getDoc(doc(db('p0'), 'rooms', code))).data().caughtIds, []);
});

test('multi-spy wrong accusations and guesses still end the round', async () => {
  const code = await lobby(8);
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, spies: 2, voting: 'unanimous' } });
  const { civilian } = await start(code);
  const r = await accuse(code, civilian.id);
  assert.equal(r.status, 'ended');
  const secret = (await getDoc(doc(db('p0'), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(resolveResult(r.result, secret).winner, 'spy');
  await execute(db('p0'), 'p0', { action: 'reset', code });
  const next = await start(code), wrong = DEFAULT_SETTINGS.locations.find(l => l !== next.civilian.location);
  await execute(db(next.spy.id), next.spy.id, { action: 'guess', code, roundId: 2, location: wrong });
  const ended = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  const answer = (await getDoc(doc(db('p0'), 'rooms', code, 'secrets', 'current'))).data();
  assert.equal(resolveResult(ended.result, answer).winner, 'players');
});

test('only the confirmed accused role is readable during resolution; any member can finish it', async () => {
  const code = await lobby(8);
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, spies: 2 } });
  const { spy, civilian, roles } = await start(code);
  const voters = roles.filter(r => r.id !== spy.id).slice(0, 5);
  for (const p of voters.slice(0, 4)) await execute(db(p.id), p.id, { action: 'vote', code, roundId: 1, target: spy.id });
  const votes = Object.fromEntries(voters.map(p => [p.id, spy.id]));
  await updateDoc(doc(db(voters[4].id), 'rooms', code), { votes, status: 'accusing', result: { reason: 'vote', accusedId: spy.id } });
  await assertSucceeds(getDoc(doc(db(civilian.id), 'rooms', code, 'roles', spy.id)));
  await assertFails(getDoc(doc(db(civilian.id), 'rooms', code, 'secrets', 'current')));
  const other = roles.find(r => r.id !== spy.id && r.id !== civilian.id);
  await assertFails(getDoc(doc(db(civilian.id), 'rooms', code, 'roles', other.id)));
  await assertFails(updateDoc(doc(db(civilian.id), 'rooms', code), { status: 'ended' }));
  await execute(db(civilian.id), civilian.id, { action: 'resolve-vote', code, roundId: 1 });
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().status, 'active');
});

test('three spies can be dealt to fifteen players and votes from slots 13–15 count', async () => {
  const code = await lobby(15);
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, spies: 3 } });
  assert.equal((await start(code)).roles.filter(r => r.isSpy).length, 3);
  await execute(db('p0'), 'p0', { action: 'stop', code });
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: DEFAULT_SETTINGS });
  await start(code);
  for (let i = 7; i < 15; i++) await execute(db(`p${i}`), `p${i}`, { action: 'vote', code, roundId: 2, target: 'p0' });
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().status, 'ended');
});

test('a multi-spy round cannot start without enough players; names can only be changed by their owner in the lobby', async () => {
  const code = await lobby(4);
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: { ...DEFAULT_SETTINGS, spies: 2 } });
  await assert.rejects(execute(db('p0'), 'p0', { action: 'start', code }));
  await execute(db('p1'), 'p1', { action: 'rename', code, name: 'Agent One' });
  const ref = doc(db('p1'), 'rooms', code), r = (await getDoc(ref)).data();
  assert.equal(r.players.p1.name, 'Agent One');
  await assertFails(updateDoc(ref, { players: { ...r.players, p2: { id: 'p2', name: 'Tampered' } } }));
  await execute(db('p0'), 'p0', { action: 'settings', code, settings: DEFAULT_SETTINGS });
  await start(code);
  await assertFails(updateDoc(ref, { players: { ...r.players, p1: { id: 'p1', name: 'Changed' } } }));
});
test('only the host can stop a round; stopping clears roles and allows a restart', async () => {
  const code = await lobby(); await start(code);
  await assert.rejects(execute(db('p1'), 'p1', { action: 'stop', code }));
  await execute(db('p0'), 'p0', { action: 'stop', code });
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().status, 'lobby');
  await env.withSecurityRulesDisabled(async c => assert.equal((await getDoc(doc(c.firestore(), 'rooms', code, 'secrets', 'current'))).exists(), false));
  assert.equal((await start(code)).room.roundId, 2);
});

test('stopping a round keeps room and own-role listeners synchronized without permission errors', async () => {
  const code = await lobby(); await start(code);
  const phone = db('p1'), errors = [], stops = [];
  let lobbySeen, roleDeleted;
  const lobbyUpdate = new Promise(resolve => { lobbySeen = resolve; });
  const roleUpdate = new Promise(resolve => { roleDeleted = resolve; });
  const firstRoom = new Promise(resolve => stops.push(onSnapshot(doc(phone, 'rooms', code), snap => { resolve(); if (snap.data().status === 'lobby') lobbySeen(); }, error => errors.push(error))));
  const firstRole = new Promise(resolve => stops.push(onSnapshot(doc(phone, 'rooms', code, 'roles', 'p1'), snap => { resolve(); if (!snap.exists()) roleDeleted(); }, error => errors.push(error))));
  try {
    await Promise.all([firstRoom, firstRole]);
    await execute(db('p0'), 'p0', { action: 'stop', code });
    await Promise.all([lobbyUpdate, roleUpdate]);
    assert.deepEqual(errors, []);
  } finally { stops.forEach(stop => stop()); }
});
test('a player can exit an active round; the remaining players return to the lobby', async () => {
  const code = await lobby(); await start(code);
  await execute(db('p1'), 'p1', { action: 'leave', code });
  const room = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  assert.equal(room.status, 'lobby'); assert.deepEqual(room.memberIds, ['p0','p2']);
  await start(code);
  await execute(db('p0'), 'p0', { action: 'leave', code });
  assert.equal((await getDoc(doc(db('p2'), 'rooms', code))).data().hostId, 'p2');
});
test('two-player testing can start and resolve a vote; one player cannot start', async () => {
  const code = await lobby(1);
  await assert.rejects(execute(db('p0'), 'p0', { action: 'start', code }));
  await execute(db('p1'), 'p1', { action: 'join', code, name: 'Player 1' });
  const { spy, civilian } = await start(code);
  await execute(db(civilian.id), civilian.id, { action: 'vote', code, roundId: 1, target: spy.id });
  const room = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  assert.equal(room.status, 'ended');
  assert.equal(room.result.accusedId, spy.id);
});
test('a stale cached lobby does not eject a joined player; a confirmed removal still does', async () => {
  const code = await lobby(1);
  const phone = db('phone');
  const ref = doc(phone, 'rooms', code);
  await getDoc(ref); // Cache the lobby before this phone is a member.
  await disableNetwork(phone);
  await execute(db('phone'), 'phone', { action: 'join', code, name: 'Phone' });
  let stop;
  const states = [];
  let resolveJoined, resolveRemoved;
  const joined = new Promise(resolve => { resolveJoined = resolve; });
  const removed = new Promise(resolve => { resolveRemoved = resolve; });
  const initial = new Promise((resolve, reject) => {
    stop = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
      const value = membershipState(snap, 'phone'); states.push(value);
      resolve(value);
      if (value === 'joined') resolveJoined();
      if (value === 'removed') resolveRemoved();
    }, reject);
  });
  try {
    assert.equal(await initial, 'pending');
    await enableNetwork(phone);
    await joined;
    assert.deepEqual(states.slice(0, 2), ['pending', 'joined']);
    await execute(db('p0'), 'p0', { action: 'remove', code, target: 'phone' });
    await removed;
    assert.equal(states.at(-1), 'removed');
  } finally { stop(); await enableNetwork(phone); }
});
