// Verbs in context: parsing a verb (binyan, mode, person-gender-number, prefix, pronominal suffix) from the Open
// Scriptures tagging, and sorting its ROOT into the strong verb or one of the ten weak verb types.
//
// The tagging gives the binyan, mode and person-gender-number of each verb directly; the app only reads them.
// The root comes from the Open Scriptures Hebrew lexicon (data-source/bible/HebrewStrong.xml, CC BY 4.0): the
// verb's dictionary number is looked up and its consonants and vowels decide the type.
//
// Pure functions (no browser, no files).

import { parseLetters } from "./hebrew-word.mjs";
import { pieceInfo } from "./dataset-builder.mjs";

export const BINYANIM = [
  { id: "qal", label: "Qal", explain: "Qal is the simple, basic stem, usually active." },
  { id: "niphal", label: "Niphal", explain: "Niphal is the stem that is usually passive, reflexive or middle." },
  { id: "piel", label: "Piel", explain: "Piel is the intensive stem, with a doubled middle consonant." },
  { id: "pual", label: "Pual", explain: "Pual is the passive of Piel." },
  { id: "hiphil", label: "Hiphil", explain: "Hiphil is the causative stem, with a prefixed ה." },
  { id: "hophal", label: "Hophal", explain: "Hophal is the passive of Hiphil." },
  { id: "hithpael", label: "Hithpael", explain: "Hithpael is the reflexive or reciprocal stem, with a prefixed הִת." },
];
const STEM = { q: "qal", N: "niphal", p: "piel", P: "pual", h: "hiphil", H: "hophal", t: "hithpael" };
export const MODES = ["Perfect", "Imperfect", "Jussive", "Cohortative", "Imperative", "Infinitive Construct", "Infinitive Absolute", "Active Participle", "Passive Participle"];
const MODE_OF = { p: "Perfect", q: "Perfect", i: "Imperfect", w: "Imperfect", j: "Jussive", h: "Cohortative", v: "Imperative", c: "Infinitive Construct", a: "Infinitive Absolute", r: "Active Participle", s: "Passive Participle" };
export const FINITE_PGN = ["1CS", "2MS", "2FS", "3MS", "3FS", "1CP", "2MP", "2FP", "3MP", "3FP"];
export const VERB_PGN = [...FINITE_PGN, "MS", "FS", "MP", "FP", "None"];
export const PREFIX_KINDS = [
  { id: "none", label: "None" },
  { id: "conjunction", label: "Vav Conjunction" },
  { id: "consecutive", label: "Vav Consecutive" },
  { id: "interrogative", label: "Interrogative" },
  { id: "article", label: "Definite Article" },
  { id: "preposition", label: "Preposition" },
];
export const SUFFIX_CHOICES = ["None", ...FINITE_PGN];

export const VERB_TYPES = [
  { id: "strong", label: "Strong Verb", explain: "A strong verb has no weak consonant in its root (no guttural, no א, נ, י or ו in a weak position, no final ה, and no doubled root consonant)." },
  { id: "i_guttural", label: "I-Guttural", explain: "The first root consonant is a guttural (ה, ח or ע)." },
  { id: "i_aleph", label: "I-Aleph", explain: "The first root consonant is א." },
  { id: "i_nun", label: "I-Nun", explain: "The first root consonant is נ, which often assimilates into the next consonant (this includes לקח)." },
  { id: "i_vav_yod", label: "I-Vav / I-Yod", explain: "The first root consonant is a vav or a yod (written י in the lexicon)." },
  { id: "ii_guttural", label: "II-Guttural", explain: "The second root consonant is a guttural (א, ה, ח, ע or ר)." },
  { id: "ii_vav_yod", label: "II-Vav / II-Yod (Hollow)", explain: "The second root consonant is a vav or a yod, and the root is “hollow”: the middle consonant is a vowel in many forms." },
  { id: "ii_geminate", label: "II-Geminate", explain: "The second and third root consonants are the same." },
  { id: "iii_guttural", label: "III-Guttural", explain: "The third root consonant is ח or ע." },
  { id: "iii_aleph", label: "III-Aleph", explain: "The third root consonant is א." },
  { id: "iii_he", label: "III-He", explain: "The third root consonant is ה." },
];

/** Strong's number -> the lexicon's Hebrew word (with vowels). */
export function parseLexicon(xml) {
  const map = new Map();
  const re = /<entry id="H(\d+)"[^>]*>\s*<w[^>]*>([^<]*)<\/w>/g;
  let m;
  while ((m = re.exec(xml))) map.set(m[1], m[2]);
  return map;
}

/** The weak types of a lexicon word, as an array of ids (empty = strong), or null when it is not a three-letter root. */
export function verbTypesOf(word) {
  const ls = parseLetters(word);
  if (ls.length !== 3) return null;
  const [a, b, c] = ls.map((l) => l.ch);
  const t = [];
  if ("החע".includes(a)) t.push("i_guttural");
  if (a === "א") t.push("i_aleph");
  if (a === "נ" || a + b + c === "לקח") t.push("i_nun");
  if (a === "י") t.push("i_vav_yod");
  if ("אהחער".includes(b)) t.push("ii_guttural");
  const mid = ls[1];
  if ((b === "ו" || b === "י") && !mid.full && (b === "י" || mid.marks.includes("\u05b9") || mid.dagesh)) t.push("ii_vav_yod");
  if (b === c) t.push("ii_geminate");
  if ("חע".includes(c)) t.push("iii_guttural");
  if (c === "א") t.push("iii_aleph");
  if (c === "ה") t.push("iii_he");
  return t;
}

export const VERB_PATTERNS = BINYANIM.map((b) => ({ id: b.id, group: b.id, label: b.label, explain: b.explain }));
export const VERB_GROUPS = BINYANIM.map((b) => ({ id: b.id, label: b.label, patterns: [b.id] }));

/** Parses one verb. `lexicon` is the Map from parseLexicon. Returns null for a word without a verb piece. */
export function classifyVerb(w, mp, ctx, lexicon) {
  const info = pieceInfo(w, mp);
  if (!info) return null;
  const vi = info.tags.findIndex((t) => /^V[a-zA-Z][a-z]/.test(t));
  if (vi < 0) return null;
  const tag = info.tags[vi];
  const held = (why) => ({ pattern: null, why });
  const binyan = STEM[tag[1]];
  if (!binyan) return held("a stem other than the seven main binyanim");
  const type = tag[2];
  const mode = MODE_OF[type];
  if (!mode) return held("a verb form I do not recognise");
  let pgn;
  if ("pqiwjhv".includes(type)) {
    const person = tag[3], g = tag[4], n = tag[5];
    if (g === "c" && person !== "1") return held("a common-gender form (the gender is not marked)");
    pgn = `${person}${g.toUpperCase()}${n.toUpperCase()}`;
    if (!FINITE_PGN.includes(pgn)) return held("a person-gender-number outside the ten in the paradigm");
  } else if ("rs".includes(type)) {
    const g = tag[3], n = tag[4];
    if (!"mf".includes(g) || !"sp".includes(n)) return held("a participle whose gender or number is not simple");
    pgn = `${g.toUpperCase()}${n.toUpperCase()}`;
  } else pgn = "None";

  const before = info.tags.slice(0, vi);
  const after = info.tags.slice(vi + 1);
  let prefix;
  if (!before.length) prefix = "none";
  else if (before.length === 1 && before[0] === "C") prefix = "wq".includes(type) ? "consecutive" : "conjunction";
  else if (before.length === 1 && before[0] === "Ti") prefix = "interrogative";
  else if (before.length === 1 && before[0] === "Td") prefix = "article";
  else if (before.length === 1 && (before[0] === "R" || before[0] === "Rd")) prefix = "preposition";
  else return held("more than one prefix, or a prefix that is not one of the five");
  let suffix;
  if (!after.length) suffix = "None";
  else if (after.length === 1 && /^Sp[123][mfc][sp]$/.test(after[0])) {
    const s = after[0];
    suffix = `${s[2]}${s[3].toUpperCase()}${s[4].toUpperCase()}`;
    if (!FINITE_PGN.includes(suffix)) return held("a pronominal suffix whose gender is not marked");
  } else return held("a suffix that is not a pronominal suffix (for example a directional ה)");

  const num = (w.lemma || "").split("/").pop().split(" ")[0];
  const lex = lexicon && lexicon.get(num);
  const types = lex ? verbTypesOf(lex) : null;
  if (!types) return held("the root of this verb could not be worked out");

  const from = info.starts[vi];
  const to = info.ends[vi];
  // the root's consonants (the lexicon word without vowels), so the page can ask the learner to type it first
  const root = parseLetters(lex).map((l) => l.ch).join("");
  return { pattern: binyan, extra: [mode, pgn, prefix, suffix, types, from, to, root], example: { mode, pgn, prefix, suffix, types, from, to, root } };
}
