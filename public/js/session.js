// Where the app opens, and how it remembers where you were.
//
// Landing rule: a FRESH start — opening the app, coming back to it in a new
// tab or window, or signing in — always lands on the Home page. But if you
// are in the middle of using it and refresh (or the app reloads itself after
// an update), you stay on the page you were on.
//
// "In the middle of using it" is tracked with sessionStorage: it belongs to one
// browser tab, survives a refresh, and disappears when the tab is closed. On
// top of that, if the tab has been left alone for a long time (IDLE_MS), the
// next load counts as a fresh start too.
//
// The last page visited is also remembered (in localStorage, per device) so the
// Home page can offer "Pick up where you left off".

export const SESSION_KEY = "hebrewApp.session";
export const LAST_VISIT_KEY = "hebrewApp.lastVisit";
export const IDLE_MS = 30 * 60 * 1000;

function safe(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
}

/**
 * Starts (or continues) the tab's session and says whether this is a fresh
 * start. `forceFresh` is true right after signing in.
 * `now` and the two storages are only passed in by tests.
 */
export function startSession({
  forceFresh = false,
  now = Date.now(),
  session = typeof sessionStorage !== "undefined" ? sessionStorage : null,
} = {}) {
  const last = safe(() => Number(session.getItem(SESSION_KEY)), 0);
  const fresh = forceFresh || !last || now - last > IDLE_MS;
  safe(() => session.setItem(SESSION_KEY, String(now)));
  return fresh;
}

/** Notes that the person is still using the app. */
export function touchSession({ now = Date.now(), session = typeof sessionStorage !== "undefined" ? sessionStorage : null } = {}) {
  safe(() => session.setItem(SESSION_KEY, String(now)));
}

/** Ends the session (signing out), so the next load is a fresh start. */
export function endSession({ session = typeof sessionStorage !== "undefined" ? sessionStorage : null } = {}) {
  safe(() => session.removeItem(SESSION_KEY));
}

// ---------------- Last visit ----------------

/** Remembers the page the person is on (Home itself is never remembered). */
export function recordVisit(page, { now = Date.now(), storage = typeof localStorage !== "undefined" ? localStorage : null } = {}) {
  if (!page || page === "home") return;
  safe(() => storage.setItem(LAST_VISIT_KEY, JSON.stringify({ page, ts: now })));
}

/** { page, ts } for the last page visited, or null. */
export function getLastVisit({ storage = typeof localStorage !== "undefined" ? localStorage : null } = {}) {
  return safe(() => {
    const v = JSON.parse(storage.getItem(LAST_VISIT_KEY) || "null");
    return v && typeof v.page === "string" && Number.isFinite(v.ts) ? v : null;
  }, null);
}
