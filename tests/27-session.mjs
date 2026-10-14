import { assert, summary } from "./helpers.mjs";
import { startSession, touchSession, endSession, recordVisit, getLastVisit, IDLE_MS, SESSION_KEY } from "../public/js/session.js";

// Where the app lands: a fresh start goes to Home; a refresh while using the
// app stays put. (The real reload is checked in a browser; these cover the rules.)

const store = () => {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => void (d[k] = String(v)), removeItem: (k) => void delete d[k], d };
};
const T = 1_000_000_000_000;

console.log("\nLanding rules");
let session = store();
assert(startSession({ now: T, session }) === true, "first load in a tab is a fresh start (Home)");
assert(startSession({ now: T + 5_000, session }) === false, "a refresh moments later is not (stay on the page)");
assert(startSession({ now: T + 10 * 60_000, session }) === false, "...nor ten minutes later");
touchSession({ now: T + 20 * 60_000, session });
assert(startSession({ now: T + 40 * 60_000, session }) === false, "activity keeps the session going (20 min of use, refresh at 40)");
assert(startSession({ now: T + 40 * 60_000 + IDLE_MS + 1, session }) === true, "left alone longer than the idle limit, the next load is fresh");
session = store();
startSession({ now: T, session });
assert(startSession({ now: T + 1000, session, forceFresh: true }) === true, "signing in is always a fresh start");
assert(startSession({ now: T + 2000, session }) === false, "...and the refresh right after it stays");
endSession({ session });
assert(session.getItem(SESSION_KEY) === null, "signing out clears the session");
assert(startSession({ now: T + 3000, session }) === true, "...so the next load is fresh");
assert(startSession({ now: T, session: null }) === true, "with no storage at all it simply starts fresh");

console.log("\nLast visit");
const local = store();
assert(getLastVisit({ storage: local }) === null, "nothing remembered at first");
recordVisit("vowel-typing", { now: T, storage: local });
assert(getLastVisit({ storage: local }).page === "vowel-typing", "the page is remembered");
recordVisit("home", { now: T + 1, storage: local });
assert(getLastVisit({ storage: local }).page === "vowel-typing", "Home itself is never remembered");
local.setItem("hebrewApp.lastVisit", "not json");
assert(getLastVisit({ storage: local }) === null, "a damaged value is ignored");

summary();
