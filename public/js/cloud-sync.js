// This module handles two related but separate things once someone is
// signed in (sign-in itself is mandatory app-wide — see the auth gate
// in main.js, which owns all Netlify Identity init/login/logout
// events and calls the functions below in response):
//   1. The sidebar's Account section (status display, sign out, manual sync)
//   2. Syncing of progress data to Netlify Blobs via /sync
// If Netlify Identity isn't configured on this deployment at all, the
// gate in main.js keeps the whole app locked, and this module's UI
// simply reports that cloud sync isn't available.
//
// How syncing works (the rules live in sync-delta.js):
//   - Every few seconds the app LOOKS at its saved items on this device (nothing is sent by looking).
//   - It contacts the server only when something changed here (after about 20 seconds of quiet, or at most
//     every 90 seconds during constant changes), when the tab is hidden or closed, when you return to it, when
//     the connection comes back, once every few minutes while the tab is open to pick up changes from your
//     other devices, or when you press Sync Now. A hidden tab never contacts the server on its own.
//   - What is sent is only the items that changed; what comes back is only the items this device is missing.

import { renderStreakDisplay } from "./srs.js";
import { authFetch } from "./auth-fetch.js";
import { setSectionSummary } from "./sidebar-collapse.js";
import {
  TIMING,
  hasChanges,
  sameSnapshot,
  runSyncRounds,
  decideSync,
  backoffDelay,
  storageUsage,
  formatBytes,
  STORAGE_WARN_BYTES,
} from "./sync-delta.js";

const SYNC_PREFIX = "hebrewVerbApp:";
const META_KEY = "hebrewVerbApp:cloudSync:meta";
const SHADOW_KEY = "hebrewVerbApp:cloudSync:shadow";
const SYNC_ENDPOINT = "/.netlify/functions/sync";
// A request sent as the page is closing may only carry about 64 KB; stay well under.
const KEEPALIVE_LIMIT_BYTES = 60000;

const status = { available: false, signedIn: false, email: null, syncing: false, lastSyncedAt: null, error: null };
const listeners = [];

function notify() {
  for (const fn of listeners) fn(status);
}

export function onSyncStatusChange(fn) {
  listeners.push(fn);
}

export function getSyncStatus() {
  return status;
}

function safeGetJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

/** Every localStorage key this app owns and wants to sync — anything
 * under the app's namespace except cloud-sync's own bookkeeping keys.
 * Reading this fresh each time (rather than hardcoding a key list)
 * means a brand-new feature's storage key is picked up automatically,
 * with no separate change needed here. */
function currentSyncableKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SYNC_PREFIX) && k !== META_KEY && k !== SHADOW_KEY) keys.push(k);
  }
  return keys;
}

function readSnapshot() {
  const snap = {};
  for (const k of currentSyncableKeys()) snap[k] = localStorage.getItem(k);
  return snap;
}

function readMeta() {
  return safeGetJSON(META_KEY, {});
}

function applyMergedResult(merged) {
  // The older, whole-notebook answer (an older server, or an echo in tests): replace everything it names.
  for (const [k, v] of Object.entries(merged.snapshot || {})) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* storage unavailable — not critical */
    }
  }
  safeSetJSON(META_KEY, merged.meta || {});
  safeSetJSON(SHADOW_KEY, merged.snapshot || {});
  renderStreakDisplay();
}

const storageIO = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* storage unavailable — not critical */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch (e) {
      /* storage unavailable — not critical */
    }
  },
};

function byteLength(text) {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text).length : text.length * 3;
}

let syncInFlight = null;
// What the quiet-period timer watches (see checkForChanges below).
let lastSeen = null;
let firstChangeAt = 0;
let lastChangeAt = 0;
let lastContactAt = 0;
let failures = 0;
let nextAttemptAt = 0;

/** One sync: see runSyncRounds in sync-delta.js for the steps. */
async function runSync({ flush = false } = {}) {
  const { legacy, applied } = await runSyncRounds({
    storage: { readSnapshot, getJSON: safeGetJSON, setJSON: safeSetJSON, io: storageIO },
    keys: { shadow: SHADOW_KEY, meta: META_KEY },
    post: async (request) => {
      const body = JSON.stringify(request);
      const res = await authFetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        // Closing the tab: ask the browser to finish the request even after the page is gone.
        keepalive: flush && byteLength(body) < KEEPALIVE_LIMIT_BYTES,
      });
      if (!res.ok) throw new Error(`Sync failed (HTTP ${res.status})`);
      return res.json();
    },
  });
  if (legacy) applyMergedResult(legacy);
  else if (applied) renderStreakDisplay();
}

/**
 * Syncs now: sends whatever changed on this device and brings back whatever is new from other devices. One
 * request does both, and an unchanged tab costs the server almost nothing. Safe to call often; concurrent calls
 * share the same request. Never throws (a problem shows in the Account section).
 */
export function syncNow() {
  return runGuarded({ manual: true });
}

function runGuarded({ manual = false, flush = false } = {}) {
  if (!status.signedIn) return Promise.resolve();
  if (syncInFlight) return syncInFlight;

  status.syncing = true;
  notify();

  syncInFlight = (async () => {
    try {
      await runSync({ flush });
      status.error = null;
      status.lastSyncedAt = Date.now();
      lastContactAt = Date.now();
      failures = 0;
      nextAttemptAt = 0;
      firstChangeAt = 0;
      lastChangeAt = 0;
      lastSeen = null;
    } catch (e) {
      status.error = e.message || "Sync failed";
      failures++;
      nextAttemptAt = Date.now() + backoffDelay(failures);
      // Whatever was waiting is retried as soon as the hold-off ends, without waiting out a fresh quiet period.
      if (hasChanges(safeGetJSON(SHADOW_KEY, {}), readSnapshot())) {
        firstChangeAt = firstChangeAt || Date.now();
        lastChangeAt = 0;
      }
    } finally {
      status.syncing = false;
      notify();
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/** Runs every few seconds while the tab is visible (exported so tests can run it). Looks at this device only; contacts the server only when
 * decideSync says it is time. */
export function checkForChanges() {
  if (!status.signedIn || syncInFlight) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const now = Date.now();
  if (now < nextAttemptAt) return;

  const current = readSnapshot();
  const shadow = safeGetJSON(SHADOW_KEY, {});
  const pending = hasChanges(shadow, current);
  if (lastSeen && !sameSnapshot(lastSeen, current)) lastChangeAt = now;
  lastSeen = current;
  // The first time changes are noticed counts as activity, so they wait out the quiet period like any other.
  if (pending && !firstChangeAt) {
    firstChangeAt = now;
    lastChangeAt = now;
  }

  if (decideSync({ pending, firstChangeAt, lastChangeAt, lastContactAt, now }) === "sync") runGuarded();
}

/** The tab is being hidden or closed: send what is waiting, now. */
function flushIfPending() {
  if (!status.signedIn) return;
  if (!hasChanges(safeGetJSON(SHADOW_KEY, {}), readSnapshot())) return;
  runGuarded({ flush: true });
}

export function openSignIn() {
  if (window.netlifyIdentity) window.netlifyIdentity.open("login");
}

export function signOut() {
  if (window.netlifyIdentity) window.netlifyIdentity.logout();
}

// ============ Sidebar Account UI ============

function timeAgo(ts) {
  if (!ts) return "never";
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function renderAccountUI() {
  const section = document.getElementById("account-section");
  if (!section) return;
  // The Account header is collapsed by default, so its summary says how syncing is going.
  const header = section.closest(".sidebar-section");

  if (!status.available) {
    section.innerHTML = `<div class="caption">Cloud sync isn't available on this deployment.</div>`;
    setSectionSummary(header, "Sync off");
    return;
  }

  if (!status.signedIn) {
    section.innerHTML = `<div class="caption">Not signed in.</div>`;
    setSectionSummary(header, "Not signed in");
    return;
  }

  setSectionSummary(header, status.error ? "Sync error" : status.syncing ? "Syncing…" : "Synced ✓");

  const statusLine = status.error
    ? `<span style="color:var(--bad);">Sync error: ${status.error}</span>`
    : status.syncing
    ? "Syncing…"
    : `Synced ${timeAgo(status.lastSyncedAt)}`;

  const usage = storageUsage(readSnapshot());
  const tooBig = usage.bytes >= STORAGE_WARN_BYTES;
  const usageLine = `<div class="caption" style="margin-bottom:8px;${tooBig ? "color:var(--bad);" : ""}" id="account-storage-line">Saved progress: ${formatBytes(usage.bytes)}${tooBig ? " — getting close to this browser's storage limit; download a backup from My Progress" : ""}</div>`;

  section.innerHTML = `
    <div class="caption" style="margin-bottom:6px;">${status.email || "Signed in"}</div>
    <div class="caption" style="margin-bottom:${usageLine ? 4 : 8}px;">${statusLine}</div>
    ${usageLine}
    <button id="account-sync-btn" type="button" class="btn btn-outline btn-sm btn-block" style="margin-bottom:6px;">Sync Now</button>
    <button id="account-signout-btn" type="button" class="btn btn-outline btn-sm btn-block">Sign Out</button>
  `;
  document.getElementById("account-sync-btn").addEventListener("click", syncNow);
  document.getElementById("account-signout-btn").addEventListener("click", signOut);
}

let initialized = false;
let pollingStarted = false;

/** Wires up the Account section's rendering. Call once at startup,
 * regardless of sign-in state — the auth gate in main.js is
 * responsible for actually driving Identity's init/login/logout
 * events and calling the functions below when they happen, so this
 * module and the gate never both try to initialize Identity. */
export function initCloudSyncUI() {
  if (initialized) return;
  initialized = true;
  onSyncStatusChange(renderAccountUI);
  status.available = !!window.netlifyIdentity;
  renderAccountUI();
}

/** Call once Identity confirms a signed-in user (from the gate's
 * init/login handlers). Starts the periodic background sync the first
 * time this fires; safe to call again on a later login. */
export function cloudSyncSignedIn(email) {
  status.available = true;
  status.signedIn = true;
  status.email = email;
  notify();
  syncNow();

  if (!pollingStarted) {
    pollingStarted = true;
    setInterval(checkForChanges, TIMING.CHECK_MS);
    document.addEventListener("visibilitychange", () => {
      if (!status.signedIn) return;
      if (document.visibilityState === "hidden") {
        flushIfPending();
      } else if (Date.now() - lastContactAt >= TIMING.RETURN_MS || hasChanges(safeGetJSON(SHADOW_KEY, {}), readSnapshot())) {
        runGuarded();
      }
    });
    // iPhone Safari is more reliable about "pagehide" than "visibilitychange" when a tab is closed.
    window.addEventListener("pagehide", flushIfPending);
    window.addEventListener("online", () => {
      if (status.signedIn) {
        nextAttemptAt = 0;
        runGuarded();
      }
    });
  }
}

/** Call when Identity reports no signed-in user (or on logout). */
export function cloudSyncSignedOut() {
  status.signedIn = false;
  status.email = null;
  status.lastSyncedAt = null;
  lastSeen = null;
  firstChangeAt = 0;
  lastChangeAt = 0;
  lastContactAt = 0;
  failures = 0;
  nextAttemptAt = 0;
  notify();
}
