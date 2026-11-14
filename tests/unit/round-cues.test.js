import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caughtSpyCue, resultCue } from '../../src/round-cues.js';

test('catching a spy during a multi-spy round sounds once, never on refresh or a new round', () => {
  const before = { roundId: 1, status: 'accusing', caughtIds: [] };
  const caught = { ...before, status: 'active', caughtIds: ['spy-one'] };
  assert.equal(caughtSpyCue(null, caught), false);
  assert.equal(caughtSpyCue(before, caught), true);
  assert.equal(caughtSpyCue(caught, caught), false);
  assert.equal(caughtSpyCue(caught, { ...caught, caughtIds: ['spy-one', 'spy-two'] }), true);
  assert.equal(caughtSpyCue(before, { ...caught, roundId: 2 }), false);
  assert.equal(caughtSpyCue({ ...before, status: 'lobby' }, caught), false);
  assert.equal(
    caughtSpyCue(before, { ...caught, status: 'ended' }),
    false,
    'the final catch uses the resolved result cue',
  );
  assert.equal(caughtSpyCue(before, { ...caught, caughtIds: [] }), false);
});

test('only a successful accusation uses the caught sound at the end of a round', () => {
  assert.equal(resultCue({ reason: 'vote', winner: 'players' }), 'spy-caught');
  assert.equal(resultCue({ reason: 'vote', winner: 'spy' }), 'round-end');
  assert.equal(resultCue({ reason: 'guess', winner: 'spy' }), 'spy-win');
  assert.equal(resultCue({ reason: 'guess', winner: 'players' }), 'round-end');
  assert.equal(resultCue({ reason: 'host', winner: 'spy' }), 'round-end');
  assert.equal(resultCue({ reason: 'timeout', winner: 'spy' }), 'round-end');
});
