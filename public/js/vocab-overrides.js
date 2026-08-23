import { getCategoryOrder } from "./vocab-data.js";

const CATEGORY_OVERRIDES_KEY = "hebrewVerbApp:vocabCategoryOverrides";
const CUSTOM_CATEGORIES_KEY = "hebrewVerbApp:customCategories";

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
    // Storage unavailable (private browsing, quota, etc.) — not critical.
  }
}

/** Stable identity for a vocab row (there's no explicit id column) —
 * shared with the other vocab pages' own copies of this same key shape. */
export function vocabRowKey(row) {
  return [row.Lesson, row.Hebrew, row.English].join("||");
}

function loadOverrides() {
  return safeGetJSON(CATEGORY_OVERRIDES_KEY, {});
}

function saveOverrides(map) {
  safeSetJSON(CATEGORY_OVERRIDES_KEY, map);
}

function loadCustomCategories() {
  return safeGetJSON(CUSTOM_CATEGORIES_KEY, []);
}

function saveCustomCategories(list) {
  safeSetJSON(CUSTOM_CATEGORIES_KEY, list);
}

/** The row's original categories as shipped in the dataset (normally
 * one, occasionally blank; split defensively in case of a stray
 * comma/semicolon in the source data). */
function baseCategoriesOf(row) {
  return (row.Category || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Categories currently assigned to `row` — a saved override if one
 * exists, otherwise the row's original Category from the dataset. */
export function getCategoriesForRow(row) {
  const overrides = loadOverrides();
  const key = vocabRowKey(row);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key];
  }
  return baseCategoriesOf(row);
}

export function getCategoriesDisplay(row) {
  return getCategoriesForRow(row).join(", ");
}

/** Save which categories `row` belongs to (replaces any prior override
 * for this word; de-duplicates and drops blanks). */
export function setCategoriesForRow(row, categories) {
  const overrides = loadOverrides();
  const clean = [...new Set((categories || []).map((c) => (c || "").trim()).filter(Boolean))];
  overrides[vocabRowKey(row)] = clean;
  saveOverrides(overrides);
}

/** Clears a word's override, reverting it to the dataset's original Category. */
export function resetCategoriesForRow(row) {
  const overrides = loadOverrides();
  delete overrides[vocabRowKey(row)];
  saveOverrides(overrides);
}

export function hasCategoryOverride(row) {
  const overrides = loadOverrides();
  return Object.prototype.hasOwnProperty.call(overrides, vocabRowKey(row));
}

/**
 * Adds a brand-new category name to the pick list. Case-insensitively
 * de-duplicates against `existingCategories` (pass the current full
 * option list) so "verbs" and "Verbs" don't become two entries. Returns
 * the name to actually use (the existing match, if any, or the newly
 * saved custom category) — or null if given a blank name.
 */
export function addCustomCategory(name, existingCategories) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const already = (existingCategories || []).find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (already) return already;
  const custom = loadCustomCategories();
  custom.push(trimmed);
  saveCustomCategories(custom);
  return trimmed;
}

/**
 * The full set of category options to offer in filters/pickers: the
 * dataset's original categories, any custom ones a person has added,
 * and — as a safety net — any category currently referenced by a saved
 * override that isn't already in either list.
 */
export function getCategoryOptions() {
  const set = new Set(getCategoryOrder());
  for (const c of loadCustomCategories()) set.add(c);
  const overrides = loadOverrides();
  for (const cats of Object.values(overrides)) {
    for (const c of cats) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** How many brand-new categories a person has created (distinct from
 * the dataset's original ones), for achievement/progress tracking. */
export function getCustomCategoryCount() {
  return loadCustomCategories().length;
}

/**
 * Shared filtering logic for the Vocabulary Review / Flashcards / Typing
 * pages. A word matches the Category filter if ANY of its currently
 * assigned categories (override-aware, possibly more than one) is in
 * the selected set — not just a single exact field match.
 */
export function applyVocabFilters(rows, filters, minFrequency) {
  let out = rows;
  for (const col of ["Lesson", "POS"]) {
    const selected = filters[col];
    if (selected && selected.length) {
      const set = new Set(selected);
      out = out.filter((r) => set.has(r[col]));
    }
  }
  if (filters.Category && filters.Category.length) {
    const set = new Set(filters.Category);
    out = out.filter((r) => getCategoriesForRow(r).some((c) => set.has(c)));
  }
  const min = parseInt(minFrequency, 10);
  if (!Number.isNaN(min)) {
    out = out.filter((r) => r.Frequency >= min);
  }
  return out;
}

// ================= Bulk assignment & category admin =================

/** Adds `categoriesToAdd` to every row in `rows` (union with whatever
 * categories each word already has — never removes anything). */
export function addCategoriesToRows(rows, categoriesToAdd) {
  const toAdd = (categoriesToAdd || []).map((c) => (c || "").trim()).filter(Boolean);
  if (toAdd.length === 0) return;
  for (const row of rows) {
    const current = new Set(getCategoriesForRow(row));
    for (const c of toAdd) current.add(c);
    setCategoriesForRow(row, [...current]);
  }
}

/** Removes `categoryToRemove` from every row in `rows` that currently
 * has it (leaves rows that don't have it untouched). */
export function removeCategoryFromRows(rows, categoryToRemove) {
  const target = (categoryToRemove || "").trim();
  if (!target) return;
  for (const row of rows) {
    const current = getCategoriesForRow(row);
    if (!current.includes(target)) continue;
    setCategoriesForRow(row, current.filter((c) => c !== target));
  }
}

/** Word count per category across `allRows` (override-aware), for the
 * category admin view. */
export function getCategoryWordCounts(allRows) {
  const counts = new Map();
  for (const row of allRows) {
    for (const c of getCategoriesForRow(row)) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Renames a category everywhere it's used: in the custom-category list
 * (if it's a custom one) and across every word currently assigned to
 * it — converting implicit dataset-Category membership into an
 * explicit override where needed. If the new name already matches an
 * existing category (case-insensitively), merges into that one instead
 * of creating a near-duplicate.
 */
export function renameCategory(allRows, oldName, newNameRaw) {
  const old = (oldName || "").trim();
  let newName = (newNameRaw || "").trim();
  if (!old || !newName || old === newName) return;

  const existingMatch = getCategoryOptions().find((c) => c.toLowerCase() === newName.toLowerCase() && c !== old);
  if (existingMatch) newName = existingMatch;

  const custom = loadCustomCategories();
  const idx = custom.indexOf(old);
  if (idx !== -1) custom[idx] = newName;
  saveCustomCategories(custom);

  for (const row of allRows) {
    const current = getCategoriesForRow(row);
    if (!current.includes(old)) continue;
    setCategoriesForRow(row, current.map((c) => (c === old ? newName : c)));
  }
}

/** Removes a category entirely: from the custom-category list and from
 * every word currently assigned to it. */
export function deleteCategory(allRows, name) {
  const target = (name || "").trim();
  if (!target) return;
  const custom = loadCustomCategories();
  saveCustomCategories(custom.filter((c) => c !== target));
  removeCategoryFromRows(allRows, target);
}
