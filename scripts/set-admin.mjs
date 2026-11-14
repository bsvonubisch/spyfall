// Trusted owner maintenance, never imported into the browser. Dry-run by default.
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
const require = createRequire(import.meta.url);
const { getGlobalDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth');

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes('@'))
    throw new Error('Set ADMIN_EMAIL in this process environment.');
  const project = process.env.FIREBASE_PROJECT_ID || 'vu-spyfall';
  if (!/^[a-z][a-z0-9-]+$/.test(project)) throw new Error('Invalid Firebase project ID.');
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error('Sign in with the Firebase CLI owner account first.');
  const tokens =
    account.tokens.expires_at > Date.now() + 60000
      ? account.tokens
      : await getAccessToken(account.tokens.refresh_token, [
          'https://www.googleapis.com/auth/cloud-platform',
        ]);
  const base = `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:`;
  async function request(action, body) {
    const response = await fetch(base + action, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`Firebase Authentication ${action} failed (${response.status}).`);
    return response.json();
  }
  const { users = [] } = await request('lookup', { email: [email] });
  if (users.length !== 1 || users[0].email?.toLowerCase() !== email)
    throw new Error('No matching Firebase account. Sign in to the game with Google first.');
  const user = users[0],
    revoke = process.argv.includes('--revoke');
  if (
    !revoke &&
    (user.disabled ||
      !user.emailVerified ||
      !user.providerUserInfo?.some((provider) => provider.providerId === 'google.com'))
  ) {
    throw new Error('Admin access requires an enabled, verified Google account.');
  }
  const claims = JSON.parse(user.customAttributes || '{}');
  if (revoke) delete claims.admin;
  else claims.admin = true;
  if (!process.argv.includes('--apply')) {
    console.log(
      `Verified target account in ${project}. Would ${revoke ? 'remove' : 'set'} the admin claim; other claims stay unchanged. Run with --apply to save.`,
    );
    return;
  }
  await request('update', { localId: user.localId, customAttributes: JSON.stringify(claims) });
  const confirmed = await request('lookup', { localId: [user.localId] });
  const saved = JSON.parse(confirmed.users?.[0]?.customAttributes || '{}');
  if (!isDeepStrictEqual(saved, claims)) throw new Error('Admin claim verification failed.');
  console.log(
    `Admin claim ${revoke ? 'removed' : 'saved'} and verified in ${project}. No email or credentials written to files.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
