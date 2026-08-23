// This module handles two related but separate things once someone is
// signed in (sign-in itself is mandatory app-wide — see the auth gate
// in main.js, which owns all Netlify Identity init/login/logout
// events and calls the functions below in response):
//   1. The sidebar's Account section (status display, sign out, manual sync)
//   2. Background sync of progress data to Netlify Blobs via /sync
// If Netlify Identity isn't configured on this deployment at all, the
// gate in main.js keeps the whole app locked, and this module's UI
// simply reports that cloud sync isn't available.

import { renderStreakDisplay } from "./srs.js";
import { authFetch } from "./auth-fetch.js";

const SYNC_PREFIX = "hebrewVerbApp:";
const META_KEY = "hebrewVerbApp:cloudSync:meta";
const SHADOW_KEY = "hebrewVerbApp:cloudSync:shadow";
const SYNC_ENDPOINT = "/.netlify/functions/sync";
const POLL_INTERVAL_MS = 20000;

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

/** Compares the current snapshot to the last-known one (the "shadow")
 * to find keys that changed since the last sync, bumping each one's
 * meta timestamp to now. This is what lets the server's per-key merge
 * (see netlify/functions/sync.js) tell "this device's copy is newer"
 * apart from "this device just hasn't touched that key in a while" —
 * without needing to instrument every single localStorage write in
 * the app individually. */
function updateMetaForLocalChanges() {
  const shadow = safeGetJSON(SHADOW_KEY, {});
  const current = readSnapshot();
  const meta = readMeta();
  let changed = false;

  for (const [k, v] of Object.entries(current)) {
    if (shadow[k] !== v) {
      meta[k] = Date.now();
      changed = true;
    }
  }
  for (const k of Object.keys(shadow)) {
    if (!(k in current)) {
      meta[k] = Date.now();
      changed = true;
    }
  }

  if (changed) {
    safeSetJSON(META_KEY, meta);
    safeSetJSON(SHADOW_KEY, current);
  }
  return meta;
}

function applyMergedResult(merged) {
  for (const [k, v] of Object.entries(merged.snapshot || {})) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* storage unavailable — not critical */
    }
  }
  safeSetJSON(META_KEY, merged.meta || {});
  safeSetJSON(SHADOW_KEY, merged.snapshot || {});
  // The streak/daily-goal widget is the one piece of UI present on
  // every page, so it's worth refreshing immediately — other pages
  // just read fresh from localStorage the next time they're opened.
  renderStreakDisplay();
}

let syncInFlight = null;

/**
 * Pushes the current local state to the server and immediately re-applies
 * whatever comes back — the server does its own per-key merge against
 * whatever it already had stored (see the function's mergeBundles), so
 * one round trip here is a full two-way sync, not just an upload. Safe
 * to call often; concurrent calls share the same in-flight request.
 */
export async function syncNow() {
  if (!status.signedIn) return;
  if (syncInFlight) return syncInFlight;

  status.syncing = true;
  notify();

  syncInFlight = (async () => {
    try {
      const meta = updateMetaForLocalChanges();
      const snapshot = readSnapshot();
      const res = await authFetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot, meta }),
      });
      if (!res.ok) throw new Error(`Sync failed (HTTP ${res.status})`);
      const merged = await res.json();
      applyMergedResult(merged);
      status.error = null;
      status.lastSyncedAt = Date.now();
    } catch (e) {
      status.error = e.message || "Sync failed";
    } finally {
      status.syncing = false;
      notify();
      syncInFlight = null;
    }
  })();

  return syncInFlight;
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

  if (!status.available) {
    section.innerHTML = `<div class="caption">Cloud sync isn't available on this deployment.</div>`;
    return;
  }

  if (!status.signedIn) {
    section.innerHTML = `<div class="caption">Not signed in.</div>`;
    return;
  }

  const statusLine = status.error
    ? `<span style="color:var(--bad);">Sync error: ${status.error}</span>`
    : status.syncing
    ? "Syncing…"
    : `Synced ${timeAgo(status.lastSyncedAt)}`;

  section.innerHTML = `
    <div class="caption" style="margin-bottom:6px;">${status.email || "Signed in"}</div>
    <div class="caption" style="margin-bottom:8px;">${statusLine}</div>
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
    setInterval(() => {
      if (status.signedIn) syncNow();
    }, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && status.signedIn) syncNow();
    });
  }
}

/** Call when Identity reports no signed-in user (or on logout). */
export function cloudSyncSignedOut() {
  status.signedIn = false;
  status.email = null;
  status.lastSyncedAt = null;
  notify();
}
