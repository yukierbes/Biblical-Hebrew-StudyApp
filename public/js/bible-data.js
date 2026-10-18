import { authFetch } from "./auth-fetch.js";

let _cache = null;

/**
 * Loads the "Definite Article in Context" dataset once (through the sign-in-gated
 * get-data function, like the other datasets). Shape — see scripts/build-bible.mjs:
 *   { source, patterns[], counts{}, passages[{title,note,verses[]}], verses{ref:[word…]},
 *     examples[{ref,wi,pattern}], held[] }
 * A word is { t: text with "/" between its pieces, a?: index of the article piece,
 * p?: pattern id (or "held"), i?: 1 for the question-marker ה, m?: 1 maqqef, s?: 1 sof pasuq }.
 */
export async function loadBibleData() {
  if (_cache) return _cache;
  const res = await authFetch("/.netlify/functions/get-data?dataset=bible-article");
  if (!res.ok) throw new Error(`Failed to load Bible data (${res.status})`);
  _cache = await res.json();
  return _cache;
}

export function getBibleData() {
  return _cache;
}
