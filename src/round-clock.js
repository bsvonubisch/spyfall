// Return cues only when a live countdown crosses a boundary, never on reload.
export function clockCue(previous, seconds) {
  if (previous == null) return null;
  if (previous > 0 && seconds === 0) return 'time';
  if (previous > 60 && seconds > 0 && seconds <= 60) return 'vote';
  return null;
}
