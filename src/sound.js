let context;
let enabled = true;
try { enabled = localStorage.getItem('spyfall-sound') !== 'off'; } catch {}
export function soundEnabled() { return enabled; }
export function unlockSound() {
  if (!enabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch { /* Game play continues when audio is unavailable. */ }
}
export function toggleSound() {
  enabled = !enabled;
  try { localStorage.setItem('spyfall-sound', enabled ? 'on' : 'off'); } catch {}
  if (enabled) unlockSound();
  return enabled;
}
export function playSpyWin() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return;
  const start = context.currentTime;
  // Original spy-film sting: plucked bass, a dark brass-like minor chord,
  // and a clipped finish. No samples or melody from an existing soundtrack.
  const voice = (frequency, offset, duration, volume, type, cutoff) => {
    const oscillator = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter();
    const at = start + offset;
    oscillator.type = type; oscillator.frequency.value = frequency;
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, at);
    filter.frequency.exponentialRampToValueAtTime(300, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(filter); filter.connect(gain); gain.connect(context.destination);
    oscillator.start(at); oscillator.stop(at + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
  };
  voice(82.41, 0, 0.3, 0.22, 'triangle', 1600);
  voice(123.47, 0.16, 0.25, 0.16, 'triangle', 1800);
  [164.81, 196, 246.94, 293.66].forEach(frequency => voice(frequency, 0.32, 0.58, 0.055, 'sawtooth', 1900));
  voice(329.63, 0.94, 0.18, 0.14, 'triangle', 2200);
}
export function playTimeout() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return;
  const start = context.currentTime;
  [392, 293.66, 196].forEach((frequency, index) => {
    const oscillator = context.createOscillator(), gain = context.createGain();
    const at = start + index * 0.19;
    oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.27);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(at); oscillator.stop(at + 0.29);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
