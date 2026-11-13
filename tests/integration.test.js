import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, updateDoc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { execute, DEFAULT_SETTINGS, resolveResult, validSettings } from '../src/game.js';

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
test('majority vote ends exactly once, even with concurrent votes', async () => {
  const code = await lobby(5); const { spy, room } = await start(code);
  const voters = room.memberIds.filter(id => id !== spy.id);
  await assertFails(updateDoc(doc(db(voters[0]), 'rooms', code), { votes: { [voters[1]]: spy.id } }));
  await assertFails(updateDoc(doc(db(voters[0]), 'rooms', code), { status: 'ended', result: { reason: 'vote', accusedId: spy.id } }));
  await Promise.all(voters.map(id => execute(db(id), id, { action: 'vote', code, roundId: 1, target: spy.id })));
  const final = (await getDoc(doc(db('p0'), 'rooms', code))).data();
  assert.equal(final.status, 'ended'); assert.equal(final.result.accusedId, spy.id);
  assert.equal(Object.values(final.votes).filter(id => id === spy.id).length, 3);
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
test('timeout is enforced by server time; clients cannot end early', async () => {
  const code = await lobby(); await start(code);
  await assertFails(updateDoc(doc(db('p1'), 'rooms', code), { status: 'ended', result: { reason: 'timeout' } }));
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), 'rooms', code), { startedAt: Timestamp.fromMillis(Date.now() - 21 * 60000) }));
  await execute(db('p1'), 'p1', { action: 'expire', code, roundId: 1 });
  assert.equal((await getDoc(doc(db('p0'), 'rooms', code))).data().result.reason, 'timeout');
});
test('host transfer, removal, capacity, and a full 12-player deal', async () => {
  const code = await lobby(12);
  await assert.rejects(execute(db('overflow'), 'overflow', { action: 'join', code, name: 'Extra' }));
  await start(code);
  await execute(db('p0'), 'p0', { action: 'reset', code }).then(() => assert.fail('Cannot reset active round'), () => {});
  await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'rooms', code), { startedAt: Timestamp.fromMillis(Date.now() - 21 * 60000) }));
  await execute(db('p0'), 'p0', { action: 'expire', code, roundId: 1 });
  await execute(db('p0'), 'p0', { action: 'reset', code });
  await execute(db('p0'), 'p0', { action: 'remove', code, target: 'p2' });
  await execute(db('p0'), 'p0', { action: 'leave', code });
  assert.equal((await getDoc(doc(db('p1'), 'rooms', code))).data().hostId, 'p1');
});
test('settings reject invalid durations, duplicate locations, and invalid voting modes', () => {
  assert.throws(() => validSettings({ ...DEFAULT_SETTINGS, minutes: 0 }));
  assert.throws(() => validSettings({ ...DEFAULT_SETTINGS, voting: 'anything' }));
  assert.throws(() => validSettings({ ...DEFAULT_SETTINGS, locations: ['Beach', 'beach', 'Train'] }));
});
