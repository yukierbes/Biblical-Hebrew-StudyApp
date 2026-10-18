// Rules for sorting the dot inside a Hebrew letter (◌ּ) into dagesh lene, dagesh forte and
// mappiq, following the owner's rule sheet "Hebrew Dagesh" and "Gutturals Reject Dagesh".
//
// Pure functions (no browser, no files) so they can be tested and used by
// scripts/build-bible.mjs. Hebrew is compared by code point and never normalised.
//
// The rule sheet's order of questions for a dagesh in a BeGaD KeFaT letter:
//   1. Is the consonant a BeGaD KeFaT consonant (ב ג ד כ פ ת)?
//   2. Is it preceded by silence (the start of the word, or a silent sheva)?
//   Both yes = dagesh lene; otherwise dagesh forte.
// Mappiq is a dot only in a ה at the end of a word. The dot in a vav with no vowel of its
// own is the šureq vowel, not a dagesh, and is skipped.
//
// What the rules cannot decide with confidence is reported as null (and held back, never
// used as a practice example): for instance a sheva after a long vowel, where it is hard to
// tell from the spelling alone whether the sheva is silent or vocal.

const DAGESH = "\u05bc";
const SHEVA = "\u05b0";
const BEGADKEFAT = new Set([..."בגדכפת"]);
const GUTTURALS = new Set([..."אהחער"]);
const SHORT_VOWELS = new Set(["\u05b4", "\u05b6", "\u05b7", "\u05bb"]); // ḥireq, segol, pataḥ, qibbuṣ
const LONG_OR_AMBIGUOUS = new Set(["\u05b5", "\u05b8", "\u05b9", "\u05ba"]); // ṣere, qameṣ, ḥolem

export const DAGESH_PATTERNS = [
  {
    id: "lene",
    group: "lene",
    label: "Dagesh Lene",
    explain:
      "A dagesh lene occurs only in a BeGaD KeFaT letter (ב ג ד כ פ ת) that starts a syllable: it is preceded by silence, such as the beginning of a word, or by a silent sheva. It does not double the letter.",
  },
  {
    id: "forte",
    group: "forte",
    label: "Dagesh Forte",
    explain:
      "A dagesh forte doubles the letter. It can stand in any consonant except the five gutturals (א ה ח ע ר). In a BeGaD KeFaT letter it is a forte when a vowel comes before it. If the letter has a sheva under it, that sheva is vocal and the dagesh is a forte.",
  },
  {
    id: "mappiq",
    group: "mappiq",
    label: "Mappiq",
    explain:
      "A mappiq is not a dagesh, but it looks the same. It occurs only in a ה at the end of a word. The dot marks the ה as a consonant, not a vowel letter, so the ה is pronounced and closes the final syllable.",
  },
];

export const DAGESH_GROUPS = [
  { id: "lene", label: "Dagesh Lene", patterns: ["lene"] },
  { id: "forte", label: "Dagesh Forte", patterns: ["forte"] },
  { id: "mappiq", label: "Mappiq", patterns: ["mappiq"] },
];

/** Splits written text into [{ letter, marks }] (marks = everything up to the next letter). */
export function letters(text) {
  const out = [];
  for (const ch of text) {
    if (ch >= "\u05d0" && ch <= "\u05ea") out.push({ letter: ch, marks: "" });
    else if (out.length) out[out.length - 1].marks += ch;
  }
  return out;
}

const hasVowel = (marks) => /[\u05b1-\u05bb]/.test(marks.replace(DAGESH, "")) && !/^[\u05bc]*$/.test(marks);
const vowelOf = (marks) => [...marks].find((c) => c >= "\u05b1" && c <= "\u05bb" && c !== DAGESH) || null;

/**
 * Sorts every dot in a word. `text` is the whole word with its pieces joined (no "/").
 * Returns [{ li, letter, kind: "dagesh" | "mappiq" | "shureq", pattern | null, reason? }]
 * where li is the position of the letter among the word's letters.
 */
export function analyzeWord(text) {
  const ls = letters(text);
  const out = [];
  ls.forEach((cur, i) => {
    if (!cur.marks.includes(DAGESH)) return;
    const own = vowelOf(cur.marks);
    if (cur.letter === "ו" && !own && !cur.marks.includes("\u05b9")) {
      out.push({ li: i, letter: cur.letter, kind: "shureq", pattern: null });
      return;
    }
    if (cur.letter === "ה" && i === ls.length - 1) {
      out.push({ li: i, letter: cur.letter, kind: "mappiq", pattern: "mappiq" });
      return;
    }
    if (GUTTURALS.has(cur.letter)) {
      out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: null, reason: `a dot in the guttural ${cur.letter}` });
      return;
    }
    if (!BEGADKEFAT.has(cur.letter)) {
      out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: "forte" });
      return;
    }
    // A BeGaD KeFaT letter: is it preceded by silence?
    if (i === 0) {
      out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: "lene" });
      return;
    }
    const prev = ls[i - 1];
    const prevVowel = vowelOf(prev.marks);
    if (prevVowel && prevVowel !== SHEVA) {
      out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: "forte" });
      return;
    }
    if (prev.marks.includes(SHEVA)) {
      // Silent or vocal sheva? Word-initial and doubled letters have a vocal sheva.
      if (i - 1 === 0 || prev.marks.includes(DAGESH)) {
        out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: "forte" });
        return;
      }
      const before = ls[i - 2];
      const bv = vowelOf(before.marks);
      if (bv && SHORT_VOWELS.has(bv) && !/[יו]/.test(prev.letter)) {
        out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: "lene" }); // silent sheva after a short vowel
        return;
      }
      out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: null, reason: "sheva before it: silent or vocal is not clear from the spelling" });
      return;
    }
    if (!prevVowel && /[יוא]/.test(prev.letter)) {
      out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: "forte" }); // a vowel letter (mater) before it
      return;
    }
    out.push({ li: i, letter: cur.letter, kind: "dagesh", pattern: null, reason: "no vowel written before it" });
  });
  return out;
}
