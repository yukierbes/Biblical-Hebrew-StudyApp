import { authFetch } from "./auth-fetch.js";

// The Consonants and Vowels datasets, loaded once through the same
// Identity-gated get-data function as every other dataset (never a plain
// static path), then cached.
//
// Consonants row: { Name, Form, Transliteration, Category, Keyboard }.
//   `Category` may hold several comma-separated values ("Guttural, Matres
//   Lectionis") or be blank on purpose. Letters that change with a dagesh
//   (bet, gimel, dalet, kaf, pe', tav) are TWO rows: "bet" and "bet (dagesh)".
// Vowels row: { Class, Name, Length, Form, Pronunciation, Keyboard }.
//   `Form` starts with a dotted circle (◌) marking where the vowel attaches.
//   qameṣ and qameṣ-ḥaṭuf are written with the very same mark.

let _consonants = null;
let _vowels = null;

async function fetchDataset(name) {
  const res = await authFetch(`/.netlify/functions/get-data?dataset=${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name} data (${res.status})`);
  return res.json();
}

export async function loadLetterData() {
  if (!_consonants || !_vowels) {
    [_consonants, _vowels] = await Promise.all([fetchDataset("consonants"), fetchDataset("vowels")]);
  }
  return { consonants: _consonants, vowels: _vowels };
}

export function getConsonantRows() {
  return _consonants ? _consonants.rows : [];
}
export function getConsonantCategoryOrder() {
  return _consonants ? _consonants.categoryOrder : [];
}
export function getVowelRows() {
  return _vowels ? _vowels.rows : [];
}
export function getVowelClassOrder() {
  return _vowels ? _vowels.classOrder : [];
}
export function getVowelLengthOrder() {
  return _vowels ? _vowels.lengthOrder : [];
}
