/** Stable identity for an accent row (there's no explicit id column). */
export function accentRowKey(row) {
  return [row.Type, row.HebrewName, row.EnglishName].join("||");
}

/** Apply the sidebar's Type / Group filters to the accent rows. A row
 * with a blank Group (every Conjunctive row) always passes the Group
 * filter — there's no synthetic "blank" option to select, same as how
 * blank Categories are handled on the Vocabulary pages. */
export function applyAccentFilters(rows, filters) {
  let out = rows;
  if (filters.Type && filters.Type.length) {
    const set = new Set(filters.Type);
    out = out.filter((r) => set.has(r.Type));
  }
  if (filters.Group && filters.Group.length) {
    const set = new Set(filters.Group);
    out = out.filter((r) => !r.Group || set.has(r.Group));
  }
  return out;
}
