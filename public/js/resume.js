// Exactly where you were: the page, and the place within it (which tab, which passage, which quiz question).
//
// A page that can pick up mid-way calls saveResumePoint(page, detail, label) as the person moves around; Home's
// "Pick up where you left off" shows the label ("Pattern quiz · question 4 of 10") and its Resume button hands
// `detail` back to the page, which restores it. Kept on this device only (not synced), for up to a week.
// Only the newest point is kept, and Home shows it only when it belongs to the page visited last.

export const RESUME_KEY = "hebrewApp.resumePoint";
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
};

/** Remembers where the person is on `page`. `detail` is whatever the page needs to restore itself; `label` is what Home says. */
export function saveResumePoint(page, detail, label, { now = Date.now() } = {}) {
  if (!page) return;
  safe(() => localStorage.setItem(RESUME_KEY, JSON.stringify({ page, detail: detail || {}, label: label || "", ts: now })));
}

/** { page, detail, label, ts } or null (also null once it is more than a week old). */
export function getResumePoint({ now = Date.now() } = {}) {
  return safe(() => {
    const v = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
    if (!v || typeof v.page !== "string" || !Number.isFinite(v.ts) || now - v.ts > KEEP_MS) return null;
    return v;
  }, null);
}

/** Forgets the point, but only if it is for `page` (finishing a quiz clears that quiz's point, not another page's). */
export function clearResumePoint(page) {
  const v = getResumePoint();
  if (v && (!page || v.page === page)) safe(() => localStorage.removeItem(RESUME_KEY));
}
