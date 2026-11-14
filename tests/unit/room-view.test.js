import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lobbyReadiness, resetRoomView, membershipState } from '../../src/room-view.js';

const room = (count, spies = 1) => ({ hostId: 'p0', memberIds: Array.from({ length: count }, (_, i) => `p${i}`), settings: { spies, minutes: 8, locations: ['Beach', 'Hotel', 'Train'] } });

test('the host preview follows unsaved spies, including when players arrive or leave', () => {
  const draft = { ...room(1).settings, spies: 2 };
  assert.equal(lobbyReadiness(room(1), 'p0', draft).needed, 7);
  assert.equal(lobbyReadiness(room(8), 'p0', draft).canStart, true);
  assert.equal(lobbyReadiness(room(7), 'p0', draft).canStart, false);
  assert.equal(lobbyReadiness(room(8), 'p0', { ...draft, spies: 3 }).needed, 4);
  assert.equal(lobbyReadiness(room(12), 'p0', { ...draft, spies: 3 }).canStart, true);
});

test('guests see saved rules; saving removes any difference between host and guest readiness', () => {
  assert.equal(lobbyReadiness(room(2), 'p1', { spies: 3 }).canStart, true);
  assert.equal(lobbyReadiness(room(2, 3), 'p1').needed, 10);
  assert.deepEqual(lobbyReadiness(room(8, 2), 'p0'), lobbyReadiness(room(8, 2), 'p1'));
  assert.equal(lobbyReadiness(room(1), 'p0').needed, 1);
  assert.equal(lobbyReadiness(room(15), 'p0').needed, 0);
});

test('leaving a room clears the old rules tab, draft and revealed role but keeps the account', () => {
  const state = { uid: 'p0', tab: 'rules', draft: { spies: 3 }, room: room(12), role: { location: 'Beach' }, reveal: true, loading: true };
  resetRoomView(state);
  assert.equal(state.uid, 'p0');
  assert.equal(state.tab, 'players');
  assert.equal(state.draft, null); assert.equal(state.role, null); assert.equal(state.room, null);
  assert.equal(state.reveal, false); assert.equal(state.loading, false);
  state.room = room(2);
  assert.equal(lobbyReadiness(state.room, state.uid, state.draft).settings.spies, 1);
});

test('only confirmed server snapshots remove membership, including a missing cached room', () => {
  const snapshot = (exists, ids, metadata) => ({ exists: () => exists, data: () => ({ memberIds: ids }), metadata });
  assert.equal(membershipState(snapshot(false, [], { fromCache: true }), 'p0'), 'pending');
  assert.equal(membershipState(snapshot(true, ['p0'], { fromCache: true }), 'p0'), 'joined');
  assert.equal(membershipState(snapshot(true, [], { hasPendingWrites: true }), 'p0'), 'pending');
  assert.equal(membershipState(snapshot(false, [], {}), 'p0'), 'removed');
});
