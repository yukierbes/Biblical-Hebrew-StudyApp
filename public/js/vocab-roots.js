import { vocabRowKey } from "./vocab-overrides.js";
import { sameRoot } from "./root-search.js";

const ROOTS_KEY = "hebrewVerbApp:vocabRoots";

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

function loadRoots() {
  return safeGetJSON(ROOTS_KEY, {});
}

function saveRoots(map) {
  safeSetJSON(ROOTS_KEY, map);
}

/** The root currently assigned to `row`, or "" if none. Each word
 * belongs to at most one root — assigning a new one replaces the old. */
export function getRootForWord(row) {
  return loadRoots()[vocabRowKey(row)] || "";
}

/** Assigns `root` to `row` (an empty/blank value clears it). */
export function setRootForWord(row, root) {
  const map = loadRoots();
  const clean = (root || "").trim();
  const key = vocabRowKey(row);
  if (clean) map[key] = clean;
  else delete map[key];
  saveRoots(map);
}

export function removeRootForWord(row) {
  setRootForWord(row, "");
}

export function hasRoot(row) {
  return !!getRootForWord(row);
}

/** Every root name currently in use, alphabetically. */
export function getRootOptions() {
  const set = new Set(Object.values(loadRoots()).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Word count per root across `allRows`, for the root admin view. */
export function getRootWordCounts(allRows) {
  const counts = new Map();
  for (const row of allRows) {
    const root = getRootForWord(row);
    if (!root) continue;
    counts.set(root, (counts.get(root) || 0) + 1);
  }
  return counts;
}

const UNDO_KEY = "hebrewVerbApp:vocabRootsUndo";

/** Remembers what each of `rows` had before a bulk change, so the change can be undone (one level: the last change). */
function snapshotRoots(rows, map, label, root) {
  const prev = {};
  for (const row of rows) {
    const key = vocabRowKey(row);
    prev[key] = map[key] || "";
  }
  safeSetJSON(UNDO_KEY, { label, root: root || "", count: rows.length, at: Date.now(), prev });
}

/** The last bulk root change that can still be undone: { label, root, count, at } — or null. */
export function getLastRootChange() {
  const u = safeGetJSON(UNDO_KEY, null);
  return u && u.prev ? { label: u.label, root: u.root, count: u.count, at: u.at } : null;
}

/** Puts every word touched by the last bulk root change back as it was. Returns how many words were restored (0 if nothing to undo). */
export function undoLastRootChange() {
  const u = safeGetJSON(UNDO_KEY, null);
  if (!u || !u.prev) return 0;
  const map = loadRoots();
  for (const [key, prevRoot] of Object.entries(u.prev)) {
    if (prevRoot) map[key] = prevRoot;
    else delete map[key];
  }
  saveRoots(map);
  try {
    localStorage.removeItem(UNDO_KEY);
  } catch (e) {
    /* storage unavailable */
  }
  return Object.keys(u.prev).length;
}

/** An existing root spelled differently but made of the same consonants (e.g. מלך vs מלכ), so a new assignment reuses it. */
export function findExistingRoot(rootRaw) {
  return getRootOptions().find((r) => sameRoot(r, rootRaw)) || "";
}

/** Assigns `root` to every row in `rows` (overwrites each word's prior
 * root, if any — one root per word). A blank `root` clears them all.
 * The change can be undone with undoLastRootChange(). */
export function setRootForRows(rows, root) {
  const map = loadRoots();
  const clean = (root || "").trim();
  snapshotRoots(rows, map, clean ? `Set root ${clean}` : "Cleared roots", clean);
  for (const row of rows) {
    const key = vocabRowKey(row);
    if (clean) map[key] = clean;
    else delete map[key];
  }
  saveRoots(map);
}

/** Clears the root from every row in `rows`, regardless of what it was (undoable). */
export function removeRootFromRows(rows) {
  setRootForRows(rows, "");
}

/** Renames a root everywhere it's used. Merges into an existing root of
 * the new name (case-insensitively) if there is one. */
export function renameRoot(allRows, oldRootRaw, newRootRaw) {
  const old = (oldRootRaw || "").trim();
  let next = (newRootRaw || "").trim();
  if (!old || !next || old === next) return;

  const existingMatch = getRootOptions().find((r) => r.toLowerCase() === next.toLowerCase() && r !== old);
  if (existingMatch) next = existingMatch;

  const map = loadRoots();
  for (const [key, root] of Object.entries(map)) {
    if (root === old) map[key] = next;
  }
  saveRoots(map);
}

/** Clears a root from every word currently assigned to it. */
export function deleteRoot(allRows, rootRaw) {
  const target = (rootRaw || "").trim();
  if (!target) return;
  const map = loadRoots();
  for (const key of Object.keys(map)) {
    if (map[key] === target) delete map[key];
  }
  saveRoots(map);
}

/** How many words currently have a root assigned, for achievement/progress tracking. */
export function getRootedWordCount() {
  return Object.keys(loadRoots()).length;
}

/** Filters `rows` down to those whose root is in `selectedRoots`. null (every
 * root ticked) means no Root filter — everything passes, rooted or not; an empty
 * list means nothing is ticked, so nothing passes. */
export function applyRootFilter(rows, selectedRoots) {
  if (!Array.isArray(selectedRoots)) return rows;
  const set = new Set(selectedRoots);
  return rows.filter((r) => set.has(getRootForWord(r)));
}
