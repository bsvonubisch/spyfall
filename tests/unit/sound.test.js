import { test } from 'node:test';
import assert from 'node:assert/strict';

test('all admin previews unlock audio on the first gesture and respect mute and visibility', async () => {
  const keys = ['window', 'document', 'localStorage', 'fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let started = 0, resumed = 0;
  const storage = new Map();
  const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const source = () => ({ connect() {}, disconnect() {}, start() { started++; }, stop() {}, frequency: { ...parameter } });
  class AudioContext {
    state = 'suspended'; currentTime = 0; destination = {};
    async resume() { resumed++; this.state = 'running'; }
    async decodeAudioData() { return {}; }
    createBufferSource() { return source(); }
    createOscillator() { return source(); }
    createGain() { return { connect() {}, disconnect() {}, gain: { ...parameter } }; }
  }
  try {
    globalThis.window = { AudioContext };
    globalThis.document = { hidden: false, addEventListener() {} };
    globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    const sound = await import('../../src/sound.js');
    assert.equal(sound.SOUND_PREVIEWS.length, 4);
    for (const cue of sound.SOUND_PREVIEWS) {
      const before = started;
      assert.equal(await sound.previewSound(cue.id), true);
      assert.ok(started > before, `${cue.label} must start audio`);
    }
    assert.equal(resumed, 1);
    assert.equal(storage.size, 0, 'previewing must not change the saved sound preference');
    sound.toggleSound();
    const before = started;
    assert.equal(await sound.previewSound('vote'), false);
    assert.equal(started, before);
    assert.equal(sound.soundEnabled(), false);
    sound.toggleSound();
    document.hidden = true;
    assert.equal(await sound.previewSound('spy-win'), false);
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
