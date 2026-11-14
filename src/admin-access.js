export const googleAccount = user => Boolean(user && !user.isAnonymous && user.providerData?.some(provider => provider.providerId === 'google.com'));

// UI convenience only. Firestore independently checks the signed token claim.
export async function adminAccount(user, forceRefresh = false) {
  if (!googleAccount(user) || !user.emailVerified) return false;
  try {
    const { claims } = await user.getIdTokenResult(forceRefresh);
    return claims.admin === true;
  } catch {
    return false;
  }
}
