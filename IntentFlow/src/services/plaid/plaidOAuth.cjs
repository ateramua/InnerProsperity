/**
 * Plaid OAuth deep-link handling for Electron (intentflow://plaid-oauth?oauth_state_id=…).
 */

const PLAID_OAUTH_SCHEME = 'intentflow';
const PLAID_OAUTH_HOST = 'plaid-oauth';

function isPlaidOAuthDeepLink(url) {
  if (!url) return false;
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== `${PLAID_OAUTH_SCHEME}:`) return false;
    if (parsed.hostname !== PLAID_OAUTH_HOST) return false;
    return parsed.searchParams.has('oauth_state_id');
  } catch {
    return false;
  }
}

/** Convert intentflow://plaid-oauth?… to the HTTPS redirect URI Plaid expects for receivedRedirectUri. */
function deepLinkToReceivedRedirectUri(deepLinkUrl, redirectUriBase) {
  if (!isPlaidOAuthDeepLink(deepLinkUrl) || !redirectUriBase) return null;
  try {
    const deep = new URL(String(deepLinkUrl));
    const base = new URL(String(redirectUriBase));
    base.search = deep.search;
    return base.toString();
  } catch {
    return null;
  }
}

function findPlaidOAuthArgv(argv) {
  if (!Array.isArray(argv)) return null;
  return argv.find((arg) => isPlaidOAuthDeepLink(arg)) || null;
}

module.exports = {
  PLAID_OAUTH_SCHEME,
  PLAID_OAUTH_HOST,
  isPlaidOAuthDeepLink,
  deepLinkToReceivedRedirectUri,
  findPlaidOAuthArgv,
};
