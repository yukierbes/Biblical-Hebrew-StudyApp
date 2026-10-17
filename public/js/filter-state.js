// Shared rules for the sidebar filters on the Consonants, Vowels, Vocabulary and
// Accents pages (Review, Flashcards, Typing and Games alike).
//
// A filter's stored value means:
//   null / undefined  every option is ticked (the default) — no restriction at all,
//                     so a word with no category, say, is still included
//   [ ... some ... ]  only those options are ticked — rows must match one of them
//   []                nothing is ticked — NOTHING is shown, and the page asks the
//                     person to tick something (this matches the Verbs pages,
//                     which say "Select at least one dataset" when none is ticked)
//
// The checkbox widget (widgets.js) turns "every box ticked" back into null, so the
// two ways of getting there are the same thing.

/** True when this filter has been cleared completely. */
export const isFilterEmpty = (value) => Array.isArray(value) && value.length === 0;

/** The labels of every filter that is cleared, e.g. ["Lesson", "Part of Speech"].
 *  `labels` maps a filter key to the name shown in the sidebar. */
export function emptyFilterLabels(filters, labels) {
  return Object.keys(labels)
    .filter((key) => isFilterEmpty(filters && filters[key]))
    .map((key) => labels[key]);
}

/** True when at least one filter has been cleared. */
export function hasEmptyFilter(filters, labels) {
  return emptyFilterLabels(filters, labels).length > 0;
}

/**
 * The message a page shows instead of its table / cards / quiz / game list.
 * When a filter is cleared it says which one to tick ("Select at least one Lesson
 * to begin studying."); otherwise it returns `fallback` (the page's usual
 * "nothing matches" wording).
 */
export function selectFiltersMessage(filters, labels, fallback) {
  const empty = emptyFilterLabels(filters, labels);
  if (empty.length === 0) return fallback;
  const parts = empty.map((l) => `at least one ${l}`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Select ${list} in the sidebar filters to begin studying.`;
}

/** A saved preset from before this change used [] to mean "everything"; turn those
 *  into null so old presets still show everything. Presets saved since carry
 *  fv: 2 and are used as they are. */
export function upgradeSnapshotFilters(snapshot) {
  if (!snapshot || snapshot.fv === 2 || !snapshot.filters) return snapshot;
  const filters = {};
  for (const [k, v] of Object.entries(snapshot.filters)) filters[k] = Array.isArray(v) && v.length === 0 ? null : v;
  return { ...snapshot, filters };
}
