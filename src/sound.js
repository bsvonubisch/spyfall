let context;
let playingCue;
let cueGeneration = 0;
const spyWin = { url: new URL('./assets/spy-chord.mp3', import.meta.url).href };
const spyCaught = { url: new URL('./assets/spy-caught.mp3', import.meta.url).href };
function preloadCue(cue) {
  if (cue.buffer) return Promise.resolve(cue.buffer);
  if (!cue.loading) cue.loading = fetch(cue.url).then(response => {
    if (!response.ok) throw new Error('Sound unavailable');
    return response.arrayBuffer();
  }).then(bytes => context.decodeAudioData(bytes)).then(buffer => (cue.buffer = buffer)).catch(() => null).finally(() => { cue.loading = null; });
  return cue.loading;
}
function stopCue() {
  cueGeneration++;
  const source = playingCue;
  playingCue = null;
  try { source?.stop(); } catch { /* The audio device may already be closed. */ }
}
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
    void preloadCue(spyWin);
    void preloadCue(spyCaught);
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  } catch { return false; /* Game play continues when audio is unavailable. */ }
}
export function toggleSound() {
  enabled = !enabled;
  try { localStorage.setItem('spyfall-sound', enabled ? 'on' : 'off'); } catch {}
  if (enabled) void unlockSound(); else stopCue();
  return enabled;
}
export const playSpyWin = () => playRecording(spyWin);
export const playSpyCaught = () => playRecording(spyCaught);
async function playRecording(cue) {
  try {
    if (!enabled || document.hidden || !context || context.state !== 'running') return false;
    stopCue();
    const generation = cueGeneration;
    const buffer = cue.buffer || await Promise.race([preloadCue(cue), new Promise(resolve => setTimeout(() => resolve(null), 1200))]);
    if (!buffer || generation !== cueGeneration || !enabled || document.hidden || context.state !== 'running') return false;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    playingCue = source;
    source.onended = () => { source.disconnect(); if (playingCue === source) playingCue = null; };
    source.start();
    return true;
  } catch { return false; /* An audio failure must never interrupt a round. */ }
}
export function playTimeout() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return false;
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
  return true;
}
export function playVote() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return false;
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
  return true;
}
export function playVotingSoon() {
  if (!enabled || document.hidden || !context || context.state !== 'running') return false;
  [523.25, 783.99].forEach((frequency, i) => {
    const tone = context.createOscillator(), gain = context.createGain(), at = context.currentTime + i * 0.23;
    tone.type = 'sine'; tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.14, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
    tone.connect(gain); gain.connect(context.destination); tone.start(at); tone.stop(at + 0.42);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  });
  return true;
}

export const SOUND_PREVIEWS = [
  { id: 'spy-win', label: 'Correct spy guess', play: playSpyWin },
  { id: 'spy-caught', label: 'Spy caught', play: playSpyCaught },
  { id: 'vote', label: 'Vote cast', play: playVote },
  { id: 'voting-soon', label: 'One minute left', play: playVotingSoon },
  { id: 'round-end', label: 'Time up / round end', play: playTimeout }
];

export async function previewSound(id) {
  const cue = SOUND_PREVIEWS.find(cue => cue.id === id);
  if (!cue || document.hidden || !await unlockSound()) return false;
  stopCue();
  return cue.play();
}
