// When an access token was issued (ms), read from its JWT `iat` claim. A session restored from localStorage
// must use this, not the page-load time, or a token that expired while the tab was closed looks fresh (#128).
// Returns 0 when the token can't be read, so callers treat it as stale and refresh.
export function issuedAtFromToken(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { iat } = JSON.parse(json) as { iat?: unknown };
    return typeof iat === 'number' ? iat * 1000 : 0;
  } catch {
    return 0;
  }
}
