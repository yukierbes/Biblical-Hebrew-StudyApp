import { authFetch } from "./auth-fetch.js";

let _cache = null;

/**
 * Load the Hebrew accents dataset once and cache it, through the
 * Identity-gated get-data function (never a plain static path). Shape:
 * { rows: Row[], typeOrder: string[], groupOrder: string[] }. Row:
 * { Type, Group, HebrewName, EnglishName, Symbol, Placement, Keyboard }.
 * `Group` is blank ("") for every Conjunctive row by design —
 * conjunctive accents aren't graded into strength groups the way
 * disjunctives are — so `groupOrder` only lists the non-blank values
 * ("1"-"4") a Group filter should offer.
 */
export async function loadAccentData() {
  if (_cache) return _cache;
  const res = await authFetch("/.netlify/functions/get-data?dataset=accents");
  if (!res.ok) {
    throw new Error(`Failed to load accents data (${res.status})`);
  }
  _cache = await res.json();
  return _cache;
}

export function getAccentRows() {
  return _cache ? _cache.rows : [];
}

export function getTypeOrder() {
  return _cache ? _cache.typeOrder : [];
}

export function getGroupOrder() {
  return _cache ? _cache.groupOrder : [];
}
