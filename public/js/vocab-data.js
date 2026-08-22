import { authFetch } from "./auth-fetch.js";

let _cache = null;

/**
 * Load the vocabulary dataset once and cache it, through the
 * Identity-gated get-data function (never a plain static path). Shape:
 * { rows: Row[], lessonOrder: string[], posOrder: string[],
 * categoryOrder: string[] }. `lessonOrder` preserves the true
 * pedagogical sequence (1A, 1B, ... 5Z, 5AA, 5BB) rather than a plain
 * alphabetical sort, since that wouldn't match the source textbook.
 */
export async function loadVocabData() {
  if (_cache) return _cache;
  const res = await authFetch("/.netlify/functions/get-data?dataset=vocabulary");
  if (!res.ok) {
    throw new Error(`Failed to load vocabulary data (${res.status})`);
  }
  _cache = await res.json();
  return _cache;
}

export function getVocabRows() {
  return _cache ? _cache.rows : [];
}

export function getLessonOrder() {
  return _cache ? _cache.lessonOrder : [];
}

export function getPosOrder() {
  return _cache ? _cache.posOrder : [];
}

export function getCategoryOrder() {
  return _cache ? _cache.categoryOrder : [];
}
