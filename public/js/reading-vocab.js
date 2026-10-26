// How much of a reading passage you already know, and the "got it / missed it" self-check.
//
// A reading word is matched to your vocabulary list by its dictionary form, compared by consonants only
// (vowels and accents are ignored, and each vocabulary entry's several forms, such as "אִישׁ ; אֲנָשִׁים", are all tried).
// A word counts as KNOWN when its vocabulary word has been started: it appears in your review schedule in
// any vocabulary mode (flashcards, typing or games). Proper names are left out of the percentage, as are
// words with no dictionary form. This is an estimate: a few dictionary forms differ from the vocabulary
// list's spelling, and words that are not in the vocabulary list at all cannot count as known.

import { getVocabRows } from "./vocab-data.js";
import { vocabRowKey } from "./vocab-overrides.js";
import { getScheduleEntries, recordItemResult } from "./srs.js";

/** Every vocabulary spaced-repetition mode a word can be started in. */
export const VOCAB_MODES = [
  "vocab-typing-hebrew",
  "vocab-typing-english",
  "vocab-flashcards-hebrew",
  "vocab-flashcards-english",
  "vocab-games-hebrew",
  "vocab-games-english",
];
/** The mode a missed reading word is sent to (the one the Daily Challenge and Study Session draw vocabulary from). */
export const REVIEW_MODE = "vocab-typing-hebrew";

// The lexicon files one root where the vocabulary list uses another (Strong's H3212 "to go" is the same verb as הָלַךְ).
const ALIASES = { ילך: "הלך" };

export const consonants = (s) => (s || "").replace(/[^\u05d0-\u05ea]/g, "");
const canon = (s) => ALIASES[consonants(s)] || consonants(s);

/** Map of consonants -> vocabulary rows, every form of every entry. */
export function buildVocabIndex(rows = getVocabRows()) {
  const index = new Map();
  for (const row of rows) {
    const forms = String(row.Hebrew || "").split(/\s*[;,،/]\s*/);
    for (const form of forms) {
      const k = canon(form);
      if (!k) continue;
      const list = index.get(k) || [];
      if (!list.includes(row)) list.push(row);
      index.set(k, list);
    }
  }
  return index;
}

/** Keys of the vocabulary words you have started (they have a review schedule in any vocabulary mode). */
export function startedVocabKeys(modes = VOCAB_MODES) {
  const set = new Set();
  for (const mode of modes) for (const key of Object.keys(getScheduleEntries(mode))) set.add(key);
  return set;
}

const isJoiner = (w) => !!(w.m || w.s);
const isName = (w) => (w.parts || []).some((p) => /proper name/.test(p[1] || ""));

/** What a reading word is: a counted word with its vocabulary matches, or something left out. */
export function describeWord(w, index) {
  if (!w || isJoiner(w)) return { kind: "skip", rows: [] };
  if (!w.lem) return { kind: "skip", rows: [] };
  if (isName(w)) return { kind: "name", rows: [] };
  return { kind: "word", rows: index.get(canon(w.lem)) || [] };
}

/**
 * How much of the passage's words are known.
 *   words      counted words (names and words with no dictionary form are not counted)
 *   known      those whose vocabulary word has been started
 *   notStarted in the vocabulary list but not started yet
 *   notInList  not in the vocabulary list at all
 *   pct        known / words, rounded (null when there are no counted words)
 *   unknown    [{ ref, wi, lem, gl, inList }] for the words not known
 */
export function passageKnowledge(refs, verses, index, started) {
  let words = 0;
  let known = 0;
  let notStarted = 0;
  let notInList = 0;
  let names = 0;
  const unknown = [];
  for (const ref of refs) {
    (verses[ref] || []).forEach((w, wi) => {
      const d = describeWord(w, index);
      if (d.kind === "name") names += 1;
      if (d.kind !== "word") return;
      words += 1;
      if (d.rows.some((r) => started.has(vocabRowKey(r)))) known += 1;
      else {
        if (d.rows.length) notStarted += 1;
        else notInList += 1;
        unknown.push({ ref, wi, lem: w.lem, gl: w.gl || "", inList: d.rows.length > 0 });
      }
    });
  }
  return { words, known, notStarted, notInList, names, pct: words ? Math.round((known / words) * 100) : null, unknown };
}

// ---------------------------------------------------------------------
// Self-check: "got it / missed it" for each word after seeing the English
// ---------------------------------------------------------------------

const CHECK_KEY = "hebrewVerbApp:readingCheck"; // { "Gen.1.1": { "3": 1 (got it) | 0 (missed) } }
const MISSED_KEY = "hebrewVerbApp:readingMissedWords"; // words missed that are not in the vocabulary list

const read = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && typeof v === "object" ? v : fallback;
  } catch (e) {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* not critical */
  }
};

export const getSelfCheck = () => read(CHECK_KEY, {});
/** Words missed that are not in the vocabulary list: { consonants: { lem, gl, n, last } } */
export const getMissedWords = () => read(MISSED_KEY, {});

/**
 * Records "got it" (true) or "missed it" (false) for one word of a verse. A miss on a word that is in the
 * vocabulary list sends that vocabulary word to review (it is answered wrong in the review schedule, so it is due now);
 * a miss on a word that is not in the list is remembered in a short list. "Got it" changes nothing in the review
 * schedule, so a click is never mistaken for studying. Returns { sentToReview, notInList }.
 */
export function setWordCheck(ref, wi, w, got, index) {
  const all = getSelfCheck();
  const verse = all[ref] || {};
  const before = verse[wi];
  verse[wi] = got ? 1 : 0;
  all[ref] = verse;
  write(CHECK_KEY, all);
  const result = { sentToReview: 0, notInList: false };
  if (got || before === 0) return result; // only the first miss is acted on
  const d = describeWord(w, index);
  if (d.kind !== "word") return result;
  if (d.rows.length) {
    for (const row of d.rows) recordItemResult(REVIEW_MODE, vocabRowKey(row), false);
    result.sentToReview = d.rows.length;
  } else {
    const missed = getMissedWords();
    const k = canon(w.lem);
    const prev = missed[k] || { lem: w.lem, gl: w.gl || "", n: 0 };
    missed[k] = { ...prev, n: prev.n + 1, last: Date.now() };
    write(MISSED_KEY, missed);
    result.notInList = true;
  }
  return result;
}

/** { got, missed } counted over the words of a verse. */
export function verseCheckSummary(ref) {
  const verse = getSelfCheck()[ref] || {};
  const vals = Object.values(verse);
  return { got: vals.filter((v) => v === 1).length, missed: vals.filter((v) => v === 0).length };
}
