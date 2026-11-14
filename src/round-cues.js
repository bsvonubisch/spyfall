// Use consecutive confirmed room snapshots, never a first load or local write.
export function caughtSpyCue(previous, next) {
  return Boolean(
    previous &&
    previous.roundId === next.roundId &&
    ['active', 'accusing'].includes(previous.status) &&
    next.status === 'active' &&
    next.caughtIds.some((id) => !previous.caughtIds.includes(id)),
  );
}

export function resultCue(result) {
  if (result.reason === 'vote' && result.winner === 'players') return 'spy-caught';
  if (result.reason === 'guess' && result.winner === 'spy') return 'spy-win';
  return 'round-end';
}
