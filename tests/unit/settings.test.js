import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSettings, DEFAULT_SETTINGS } from '../../src/game.js';
import { LOCATION_SETS } from '../../src/locations.js';

test('settings reject invalid durations, duplicate locations, and invalid voting modes', () => {
  assert.throws(() => validSettings({ ...DEFAULT_SETTINGS, minutes: 0 }));
  assert.throws(() => validSettings({ ...DEFAULT_SETTINGS, voting: 'anything' }));
  assert.throws(() =>
    validSettings({ ...DEFAULT_SETTINGS, locations: ['Beach', 'beach', 'Train'] }),
  );
  for (const spies of [0, 8, 1.5, '2'])
    assert.throws(() => validSettings({ ...DEFAULT_SETTINGS, spies }));
});

test('locations are trimmed, deduplicated after trimming, and stay within the supported bounds', () => {
  assert.deepEqual(
    validSettings({ ...DEFAULT_SETTINGS, locations: [' Beach ', 'Café', 'Train'] }).locations,
    ['Beach', 'Café', 'Train'],
  );
  for (const locations of [
    ['Beach', ' beach ', 'Train'],
    ['Beach', ' ', 'Train'],
    ['Beach', 7, 'Train'],
    ['Beach', null, 'Train'],
    ['Beach', 'Hotel\nLobby', 'Train'],
    ['Beach', 'x'.repeat(41), 'Train'],
    ['Beach', 'Train'],
    Array.from({ length: 41 }, (_, i) => `Place ${i}`),
  ]) {
    assert.throws(() => validSettings({ ...DEFAULT_SETTINGS, locations }));
  }
  for (const set of LOCATION_SETS)
    assert.deepEqual(
      validSettings({ ...DEFAULT_SETTINGS, locations: set.locations }).locations,
      set.locations,
    );
  const input = { ...DEFAULT_SETTINGS, locations: [' Beach ', 'Café', 'Train'] };
  validSettings(input);
  assert.equal(input.locations[0], ' Beach ', 'validation must not mutate a draft');
});
