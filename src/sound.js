let context;
let cueBuffer, loadingCue, playingCue;
let cueGeneration = 0;
const cueUrl = new URL('./assets/spy-chord.mp3', import.meta.url).href;
function preloadCue() {
  if (cueBuffer) return Promise.resolve(cueBuffer);
  if (!loadingCue) loadingCue = fetch(cueUrl).then(response => {
    if (!response.ok) throw new Error('Sound unavailable');
    return response.arrayBuffer();
  }).then(bytes => context.decodeAudioData(bytes)).then(buffer => (cueBuffer = buffer)).catch(() => null).finally(() => { loadingCue = null; });
  return loadingCue;
}
function stopCue() { cueGeneration++; playingCue?.stop(); playingCue = null; }
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) stopCue(); });
let enabled = true;
try { enabled = localStorage.getItem('spyfall-sound') !== 'off'; } catch {}
export function soundEnabled() { return enabled; }
export async function unlockSound() {
  if (!enabled) return false;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    context ||= new Audio();
    void preloadCue();
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  } catch { return false; /* Game play continues when audio is unavailable. */ }
}
export function toggleSound() {
  enabled = !enabled;
  try { localStorage.setItem('spyfall-sound', enabled ? 'on' : 'off'); } catch {}
  if (enabled) unlockSound(); else stopCue();
  return enabled;
}
export async function playSpyWin() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return false;
  stopCue();
  const generation = cueGeneration;
  const buffer = cueBuffer || await Promise.race([preloadCue(), new Promise(resolve => setTimeout(() => resolve(null), 1200))]);
  if (!buffer || generation !== cueGeneration || !enabled || document.hidden || context.state !== 'running') return false;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  playingCue = source;
  source.onended = () => { source.disconnect(); if (playingCue === source) playingCue = null; };
  source.start();
  return true;
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
export function playVote() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return;
  const oscillator = context.createOscillator(), gain = context.createGain();
  const at = context.currentTime;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(740, at);
  oscillator.frequency.exponentialRampToValueAtTime(1046, at + 0.08);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.1, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
  oscillator.connect(gain); gain.connect(context.destination);
  oscillator.start(at); oscillator.stop(at + 0.18);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
export function playVotingSoon() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return;
  [523.25, 783.99].forEach((frequency, i) => {
    const tone = context.createOscillator(), gain = context.createGain(), at = context.currentTime + i * 0.23;
    tone.type = 'sine'; tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.14, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
    tone.connect(gain); gain.connect(context.destination); tone.start(at); tone.stop(at + 0.42);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  });
}

export const SOUND_PREVIEWS = [
  { id: 'spy-win', label: 'Correct spy guess', play: playSpyWin },
  { id: 'vote', label: 'Vote cast', play: playVote },
  { id: 'voting-soon', label: 'One minute left', play: playVotingSoon },
  { id: 'round-end', label: 'Time up / round end', play: playTimeout }
];

export async function previewSound(id) {
  const cue = SOUND_PREVIEWS.find(cue => cue.id === id);
  if (!cue || document.hidden || !await unlockSound()) return false;
  stopCue();
  return (await cue.play()) !== false;
}
