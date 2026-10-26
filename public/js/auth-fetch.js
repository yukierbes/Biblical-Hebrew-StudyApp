/**
 * Fetches `path` with the signed-in Netlify Identity user's JWT attached
 * as a Bearer token — this is what lets Netlify Functions (see
 * netlify/functions/get-data.js and sync.js) populate
 * `context.clientContext.user` and serve per-user or gated content.
 * Throws if nobody's signed in; `user.jwt()` auto-refreshes the token
 * if it's expired, so callers never need to think about that.
 */
export async function authFetch(path, opts = {}) {
  const user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
  if (!user) throw new Error("Not signed in");
  let token = null;
  try {
    token = await user.jwt();
  } catch (e) {
    // Offline, an expired token cannot be refreshed. Still make the request: the service worker answers
    // data requests from its saved copy (see sw.js). Online, a failure to get a token is a real error.
    if (typeof navigator === "undefined" || navigator.onLine !== false) throw e;
  }
  return fetch(path, {
    ...opts,
    headers: token ? { ...(opts.headers || {}), Authorization: `Bearer ${token}` } : opts.headers || {},
  });
}

/** True once Netlify Identity has finished initializing AND reports a
 * signed-in user. Used to gate the app before any data loads. */
export function isSignedIn() {
  return !!(window.netlifyIdentity && window.netlifyIdentity.currentUser());
}
