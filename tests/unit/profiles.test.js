import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleProfile } from '../../src/google-profile.js';
import { safeAvatarUrl, playerAvatar } from '../../src/avatars.js';

test('Google profile fields prefer provider data, retain safe fallbacks, and never use an unsafe photo URL', () => {
  const user = { uid: 'agent', displayName: 'Old Firebase name', photoURL: 'https://lh3.googleusercontent.com/old', providerData: [{ providerId: 'google.com', displayName: ' Google Provider Name ', photoURL: 'https://lh3.googleusercontent.com/new' }] };
  assert.equal(googleProfile(user).name, 'Google Provider Name');
  assert.equal(googleProfile(user).avatarUrl, 'https://lh3.googleusercontent.com/new');
  assert.equal(googleProfile({ ...user, photoURL: null, providerData: [{ providerId: 'google.com', photoURL: 'javascript:alert(1)' }] }).avatarUrl, '');
  assert.equal(googleProfile({ uid: 'agent', providerData: [] }, { name: 'Saved name', avatarSeed: 'custom' }).name, 'Saved name');
});

test('avatar URLs reject credentials, ports, non-Google hosts and script injection', () => {
  for (const url of ['javascript:alert(1)', 'https://example.com/photo', 'https://lh3.googleusercontent.com.evil.test/photo', 'https://user:pass@lh3.googleusercontent.com/photo', 'https://lh3.googleusercontent.com:8443/photo', 'http://lh3.googleusercontent.com/photo']) assert.equal(safeAvatarUrl(url), '');
  const markup = playerAvatar({ id: 'p0', avatarUrl: 'https://lh3.googleusercontent.com/a?x=" onerror="alert(1)' });
  assert.ok(!markup.includes('onerror="'));
  assert.match(markup, /referrerpolicy="no-referrer"/);
});

