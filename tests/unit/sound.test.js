import { test } from 'node:test';
import assert from 'node:assert/strict';

test('all admin previews unlock audio on the first gesture and respect mute and visibility', async () => {
  const keys = ['window', 'document', 'localStorage', 'fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let started = 0, resumed = 0;
  const recordings = [];
  const storage = new Map();
  const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const source = () => ({ connect() {}, disconnect() {}, start() { started++; if (this.buffer) recordings.push(this.buffer.asset); }, stop() {}, frequency: { ...parameter } });
  class AudioContext {
    state = 'suspended'; currentTime = 0; destination = {};
    async resume() { resumed++; this.state = 'running'; }
    async decodeAudioData(bytes) { return { asset: new TextDecoder().decode(bytes) }; }
    createBufferSource() { return source(); }
    createOscillator() { return source(); }
    createGain() { return { connect() {}, disconnect() {}, gain: { ...parameter } }; }
  }
  try {
    globalThis.window = { AudioContext };
    globalThis.document = { hidden: false, addEventListener() {} };
    globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
    globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer });
    const sound = await import('../../src/sound.js');
    assert.deepEqual(sound.SOUND_PREVIEWS.map(cue => cue.id), ['spy-win', 'spy-caught', 'vote', 'voting-soon', 'round-end']);
    for (const cue of sound.SOUND_PREVIEWS) {
      const before = started;
      assert.equal(await sound.previewSound(cue.id), true);
      assert.ok(started > before, `${cue.label} must start audio`);
    }
    assert.equal(resumed, 1);
    assert.ok(recordings[0].endsWith('/spy-chord.mp3'));
    assert.ok(recordings[1].endsWith('/spy-caught.mp3'), 'a caught spy uses its own recording');
    assert.equal(storage.size, 0, 'previewing must not change the saved sound preference');
    sound.toggleSound();
    const before = started;
    assert.equal(await sound.previewSound('vote'), false);
    assert.equal(await sound.previewSound('spy-caught'), false);
    assert.equal(started, before);
    assert.equal(sound.soundEnabled(), false);
    sound.toggleSound();
    document.hidden = true;
    assert.equal(await sound.previewSound('spy-win'), false);
    assert.equal(await sound.previewSound('spy-caught'), false);
    assert.equal(started, before);
    document.hidden = false;
    assert.equal(await sound.previewSound('unknown'), false);
    window.AudioContext = undefined;
    const unsupported = await import('../../src/sound.js?unsupported');
    assert.equal(await unsupported.previewSound('vote'), false);
  } finally {
    for (const key of keys) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  }
});
