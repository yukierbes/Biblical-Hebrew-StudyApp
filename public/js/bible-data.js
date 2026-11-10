import { authFetch } from "./auth-fetch.js";

const _cache = {};

// Reading's chapter files (dataset names that start with "rd-") are asked for with the version of the Reading data
// (from the index), so the service worker can keep a saved chapter until the data really changes, not just until the
// next release of the app. See sw.js.
const _versions = {};
export function setDatasetVersion(prefix, version) {
  _versions[prefix] = version;
}

/** The address of a dataset, with the data version added for Reading chapters when it is known. */
export function datasetUrl(dataset) {
  const base = `/.netlify/functions/get-data?dataset=${dataset}`;
  const v = dataset.startsWith("rd-") ? _versions["rd-"] : "";
  return v ? `${base}&v=${v}` : base;
}

/**
 * Loads one Bible practice dataset ("bible-article" or "bible-dagesh") once (through the sign-in-gated
 * get-data function, like the other datasets). Shape — see scripts/build-bible.mjs:
 *   { source, patterns[], counts{}, passages[{title,note,verses[]}], verses{ref:[word…]},
 *     examples[{ref,wi,pattern}], held[] }
 * A word is { t: text with "/" between its pieces, a?: index of the article piece,
 * p?: pattern id (or "held"), i?: 1 for the question-marker ה, m?: 1 maqqef, s?: 1 sof pasuq }.
 */
export async function loadBibleData(dataset = "bible-article") {
  if (_cache[dataset]) return _cache[dataset];
  const res = await authFetch(datasetUrl(dataset));
  if (!res.ok) throw new Error(`Failed to load Bible data (${res.status})`);
  _cache[dataset] = await res.json();
  return _cache[dataset];
}

export function getBibleData(dataset = "bible-article") {
  return _cache[dataset];
}
