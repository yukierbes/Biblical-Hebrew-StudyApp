import { vocabRowKey } from "./vocab-overrides.js";

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

/** Assigns `root` to every row in `rows` (overwrites each word's prior
 * root, if any — one root per word). A blank `root` clears them all. */
export function setRootForRows(rows, root) {
  for (const row of rows) setRootForWord(row, root);
}

/** Clears the root from every row in `rows`, regardless of what it was. */
export function removeRootFromRows(rows) {
  for (const row of rows) removeRootForWord(row);
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

/** Filters `rows` down to those whose root is in `selectedRoots` (an
 * empty selection means "no Root filter" — everything passes). */
export function applyRootFilter(rows, selectedRoots) {
  if (!selectedRoots || selectedRoots.length === 0) return rows;
  const set = new Set(selectedRoots);
  return rows.filter((r) => set.has(getRootForWord(r)));
}
