import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAccount } from '../../src/admin-access.js';

const googleUser = claims => ({ isAnonymous: false, emailVerified: true, providerData: [{ providerId: 'google.com' }], getIdTokenResult: async () => ({ claims }) });

test('admin UI requires a boolean signed claim and a verified Google identity', async () => {
  assert.equal(await adminAccount(googleUser({ admin: true })), true);
  for (const claims of [{}, { admin: false }, { admin: 'true' }, { admin: 1 }, { email: 'owner@example.com' }]) {
    assert.equal(await adminAccount(googleUser(claims)), false);
  }
  for (const user of [null, { ...googleUser({ admin: true }), isAnonymous: true }, { ...googleUser({ admin: true }), emailVerified: false }, { ...googleUser({ admin: true }), providerData: [] }]) {
    assert.equal(await adminAccount(user), false);
  }
});

test('opening admin can refresh a changed claim and fails closed if the token is unavailable', async () => {
  let refresh;
  const user = { ...googleUser({}), getIdTokenResult: async force => { refresh = force; return { claims: {} }; } };
  assert.equal(await adminAccount(user, true), false);
  assert.equal(refresh, true);
  user.getIdTokenResult = async () => { throw new Error('offline'); };
  assert.equal(await adminAccount(user, true), false);
});
