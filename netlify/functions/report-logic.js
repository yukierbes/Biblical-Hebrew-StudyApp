// Pure helpers for the "report a mistake" function (no network, no storage), kept apart
// from report.js so they can be tested on their own.

export const REPORT_AREAS = ["vocab", "consonants", "vowels", "accents", "verbs"];
export const REPORT_STATUSES = ["open", "fixed", "dismissed"];

const LIMITS = { itemKey: 300, itemLabel: 200, reason: 80, note: 600, page: 60 };

function clip(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

/**
 * Turns whatever the browser sent into a clean report, or returns { error }.
 * Only the fields below are kept, each capped in length, so a bad or hostile request
 * can't store anything else.
 */
export function sanitizeReport(input) {
  if (!input || typeof input !== "object") return { error: "Nothing to save." };
  const area = clip(input.area, 20);
  if (!REPORT_AREAS.includes(area)) return { error: "Unknown area." };
  const itemKey = clip(input.itemKey, LIMITS.itemKey);
  if (!itemKey) return { error: "Missing item." };
  return {
    report: {
      area,
      itemKey,
      itemLabel: clip(input.itemLabel, LIMITS.itemLabel),
      reason: clip(input.reason, LIMITS.reason),
      note: clip(input.note, LIMITS.note),
      page: clip(input.page, LIMITS.page),
    },
  };
}

/**
 * Who may open the review page: anyone whose email is listed in the OWNER_EMAIL
 * environment variable (comma-separated), or who has the Netlify Identity role "admin".
 */
export function isAdmin(user, env = {}) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  // Environment variable names are case-sensitive, so accept OWNER_EMAIL however it was typed.
  const ownerKey = Object.keys(env || {}).find((k) => k.toLowerCase() === "owner_email");
  const owners = String(ownerKey ? env[ownerKey] : "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (email && owners.includes(email)) return true;
  const roles = (user.app_metadata && user.app_metadata.roles) || [];
  return Array.isArray(roles) && roles.some((r) => String(r).trim().toLowerCase() === "admin");
}

// How many reports one student may send. Change these two numbers to taste.
export const MAX_REPORTS_PER_DAY = 10;
export const MAX_REPORTS_TOTAL = 100;

/**
 * Checks (and updates) a student's report counter. `counter` is what was stored for them
 * before ({ day, today, total, recent: [itemKeys sent today] }), or null. Returns
 * { ok: true, counter } to save, or { ok: false, error, status } to refuse.
 * The same item can't be reported twice in one day by the same student.
 */
export function checkReportLimit(counter, itemKey, day) {
  const c = { day, today: 0, total: 0, recent: [], ...(counter || {}) };
  if (c.day !== day) {
    c.day = day;
    c.today = 0;
    c.recent = [];
  }
  if (c.recent.includes(itemKey)) {
    return { ok: false, status: 429, error: "You already reported this one today. Thank you!" };
  }
  if (c.total >= MAX_REPORTS_TOTAL) {
    return { ok: false, status: 429, error: "You've reached the total number of reports allowed. Thank you for all your help!" };
  }
  if (c.today >= MAX_REPORTS_PER_DAY) {
    return { ok: false, status: 429, error: `You've sent ${MAX_REPORTS_PER_DAY} reports today, which is the daily limit. Please try again tomorrow.` };
  }
  c.today += 1;
  c.total += 1;
  c.recent = [...c.recent, itemKey].slice(-MAX_REPORTS_PER_DAY);
  return { ok: true, counter: c };
}

/** A sortable, unique-enough key: newest reports sort last. */
export function makeReportKey(now = Date.now(), random = Math.random()) {
  return `r-${String(now).padStart(14, "0")}-${Math.floor(random * 1e6).toString(36)}`;
}
