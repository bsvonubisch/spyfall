import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockCue } from '../src/round-clock.js';
test('countdown cues cross boundaries once without replaying on refresh or repeated rendering', () => {
  assert.equal(clockCue(null, 60), null);
  assert.equal(clockCue(null, 0), null);
  assert.equal(clockCue(61, 60), 'vote');
  assert.equal(clockCue(60, 60), null);
  assert.equal(clockCue(60, 59), null);
  assert.equal(clockCue(1, 0), 'time');
  assert.equal(clockCue(0, 0), null);
  assert.equal(clockCue(75, 0), 'time');
});
