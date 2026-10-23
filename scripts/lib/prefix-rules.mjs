// Prefixed prepositions ל ב כ (the owner's "Prefixed Prepositions" table): which form the preposition takes,
// and why. The rules are the same for all three prepositions (ב and כ also have a dagesh lene).
//
// How a word is sorted: the Open Scriptures Hebrew Bible tags a prefixed preposition as its own piece ("R").
// The app looks at that piece's vowel and at the first letter of what follows, and checks the case against the
// owner's table. When the definite article follows, its ה drops out and the preposition takes the vowel the
// article would have had, so the article shows up here too (the OSHB does not tag the dropped article).
// Anything the table does not cover is held back and never used as an example.

import { parseLetters, analyzeWord } from "./hebrew-word.mjs";

const PATAH = "\u05b7", QAMETS = "\u05b8", SEGOL = "\u05b6", TSERE = "\u05b5", HIRIQ = "\u05b4", SHEVA = "\u05b0";
const H_SEGOL = "\u05b1", H_PATAH = "\u05b2", H_QAMETS = "\u05b3";

export const PREFIX_PATTERNS = [
  { id: "lexical", group: "lexical", label: "Lexical Form", explain: "The preposition takes its lexical form (לְ, בְּ, כְּ) before a consonant that has a full vowel, unless that syllable is the tone syllable." },
  { id: "simple_sheva", group: "simple", label: "Simple Sheva", explain: "Before a consonant with a simple vocal sheva, the preposition takes a ḥireq (לִ, בִּ, כִּ)." },
  { id: "compound_sheva", group: "compound", label: "Compound Sheva", explain: "Before a compound sheva (a ḥāṭef), the preposition takes the short vowel that matches the ḥāṭef: pataḥ before a ḥāṭef-pataḥ (לַ), segol before a ḥāṭef-segol (לֶ), and qameṣ-ḥaṭuf before a ḥāṭef-qāmeṣ (לָ)." },
  { id: "yod_sheva", group: "yod", label: "יְ", explain: "Before a noun that begins with יְ, the preposition takes a ḥireq and the yod loses its sheva (לִי, בִּי, כִּי)." },
  { id: "tone_syllable", group: "tone", label: "Tone Syllable", explain: "Before a tone syllable, or before a monosyllabic word, the preposition takes a qameṣ (לָ, בָּ, כָּ)." },
  { id: "article_compensatory", group: "article", label: "Definite Article", explain: "The definite article is prefixed: its ה drops out, but the preposition takes the vowel the article would have. Before א, ר or ע the article lengthens its vowel to make up for the rejected dagesh (compensatory lengthening), so the preposition takes a qameṣ (לָ, בָּ, כָּ)." },
  { id: "article_lexical", group: "article", label: "Definite Article", explain: "The definite article is prefixed: its ה drops out, but the preposition takes the vowel the article would have. With the article’s lexical form, the preposition takes pataḥ (לַ, בַּ, כַּ) and the noun’s first letter has a dagesh forte." },
  { id: "article_implicit", group: "article", label: "Definite Article", explain: "The definite article is prefixed: its ה drops out, but the preposition takes the vowel the article would have. With implicit doubling before ה, ח or ע, the preposition takes pataḥ (לַ, בַּ, כַּ) and no dagesh is written." },
  { id: "article_exceptional", group: "article", label: "Definite Article", explain: "The definite article is prefixed: its ה drops out, but the preposition takes the vowel the article would have. Before an unaccented ה or ע with a qameṣ, the article would be הֶ, so the preposition takes segol (לֶ, בֶּ, כֶּ)." },
  { id: "yhwh", group: "yhwh", label: "יהוה", explain: "Before the divine name יהוה, the preposition takes pataḥ (לַ, בַּ, כַּ)." },
  { id: "alef_hataf", group: "alef", label: "אֱ", explain: "Sometimes, before אֱ, the preposition takes ṣere (לֵ, בֵּ, כֵּ)." },
];

/** The answer choices, in the order of the owner's table. */
export const PREFIX_GROUPS = [
  { id: "lexical", label: "Lexical Form", patterns: ["lexical"] },
  { id: "simple", label: "Simple Sheva", patterns: ["simple_sheva"] },
  { id: "compound", label: "Compound Sheva", patterns: ["compound_sheva"] },
  { id: "yod", label: "יְ", patterns: ["yod_sheva"] },
  { id: "tone", label: "Tone Syllable", patterns: ["tone_syllable"] },
  { id: "article", label: "Definite Article", patterns: ["article_compensatory", "article_lexical", "article_implicit", "article_exceptional"] },
  { id: "yhwh", label: "יהוה", patterns: ["yhwh"] },
  { id: "alef", label: "אֱ", patterns: ["alef_hataf"] },
];

/** The table for the pattern guide: forms for ל, ב and כ (with the dagesh lene) and the cleaned-up rule. No answer column. */
export const PREFIX_TABLE = [
  { forms: { ל: ["לְ"], ב: ["בְּ"], כ: ["כְּ"] }, rule: "Before a consonant that has a full vowel, except before a tone syllable." },
  { forms: { ל: ["לִ"], ב: ["בִּ"], כ: ["כִּ"] }, rule: "Before a consonant that has a simple vocal sheva." },
  { forms: { ל: ["לַֽ", "לֶֽ", "לָֽ"], ב: ["בַּֽ", "בֶּֽ", "בָּֽ"], כ: ["כַּֽ", "כֶּֽ", "כָּֽ"] }, rule: "Before a compound sheva (◌ֲ ◌ֱ ◌ֳ). The preposition takes the short vowel that matches the ḥāṭef (pataḥ, segol or qameṣ-ḥaṭuf) and usually has a meteg." },
  { forms: { ל: ["לִי"], ב: ["בִּי"], כ: ["כִּי"] }, rule: "Before a noun that begins with יְ. The yod loses its sheva." },
  { forms: { ל: ["לָ"], ב: ["בָּ"], כ: ["כָּ"] }, rule: "Before a tone syllable, or before a monosyllabic word." },
  { forms: { ל: ["לָ"], ב: ["בָּ"], כ: ["כָּ"] }, rule: "Compensatory lengthening, because of the prefixed definite article." },
  { forms: { ל: ["לַ"], ב: ["בַּ"], כ: ["כַּ"] }, rule: "Before some words that have the definite article: the article’s lexical form or implicit doubling." },
  { forms: { ל: ["לַ"], ב: ["בַּ"], כ: ["כַּ"] }, rule: "Before the divine name יהוה." },
  { forms: { ל: ["לֵ"], ב: ["בֵּ"], כ: ["כֵּ"] }, rule: "Sometimes before אֱ." },
];

const isHebrewLetter = (c) => c >= "\u05d0" && c <= "\u05ea";

/**
 * Sorts one word with a prefixed ל, ב or כ. `w` is { text, morph, lemma }; `morphParts` splits the tag.
 * Returns null if the word is not a prefixed preposition of this kind, otherwise
 * { letter, pattern | null, why? }.
 */
export function classifyPrefixed(w, morphParts, ctx = {}) {
  const pieces = w.text.split("/");
  const tags = morphParts(w.morph);
  if (pieces.length < 2 || (tags[0] !== "R" && tags[0] !== "Rd") || tags[1][0] === "S" || tags[1] === "Td") return null;
  const withArticle = tags[0] === "Rd"; // the dropped definite article
  const first = parseLetters(pieces[0]);
  if (first.length !== 1 || !["ל", "ב", "כ"].includes(first[0].ch)) return null;
  const letter = first[0].ch;
  const pre = first[0];
  const stem = pieces.slice(1).join("");
  const sl = parseLetters(stem);
  if (!sl.length) return null;
  const s1 = sl[0];
  // the first letter counts as having a full vowel when a vav that is itself the vowel (וֹ or וּ) follows it
  const s2 = sl[1];
  const vavVowel = !!(s2 && s2.ch === "ו" && (s2.marks.includes("\u05b9") || (s2.dagesh && !s2.vowel)) && !s1.vowel);
  const fullVowel = !!s1.full || vavVowel;
  const held = (why) => ({ letter, pattern: null, why });
  const has = (l, mark) => l.marks.includes(mark);
  const preV = has(pre, SHEVA) ? "sheva" : has(pre, HIRIQ) ? "hiriq" : has(pre, PATAH) ? "patah" : has(pre, QAMETS) ? "qamets" : has(pre, SEGOL) ? "segol" : has(pre, TSERE) ? "tsere" : null;
  if (!preV) return held("the preposition has no vowel mark I recognise");

  // the definite article was dropped: the preposition takes the vowel the article would have had
  if (withArticle) {
    if (preV === "qamets" && "ארע".includes(s1.ch) && !s1.dagesh && fullVowel) return { letter, pattern: "article_compensatory" };
    if (preV === "patah" && s1.dagesh && fullVowel) return { letter, pattern: "article_lexical" };
    if (preV === "patah" && "החע".includes(s1.ch) && fullVowel && !s1.dagesh) return { letter, pattern: "article_implicit" };
    if (preV === "segol" && "הע".includes(s1.ch) && has(s1, QAMETS) && !s1.dagesh) return { letter, pattern: "article_exceptional" };
    return held("the article is dropped here, but the spelling is not one of the article patterns in the table (for example the SQNMLVY cases)");
  }

  // the divine name
  if ((w.lemma || "").includes("3068")) return preV === "patah" ? { letter, pattern: "yhwh" } : held("the divine name with an unexpected vowel on the preposition");

  const stemHataf = s1.hataf;
  if (s1.vowel === "hataf") {
    if (preV === "patah" && stemHataf === H_PATAH) return { letter, pattern: "compound_sheva" };
    if (preV === "segol" && stemHataf === H_SEGOL) return { letter, pattern: "compound_sheva" };
    if (preV === "qamets" && stemHataf === H_QAMETS) return { letter, pattern: "compound_sheva" };
    if (preV === "tsere" && s1.ch === "א" && stemHataf === H_SEGOL) return { letter, pattern: "alef_hataf" };
    return held("a compound sheva that does not match the preposition's vowel");
  }
  if (preV === "hiriq") {
    if (s1.ch === "י" && !s1.vowel && !s1.dagesh) return { letter, pattern: "yod_sheva" };
    if (s1.vowel === "sheva") return { letter, pattern: "simple_sheva" };
    return held("a ḥireq before something other than a sheva or a bare yod");
  }
  if (preV === "sheva") {
    if (fullVowel || (s1.ch === "ו" && s1.dagesh && !s1.vowel)) return { letter, pattern: "lexical" };
    return held("a sheva before a letter without a full vowel");
  }
  if (preV === "qamets") {
    if (fullVowel || (s1.ch === "ו" && s1.dagesh)) {
      const an = analyzeWord(stem, { stemStart: 0, beforeMaqqef: !!ctx.beforeMaqqef, lastInVerse: !!ctx.lastInVerse });
      if (an.nucleus.length === 1) return { letter, pattern: "tone_syllable" }; // a monosyllable
      if (an.stress.known && an.stress.nucleus !== null && an.stress.nucleus === an.nucleus[0]) return { letter, pattern: "tone_syllable" };
      return held("a qameṣ on the preposition, and it is not clear that the next syllable is the tone syllable");
    }
    return held("a qameṣ before a letter without a full vowel");
  }
  if (preV === "patah") {
    return held("a pataḥ on the preposition that is not explained by a compound sheva, the divine name or the dropped article");
  }
  if (preV === "segol") {
    return held("a segol on the preposition that is not explained by a compound sheva or the dropped article");
  }
  if (preV === "tsere") return held("a ṣere on the preposition (only the case before אֱ is covered)");
  return held("not covered");
}
