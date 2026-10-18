import { authFetch } from "./auth-fetch.js";

const _cache = {};

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
  const res = await authFetch(`/.netlify/functions/get-data?dataset=${dataset}`);
  if (!res.ok) throw new Error(`Failed to load Bible data (${res.status})`);
  _cache[dataset] = await res.json();
  return _cache[dataset];
}

export function getBibleData(dataset = "bible-article") {
  return _cache[dataset];
}
