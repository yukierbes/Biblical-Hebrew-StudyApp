import { authFetch } from "./auth-fetch.js";

let _cache = null;

/**
 * Load the verb dataset once and cache it. Fetched through the
 * Identity-gated get-data function — never a plain static path — since
 * this data must not be publicly reachable without signing in.
 * Shape: { datasets: string[], data: { [sheetName]: Row[] } }
 */
export async function loadAllData() {
  if (_cache) return _cache;
  const res = await authFetch("/.netlify/functions/get-data?dataset=verbs");
  if (!res.ok) {
    throw new Error(`Failed to load verb data (${res.status})`);
  }
  _cache = await res.json();
  return _cache;
}

export function getAvailableDatasets() {
  if (!_cache) return [];
  return _cache.datasets;
}

/**
 * Return a flat array of rows for the given dataset (sheet) names,
 * each tagged with a `Dataset` field, mirroring core/data.py's
 * load_verb_data().
 */
export function loadVerbData(selectedDatasets) {
  if (!_cache) return [];
  const frames = [];
  for (const name of selectedDatasets) {
    const rows = _cache.data[name];
    if (!rows) continue;
    for (const r of rows) {
      frames.push({ ...r, Dataset: name });
    }
  }
  return frames;
}
