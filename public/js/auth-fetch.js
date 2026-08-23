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
  const token = await user.jwt();
  return fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
}

/** True once Netlify Identity has finished initializing AND reports a
 * signed-in user. Used to gate the app before any data loads. */
export function isSignedIn() {
  return !!(window.netlifyIdentity && window.netlifyIdentity.currentUser());
}
