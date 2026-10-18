// Rules for sorting the Hebrew definite article (הַ) into the patterns taught in the
// owner's own rule sheets (Hebrew Definite Article, Gutturals Reject Dagesh, Hebrew Dagesh).
//
// Pure functions, no browser or file access, so they can be tested and used by the build
// script (scripts/build-bible.mjs). Hebrew is compared by code point and never normalised:
// the order of vowel points and accent marks in the source text is left exactly as written.
//
// How the article is FOUND: the Open Scriptures Hebrew Bible tags it ("Td") as its own
// piece of the word, e.g. הַ/שָּׁמַיִם. How it is SORTED here: from what is written —
// the article's vowel, the next letter, and whether that letter carries a dagesh.

const DAGESH = "\u05bc";
const SHEVA = "\u05b0";
const HIRIQ = "\u05b4";
const SEGOL = "\u05b6";
const PATAH = "\u05b7";
const QAMETS = "\u05b8";
const QIBBUTS = "\u05bb";
const SHORT_VOWELS = new Set([HIRIQ, SEGOL, PATAH, QIBBUTS]);
// Consonants that reject a dagesh. "Compensatory lengthening" for א ר (and ע); "implicit
// doubling" for ה ח (and ע) — ע may do either (owner's sheet).
const COMPENSATORY = new Set(["א", "ר", "ע"]);
const IMPLICIT = new Set(["ה", "ח", "ע"]);
// The SQNMLVY consonants: sibilants (ש ס צ) and י ו ל מ נ ק.
const SQNMLVY = new Set([..."שצסיולמנק"]);

/** The patterns, with the wording shown in the app (vowel names spelled as on the Vowels page). */
export const ARTICLE_PATTERNS = [
  {
    id: "forte",
    group: "standard",
    label: "Standard Form",
    explain:
      "Standard form of the article: הַ with a dagesh forte in the first consonant of the noun, which doubles it.",
  },
  {
    id: "compensatory",
    group: "compensatory",
    label: "Compensatory Lengthening",
    explain:
      "The noun begins with a guttural that rejects the dagesh (א, ר, or sometimes ע). The article’s short vowel lengthens within its own vowel class: pataḥ becomes qameṣ, so הַ becomes הָ. This is compensatory lengthening.",
  },
  {
    id: "implicit",
    group: "implicit",
    label: "Implicit Doubling",
    explain:
      "The noun begins with ה, ח, or sometimes ע. The guttural rejects the dagesh, but the article’s vowel does not change: it stays הַ (pataḥ), and the guttural is understood to be doubled by implication. This is implicit doubling.",
  },
  {
    id: "segol",
    group: "segol",
    label: "Segol",
    explain:
      "Exception: when the guttural is ע or ה with an unaccented qameṣ, the article’s pataḥ becomes segol: הֶ.",
  },
  {
    id: "sqnmlvy_sheva",
    group: "sqnmlvy",
    label: "SQNMLVY: vocal sheva",
    explain:
      "SQNMLVY exception: a sibilant or one of י ו ל מ נ ק that has a vocal sheva may lose the dagesh forte, so the article is הַ with no doubling written.",
  },
  {
    id: "sqnmlvy_extended",
    group: "sqnmlvy",
    label: "SQNMLVY: extended environment",
    explain:
      "SQNMLVY exception, extended environment: a SQNMLVY consonant with a short vowel, standing before another doubled consonant, may lose the dagesh forte after the article.",
  },
  {
    id: "pausal",
    group: "pausal",
    label: "Pausal Lengthening",
    explain:
      "In a pausal form (at the end of a verse or major clause, or before a strong disjunctive accent) a short vowel often lengthens within its own vowel class, the same change as compensatory lengthening: pataḥ becomes qameṣ. Here the article’s pataḥ has lengthened to qameṣ (הָ) in a pausal form, even though no guttural forced it.",
  },
];

/** The answer choices shown to the learner. SQNMLVY is one choice; the two cases inside it are told apart in the explanation. */
export const ARTICLE_GROUPS = [
  { id: "standard", label: "Standard Form", patterns: ["forte"] },
  { id: "compensatory", label: "Compensatory Lengthening", patterns: ["compensatory"] },
  { id: "implicit", label: "Implicit Doubling", patterns: ["implicit"] },
  { id: "segol", label: "Segol", patterns: ["segol"] },
  { id: "sqnmlvy", label: "SQNMLVY", patterns: ["sqnmlvy_sheva", "sqnmlvy_extended"] },
  { id: "pausal", label: "Pausal Lengthening", patterns: ["pausal"] },
];

/**
 * Cases decided by the owner rather than by the spelling rules. Key: "ref|the word's consonants only" (so the match does not depend on how the marks are ordered).
 * Gen 40:3 הַטַּבָּחִים is Standard Form: in this digital text the dagesh in ט is not written.
 */
export const ARTICLE_OVERRIDES = {
  "Gen.40.3|הטבחים": {
    pattern: "forte",
    note: "In this digital text the dagesh in the ט is not written, but the word is standard form: הַ + a dagesh forte in the first letter of the noun.",
  },
};

// Disjunctive accents (U+0591–U+05A1), which mark a pause: a word carrying one is in pausal position.
const hasDisjunctive = (text) => /[\u0591-\u05a1]/.test(text);

/** Splits a written segment into [{ letter, marks }, ...] (marks = everything up to the next letter). */
export function letters(seg) {
  const out = [];
  for (const ch of seg) {
    if (ch >= "\u05d0" && ch <= "\u05ea") out.push({ letter: ch, marks: "" });
    else if (out.length) out[out.length - 1].marks += ch;
  }
  return out;
}

/**
 * Sorts one article. `artSeg` is the written article (e.g. "הַ"), `nextSeg` the written text
 * right after it (e.g. "שָּׁמַיִם"). Returns a pattern id, or null when the case does not
 * match the owner's rules and needs a human decision (it is then held back, never used).
 */
export function classifyArticle(artSeg, nextSeg, wordText = "") {
  const art = letters(artSeg)[0];
  const nextLetters = letters(nextSeg);
  if (!art || art.letter !== "ה" || !nextLetters.length) return null;
  const n = nextLetters[0];
  const hasDagesh = n.marks.includes(DAGESH);
  const artVowel = art.marks.includes(PATAH) ? "patah" : art.marks.includes(QAMETS) ? "qamets" : art.marks.includes(SEGOL) ? "segol" : null;
  if (!artVowel) return null;

  if (artVowel === "patah" && hasDagesh) return "forte";
  if (hasDagesh) return null;

  if (artVowel === "qamets" && COMPENSATORY.has(n.letter) && n.letter !== "ה") return "compensatory";
  if (artVowel === "patah" && IMPLICIT.has(n.letter)) return "implicit";
  if (artVowel === "segol" && (n.letter === "ע" || n.letter === "ה")) return "segol";

  if (artVowel === "patah" && SQNMLVY.has(n.letter)) {
    if (n.marks.includes(SHEVA)) return "sqnmlvy_sheva";
    const second = nextLetters[1];
    const shortVowel = [...n.marks].some((c) => SHORT_VOWELS.has(c));
    if (shortVowel && second && second.marks.includes(DAGESH)) return "sqnmlvy_extended";
  }
  // The article's pataḥ lengthened to qameṣ where no guttural forces it, in a word carrying a pause accent.
  if (artVowel === "qamets" && hasDisjunctive(wordText)) return "pausal";
  return null; // e.g. הָ in a word with no pause accent, or the article before a letter not covered by your sheets
}

/** Why a case was held back, in plain words (shown on the audit sheet). */
export function holdBackReason(artSeg, nextSeg) {
  const art = letters(artSeg)[0];
  const n = letters(nextSeg)[0];
  if (!art || !n) return "unexpected shape";
  if (art.marks.includes(QAMETS)) return "הָ in a word with no pause accent: not covered by your sheets";
  if (!n.marks.includes(DAGESH)) return `no dagesh before ${n.letter}, which is not in SQNMLVY`;
  return "does not match any pattern";
}

// ---------- reading the OSHB (OSIS) file ----------

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Reads an OSHB book file into [{ ref: "Gen.1.1", words: [{ text, morph } | { seg, text }] }]. */
export function parseOsis(xml) {
  const verses = [];
  const verseRe = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
  let m;
  while ((m = verseRe.exec(xml))) {
    const words = [];
    const itemRe = /<w ([^>]*)>([^<]*)<\/w>|<seg type="([^"]+)">([^<]*)<\/seg>/g;
    let it;
    while ((it = itemRe.exec(m[2]))) {
      if (it[1] !== undefined) {
        const morph = (/morph="([^"]*)"/.exec(it[1]) || [])[1] || "";
        words.push({ text: decode(it[2]), morph });
      } else {
        words.push({ seg: it[3], text: decode(it[4]) });
      }
    }
    verses.push({ ref: m[1], words });
  }
  return verses;
}

/** "HC/Td/Ncbsa" -> ["C","Td","Ncbsa"] */
export function morphParts(morph) {
  return morph && "HA".includes(morph[0]) ? morph.slice(1).split("/") : morph.split("/");
}

/**
 * Finds and sorts every tagged article in a verse list.
 * Returns [{ ref, wi, seg, pattern | null, reason? }]  (wi = word index, seg = index of the article piece).
 */
export function findArticles(verses, overrides = ARTICLE_OVERRIDES) {
  const out = [];
  for (const v of verses) {
    v.words.forEach((w, wi) => {
      if (w.seg) return;
      const mp = morphParts(w.morph);
      const sp = w.text.split("/");
      const k = mp.indexOf("Td");
      if (k < 0 || mp.length !== sp.length || k + 1 >= sp.length) return;
      let pattern = classifyArticle(sp[k], sp[k + 1], w.text);
      let note;
      const o = overrides[`${v.ref}|${w.text.replace(/[^\u05d0-\u05ea]/g, "")}`];
      if (o) {
        pattern = o.pattern;
        note = o.note;
      }
      out.push({ ref: v.ref, wi, seg: k, pattern, note, reason: pattern ? undefined : holdBackReason(sp[k], sp[k + 1]) });
    });
  }
  return out;
}
