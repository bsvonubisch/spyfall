// A transaction can finish before this client's cached lobby reflects the join.
// Only a server-confirmed snapshot can establish that membership was lost.
export function membershipState(snapshot, uid) {
  if (snapshot.exists() && snapshot.data().memberIds.includes(uid)) return 'joined';
  if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return 'pending';
  return 'removed';
}
