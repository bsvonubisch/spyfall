import { requiredPlayers } from './game.js';

// A transaction can finish before this client's cached lobby reflects the join.
// Only a server-confirmed snapshot can establish that membership was lost.
export function membershipState(snapshot, uid) {
  if (snapshot.exists() && snapshot.data().memberIds.includes(uid)) return 'joined';
  if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return 'pending';
  return 'removed';
}

// Room-specific UI must not follow a player into a different room.
export function resetRoomView(state) {
  Object.assign(state, { room: null, role: null, loading: false, draft: null, reveal: false, tab: 'players' });
}
export function lobbyReadiness(room, uid, draft = null) {
  const settings = room.hostId === uid && draft ? draft : room.settings;
  const needed = Math.max(0, requiredPlayers(settings.spies ?? 1) - room.memberIds.length);
  return { settings, needed, canStart: needed === 0 };
}
