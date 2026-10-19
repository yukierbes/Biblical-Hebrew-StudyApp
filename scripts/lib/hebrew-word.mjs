// A small analyzer for the vowels, shevas and syllables of ONE written Hebrew word, following the owner's rule
// sheets ("Shevas" and "Qameṣ vs Qameṣ-ḥaṭuf") and the vowel table on the Vowels page.
//
// Pure functions (no browser, no files). Marks are read by code point; the text is never changed.
//
// What it decides, and how sure it is:
//  * Every letter's vowel, dagesh, meteg and accent marks.
//  * Which letters carry a full vowel (a syllable nucleus) and which letters are vowel letters (matres).
//  * Which syllable is accented, from the accent mark. A word with no accent mark that stands before a maqqef
//    is unaccented. Any other word without a usable accent mark has an UNKNOWN stress.
//  * Whether a sheva is vocal or silent, by the owner's rules (decideSheva).
//  * Whether a qameṣ is a qameṣ or a qameṣ-ḥaṭuf (classifyQamets).
// Whenever a rule cannot be applied with confidence the answer is null and the case is held back, never guessed.

import { analyzeWord as analyzeDagesh } from "./dagesh-rules.mjs";

const SHEVA = "\u05b0", H_QAMETS = "\u05b3", HIRIQ = "\u05b4", TSERE = "\u05b5", SEGOL = "\u05b6", PATAH = "\u05b7";
const QAMETS = "\u05b8", HOLAM = "\u05b9", HOLAM2 = "\u05ba", QIBBUTS = "\u05bb", DAGESH = "\u05bc", METEG = "\u05bd", QAMETS_QATAN = "\u05c7";
const HATAFS = new Set(["\u05b1", "\u05b2", H_QAMETS]);
const FULL = { [HIRIQ]: "hiriq", [TSERE]: "tsere", [SEGOL]: "segol", [PATAH]: "patah", [QAMETS]: "qames", [HOLAM]: "holem", [HOLAM2]: "holem", [QIBBUTS]: "qibbuts", [QAMETS_QATAN]: "qames-hatuf" };

// Accent marks that sit on the first or last letter of a word without showing where the stress is.
const POSTPOSITIVE = new Set([0x0592, 0x0598, 0x0599, 0x05a9]); // segolta, zarqa, pashta, telisha qetana
const PREPOSITIVE_OR_POSTPOSITIVE = new Set([0x059a, 0x05ad, 0x05a0, 0x059d, 0x0593, ...POSTPOSITIVE]);
const CONJUNCTIVE = new Set([0x05a3, 0x05a4, 0x05a5, 0x05a6, 0x05a7, 0x05a8, 0x05aa]); // munaḥ, mahapakh, merkha …
const isLetter = (c) => c >= "\u05d0" && c <= "\u05ea";
const isAccentMark = (c) => c >= "\u0591" && c <= "\u05af";

/** Word text -> [{ ch, vowel, full, dagesh, meteg, accents[] }] */
export function parseLetters(text) {
  const out = [];
  for (const ch of text) {
    if (isLetter(ch)) out.push({ ch, marks: "", accents: [] });
    else if (out.length) {
      const l = out[out.length - 1];
      l.marks += ch;
      if (isAccentMark(ch)) l.accents.push(ch.codePointAt(0));
    }
  }
  for (const l of out) {
    l.dagesh = l.marks.includes(DAGESH);
    l.meteg = l.marks.includes(METEG);
    const full = [...l.marks].find((c) => FULL[c]);
    const hataf = [...l.marks].find((c) => HATAFS.has(c));
    l.full = full ? FULL[full] : null;
    l.hataf = hataf || null;
    l.vowel = l.full ? l.full : l.hataf ? "hataf" : l.marks.includes(SHEVA) ? "sheva" : null;
  }
  return out;
}

/**
 * Analyses one word. opts: { stemStart (index of the first root letter, default 0), beforeMaqqef, lastInVerse }.
 */
export function analyzeWord(text, opts = {}) {
  const L = parseLetters(text);
  const n = L.length;
  const an = { text, letters: L, stemStart: opts.stemStart || 0, kind: new Array(n).fill(null), mater: new Array(n).fill(false), nucleus: [], stress: { known: false, nucleus: null }, shevas: new Map(), dag: analyzeDagesh(text) };
  const dagAt = new Map(an.dag.map((d) => [d.li, d]));
  an.dagPattern = (i) => (dagAt.get(i) ? dagAt.get(i).pattern : null);

  // 1. nuclei (letters with a full vowel, or a vav that is itself the vowel)
  L.forEach((l, i) => {
    if (l.full) {
      an.nucleus.push(i);
      an.kind[i] = l.full;
    } else if (l.ch === "ו" && l.dagesh && !l.vowel) {
      an.nucleus.push(i);
      an.kind[i] = "shureq";
    }
  });
  // vowel letters (matres) and the longer kinds of ṣere, ḥireq and ḥolem
  an.nucleus.forEach((i) => {
    const next = L[i + 1];
    const plain = next && !next.vowel && !next.dagesh;
    if (an.kind[i] === "tsere" && plain && next.ch === "י") (an.kind[i] = "tsere-yod"), (an.mater[i + 1] = true);
    else if (an.kind[i] === "hiriq" && plain && next.ch === "י") (an.kind[i] = "hiriq-yod"), (an.mater[i + 1] = true);
    else if (an.kind[i] === "holem" && L[i].ch === "ו" && i > 0 && (!L[i - 1].vowel || L[i - 1].vowel === "sheva")) an.kind[i] = "holem-vav";
    else if (an.kind[i] === "holem" && plain && next.ch === "ו") (an.kind[i] = "holem-vav"), (an.mater[i + 1] = true);
    if (plain && next.ch === "א") an.mater[i + 1] = true; // a silent alef
    if (plain && next.ch === "ה" && i + 1 === n - 1 && ["qames", "segol", "tsere", "holem"].includes(an.kind[i])) an.mater[i + 1] = true; // a final he
  });

  // 2. stress, from the accent marks. A word may carry several marks: take the pause (disjunctive) accent if there
  // is one, otherwise the last mark. Marks that sit on the first or last letter without showing the stress are
  // handled apart: a single postpositive mark means the last syllable is stressed.
  const lastWord = !!opts.lastInVerse;
  const marks = [];
  L.forEach((l, i) => l.accents.forEach((c) => marks.push({ i, code: c })));
  if (lastWord) L.forEach((l, i) => l.meteg && marks.push({ i, code: "silluq" })); // the verse-final silluq looks like a meteg
  const usable = marks.filter((m) => !PREPOSITIVE_OR_POSTPOSITIVE.has(m.code));
  const post = marks.filter((m) => POSTPOSITIVE.has(m.code));
  let stressLetter = null;
  let unknownStress = false;
  if (usable.length) {
    const disj = usable.filter((m) => !CONJUNCTIVE.has(m.code));
    stressLetter = (disj.length ? disj[disj.length - 1] : usable[usable.length - 1]).i;
  } else if (post.length) {
    const repeated = post.find((m) => post.filter((x) => x.code === m.code).length > 1);
    stressLetter = repeated ? repeated.i : null;
    if (!repeated) an.stress = { known: true, nucleus: an.nucleus.length ? an.nucleus[an.nucleus.length - 1] : null };
  } else if (marks.length) unknownStress = true; // only a prepositive mark
  if (stressLetter !== null) {
    const a0 = stressLetter;
    let st = null;
    if (L[a0].full || an.kind[a0] === "shureq") st = a0;
    else if (L[a0].vowel === "sheva" || L[a0].vowel === "hataf") st = an.nucleus.find((x) => x > a0) ?? null;
    else if (!L[a0].vowel) st = an.nucleus.find((x) => x === a0 + 1 && ["shureq", "holem-vav"].includes(an.kind[x])) ?? [...an.nucleus].reverse().find((x) => x < a0) ?? null;
    an.stress = st === null || st === undefined ? { known: false, nucleus: null } : { known: true, nucleus: st };
  } else if (!marks.length && opts.beforeMaqqef) an.stress = { known: true, nucleus: null }; // unaccented: a word before a maqqef
  else if (unknownStress) an.stress = { known: false, nucleus: null };
  const accentLetters = marks.map((m) => m.i);
  // a meteg that is not the verse-final accent
  an.metegAt = (i) => L[i] && L[i].meteg && !(lastWord && accentLetters.includes(i));
  an.accented = (nuc) => (!an.stress.known ? null : an.stress.nucleus === nuc);

  // 3. shevas, left to right
  L.forEach((l, i) => {
    if (l.vowel === "sheva") an.shevas.set(i, decideSheva(an, i));
  });
  return an;
}

// ---------------------------------------------------------------- shevas

const VOCAL = (id) => ({ kind: "vocal", reason: id });
const SILENT = (id) => ({ kind: "silent", reason: id });
const HELD = (why) => ({ kind: null, reason: null, why });

/** The owner's rules for a simple sheva. Returns { kind: "vocal"|"silent"|null, reason }. */
export function decideSheva(an, i) {
  const L = an.letters;
  const n = L.length;
  const cur = L[i];
  const prev = L[i - 1];
  const next = L[i + 1];
  if (i === n - 1 && cur.dagesh) return HELD("a final letter with both a dagesh and a sheva");
  if (i === 0 || i === an.stemStart) return VOCAL("v_first"); // under the first consonant of a form
  if (an.dagPattern(i) === "forte") return VOCAL("v_dagesh"); // under a consonant with a dagesh
  if (i === n - 1 && cur.ch === "ך") return SILENT("s_kaf"); // in a final kaf
  if (next && next.vowel === "sheva") return i + 1 === n - 1 ? SILENT("s_end") : SILENT("s_first"); // two shevas together
  if (prev && prev.vowel === "sheva") return i === n - 1 ? SILENT("s_end") : VOCAL("v_second");
  if (next && next.dagesh && an.dagPattern(i + 1) === "lene") return SILENT("s_lene"); // right before a dagesh lene
  // after a vowel: the nucleus is the previous letter, or the one before a vowel letter
  let p = i - 1;
  if (p >= 0 && an.mater[p]) p -= 1;
  if (p < 0 || !an.nucleus.includes(p)) return HELD("the sheva does not directly follow a vowel");
  const kind = an.kind[p];
  const accented = an.accented(p);
  if (L[p].meteg && an.metegAt(p)) return VOCAL("v_meteg"); // after a meteg
  if (["tsere-yod", "hiriq-yod", "holem-vav", "shureq"].includes(kind)) return VOCAL("v_long");
  if (["patah", "segol", "hiriq", "qibbuts", "qames-hatuf"].includes(kind)) {
    if (accented === false) return SILENT("s_short"); // follows a short unaccented vowel
    return HELD(accented === null ? "the accent of the vowel before it is not known" : "a short accented vowel before a sheva is not covered by the rules");
  }
  if (kind === "qames" || kind === "tsere" || kind === "holem") {
    if (accented === null) return HELD("the accent of the vowel before it is not known");
    if (accented) return SILENT("s_accented"); // after an accented changeably long vowel
    // An unaccented qameṣ before a sheva with no meteg could be a long qameṣ with a vocal sheva (שָׁמְרוּ) or a
    // qameṣ-ḥaṭuf with a silent sheva (חָכְמָה): the spelling alone does not say, so the case is held back.
    if (kind === "qames") return HELD("an unaccented qameṣ before a sheva with no meteg: vocal or silent depends on the word");
    return VOCAL("v_long"); // after an unaccented changeably long vowel
  }
  return HELD("unexpected vowel");
}

// ---------------------------------------------------------------- qameṣ

/**
 * Sorts one qameṣ (the letter at index i). Returns { pattern, closed } or { pattern: null, why }.
 * Patterns: qames_open, qames_vocal_sheva, qames_closed_accented, qames_closed_meteg,
 *           hatuf_closed, hatuf_hataf, hatuf_before_hatuf (the last is filled in by classifyAllQamets).
 */
export function classifyQamets(an, i) {
  const L = an.letters;
  const n = L.length;
  const next = L[i + 1];
  let j = i + 1;
  while (j < n && an.mater[j]) j++; // vowel letters do not close a syllable
  const after = L[j];
  let closed;
  if (!after) closed = false; // the word ends: an open syllable (the last letter is the qameṣ or its vowel letter)
  else if (after.hataf === H_QAMETS && j === i + 1) return { pattern: "hatuf_hataf", closed: false }; // before a ḥāṭef-qāmeṣ
  else if (after.vowel === "hataf") closed = false;
  else if (after.vowel === "sheva") {
    const s = an.shevas.get(j);
    if (!s || !s.kind) return { pattern: null, why: s ? s.why : "the sheva after it could not be sorted" };
    if (s.kind === "vocal") return { pattern: "qames_vocal_sheva", closed: false };
    closed = true;
  } else if (after.dagesh && after.full) closed = an.dagPattern(j) === "forte";
  else if (after.full) closed = false;
  else if (!after.vowel) {
    // a letter with no vowel of its own, not a vowel letter
    if (L[j + 1] && an.nucleus.includes(j + 1) && ["shureq", "holem-vav"].includes(an.kind[j + 1])) closed = false; // it begins the next syllable
    else if (after.ch === "י" || after.ch === "ו") return { pattern: null, why: "a י or ו without a vowel after the qameṣ (a diphthong)" };
    else closed = true;
  } else closed = false;
  if (!closed) return { pattern: "qames_open", closed: false };
  const accented = an.accented(i);
  if (accented === null) return { pattern: null, why: "the accent is not known (no accent mark and not before a maqqef)" };
  if (accented) return { pattern: "qames_closed_accented", closed: true };
  if (an.metegAt(i)) return { pattern: "qames_closed_meteg", closed: true };
  return { pattern: "hatuf_closed", closed: true };
}

/** Sorts every qameṣ in a word: [{ li, pattern | null, why? }]. A U+05C7 (qameṣ qaṭan) is taken as a qameṣ-ḥaṭuf outright. */
export function classifyAllQamets(an) {
  const L = an.letters;
  const res = [];
  L.forEach((l, i) => {
    if (l.full === "qames-hatuf") res.push({ li: i, pattern: "hatuf_closed", note: "written as a qameṣ-ḥaṭuf" });
    else if (l.full === "qames") res.push({ li: i, ...classifyQamets(an, i) });
  });
  // an open qameṣ right before another qameṣ-ḥaṭuf is itself a qameṣ-ḥaṭuf
  for (let k = 0; k < res.length - 1; k++) {
    const a = res[k];
    const b = res[k + 1];
    if (a.pattern === "qames_open" && b.li === a.li + 1 && (b.pattern || "").startsWith("hatuf") && an.accented(a.li) === false) a.pattern = "hatuf_before_hatuf"; // (a stressed qameṣ stays a qameṣ)
  }
  return res;
}

/** Every sheva in a word: [{ li, kind, reason, why? }] */
export function classifyAllShevas(an) {
  return [...an.shevas.entries()].map(([li, r]) => ({ li, kind: r.kind, pattern: r.reason, why: r.why }));
}
