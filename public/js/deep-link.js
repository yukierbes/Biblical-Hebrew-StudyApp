// A minimal way for one page to hand a small payload to whichever page
// it's about to navigate to — e.g. "open the category editor for this
// specific word" or "start Practice mode already set to English→Hebrew".
// Deliberately just an in-memory variable, not sessionStorage: it only
// needs to survive a same-tab hash-change navigation (main.js never
// reloads the page for that), and clearing on tab close/reload is the
// right behavior for a one-shot handoff like this anyway.

let pending = null;

/** Stash a payload for whichever page is mounted next. Call this right
 * before navigate(pageName). */
export function setDeepLink(payload) {
  pending = payload;
}

/** Reads and clears the pending payload, if any. A page should call
 * this once from its own mount(), typically before its first render. */
export function consumeDeepLink() {
  const value = pending;
  pending = null;
  return value;
}
