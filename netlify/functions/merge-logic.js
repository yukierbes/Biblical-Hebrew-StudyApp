/** Merges two { snapshot, meta } bundles key-by-key: for each key present
 * in either side, whichever side has the newer `meta` timestamp for that
 * key wins. This lets two devices sync without one wholesale clobbering
 * the other's more recent changes to a different part of the data. */
export function mergeBundles(a, b) {
  const snapshot = {};
  const meta = {};
  const aSnap = a.snapshot || {};
  const bSnap = b.snapshot || {};
  const aMeta = a.meta || {};
  const bMeta = b.meta || {};
  const keys = new Set([...Object.keys(aSnap), ...Object.keys(bSnap)]);

  for (const key of keys) {
    const aTime = aMeta[key] || 0;
    const bTime = bMeta[key] || 0;
    if (aTime >= bTime) {
      if (key in aSnap) snapshot[key] = aSnap[key];
      meta[key] = aTime || bTime;
    } else {
      if (key in bSnap) snapshot[key] = bSnap[key];
      meta[key] = bTime;
    }
  }
  return { snapshot, meta };
}
