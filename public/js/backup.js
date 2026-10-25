// Back up and restore all progress as one file.
//
// What is in a backup: everything the app syncs between devices - spaced-repetition schedules, quiz history,
// streaks, stars and notes, custom categories and roots, saved filters, Bible answers, reading log, and so on
// (every browser-storage key that starts with "hebrewVerbApp:", except cloud sync's own bookkeeping).
// What is not: display settings that belong to one device (theme, pattern, Hebrew size) and half-finished rounds.

const PREFIX = "hebrewVerbApp:";
const SKIP = new Set(["hebrewVerbApp:cloudSync:meta", "hebrewVerbApp:cloudSync:shadow"]);
export const BACKUP_FORMAT = "hebrew-study-app-backup";
export const BACKUP_VERSION = 1;

/** The keys a backup holds, with their saved text. */
export function collectProgress(storage = localStorage) {
  const keys = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(PREFIX) && !SKIP.has(k)) keys[k] = storage.getItem(k);
  }
  return keys;
}

/** A backup as a plain object, ready to be written out as JSON. */
export function createBackup({ storage = localStorage, now = new Date() } = {}) {
  const keys = collectProgress(storage);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), keyCount: Object.keys(keys).length, keys };
}

/** "hebrew-study-backup-2026-10-25.json" */
export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `hebrew-study-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/**
 * Reads backup text and says whether it can be used: { ok: true, backup, keyCount, createdAt } or
 * { ok: false, error }. Only keys the app itself owns are accepted, and every value must be text.
 */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "That file is not a backup from this app (it could not be read)." };
  }
  if (!obj || obj.format !== BACKUP_FORMAT || typeof obj.keys !== "object" || obj.keys === null || Array.isArray(obj.keys)) {
    return { ok: false, error: "That file is not a backup from this app." };
  }
  if (obj.version > BACKUP_VERSION) {
    return { ok: false, error: "That backup was made by a newer version of the app. Please update the app first." };
  }
  const keys = {};
  let skipped = 0;
  for (const [k, v] of Object.entries(obj.keys)) {
    if (k.startsWith(PREFIX) && !SKIP.has(k) && typeof v === "string") keys[k] = v;
    else skipped += 1;
  }
  const keyCount = Object.keys(keys).length;
  if (keyCount === 0) return { ok: false, error: "That backup has no progress in it." };
  return { ok: true, backup: { ...obj, keys }, keyCount, skipped, createdAt: obj.createdAt || null };
}

/**
 * Puts a backup's keys into this browser.
 *   mode "overwrite"    every key in the backup replaces what is here (anything not in the file is left alone)
 *   mode "fill"         only keys that are not here yet are added
 * Returns { written, skipped }.
 */
export function restoreBackup(backup, { mode = "overwrite", storage = localStorage } = {}) {
  let written = 0;
  let skipped = 0;
  for (const [k, v] of Object.entries(backup.keys)) {
    if (mode === "fill" && storage.getItem(k) !== null) {
      skipped += 1;
      continue;
    }
    try {
      storage.setItem(k, v);
      written += 1;
    } catch (e) {
      skipped += 1; // storage full or unavailable
    }
  }
  return { written, skipped };
}
