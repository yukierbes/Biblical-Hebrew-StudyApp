// Rules for the "grammar in context" pages that sort whole words or prefixes from the Open Scriptures tagging plus
// the written form: Nouns, Independent Personal Pronouns, Demonstratives, Adjectives, Interrogative ה, Prefixed Vav,
// and Prefixed מ. Everything the tagging says is used as the evidence; the spelling is checked against the owner's
// tables; anything that does not fit is held back and never used as an example.
//
// Pure functions (no browser, no files).

import { parseLetters, analyzeWord } from "./hebrew-word.mjs";
import { pieceInfo } from "./dataset-builder.mjs";

const SHEVA = "\u05b0", H_SEGOL = "\u05b1", H_PATAH = "\u05b2", H_QAMETS = "\u05b3", HIRIQ = "\u05b4", TSERE = "\u05b5", SEGOL = "\u05b6", PATAH = "\u05b7", QAMETS = "\u05b8";
const consonants = (s) => [...s].filter((c) => c >= "א" && c <= "ת").join("");
const GUTTURALS = "אהחער";
/** True when the first letter of a stem has a full vowel, or when a following vav is itself the vowel (וֹ or וּ). */
const fullVowelAt = (sl) => {
  const s1 = sl[0];
  const s2 = sl[1];
  return !!(s1.full || (s2 && s2.ch === "ו" && !s1.vowel && (s2.marks.includes("\u05b9") || (s2.dagesh && !s2.vowel))));
};
const mk = (id, group, label, explain, extra = {}) => ({ id, group, label, explain, ...extra });

// ============================================================ Nouns
export const NOUN_PATTERNS = [
  mk("absolute", "absolute", "Absolute", "An absolute noun stands on its own. It is not the first noun of a construct chain, or it is the last noun of one."),
  mk("construct", "construct", "Construct", "A construct noun is linked to the noun that follows it, usually in a relationship that can be translated “of”. The accent is drawn to the final noun of the chain, so a construct noun may show vowel reduction."),
];
export const NOUN_GROUPS = [
  { id: "absolute", label: "Absolute", patterns: ["absolute"] },
  { id: "construct", label: "Construct", patterns: ["construct"] },
];
export const NOUN_GN = ["MS", "FS", "MP", "FP", "Dual"];
export function classifyNoun(w, mp) {
  const info = pieceInfo(w, mp);
  if (!info) return null;
  const i = info.tags.findIndex((t) => /^Nc[mfbc][spd][acd]$/.test(t));
  if (i < 0) return null;
  const [, , g, n, st] = info.tags[i];
  if (g === "b" || g === "c") return { pattern: null, why: "the gender of this noun is not marked" };
  if (st === "d") return { pattern: null, why: "a determined-state noun" };
  const gn = n === "d" ? "Dual" : (g + n).toUpperCase();
  return { pattern: st === "a" ? "absolute" : "construct", extra: [gn, info.starts[i], info.ends[i]], example: { gn, from: info.starts[i], to: info.ends[i] } };
}
export const NOUN_TABLE = [
  { gn: "MS", absolute: "—", construct: "—" },
  { gn: "FS", absolute: "ָה", construct: "ַת or ֶת" },
  { gn: "MP", absolute: "ִים", construct: "ֵי" },
  { gn: "FP", absolute: "וֹת", construct: "וֹת" },
  { gn: "Dual", absolute: "ַיִם or ָתַיִם", construct: "ֵי" },
];

// ============================================================ Independent personal pronouns
const PRONOUN_FORMS = { "1CS": ["אני", "אנכי"], "1CP": ["אנחנו"], "2MS": ["אתה"], "2FS": ["את"], "2MP": ["אתם"], "2FP": ["אתן", "אתנה"], "3MS": ["הוא"], "3FS": ["היא", "הוא"], "3MP": ["הם", "המה"], "3FP": ["הן", "הנה"] };
export const PRONOUN_TABLE = [
  { row: "1C", singular: ["אֲנִי", "אָנֹכִי"], plural: ["אֲנַחְנוּ"] },
  { row: "2M", singular: ["אַתָּה"], plural: ["אַתֶּם"] },
  { row: "2F", singular: ["אַתְּ"], plural: ["אַתֶּן"] },
  { row: "3M", singular: ["הוּא"], plural: ["הֵם", "הֵמָּה"] },
  { row: "3F", singular: ["הִיא", "הִוא"], plural: ["הֵן", "הֵנָּה"] },
];
export const PRONOUN_PATTERNS = Object.keys(PRONOUN_FORMS).map((p) => mk("p" + p.toLowerCase(), "p" + p.toLowerCase(), p, `This is the independent personal pronoun for ${p}.`));
export const PRONOUN_GROUPS = PRONOUN_PATTERNS.map((p) => ({ id: p.id, label: p.label, patterns: [p.id] }));
export function classifyPronoun(w, mp) {
  const info = pieceInfo(w, mp);
  if (!info) return null;
  const i = info.tags.findIndex((t) => /^Pp[123][mfcb][sp]$/.test(t));
  if (i < 0) return null;
  if (info.tags.includes("Td")) return null; // with the article it is a far demonstrative, not a personal pronoun
  const t = info.tags[i];
  const pgn = `${t[2]}${t[3].toUpperCase()}${t[4].toUpperCase()}`;
  const forms = PRONOUN_FORMS[pgn];
  if (!forms) return { pattern: null, why: `the gender of this pronoun (${pgn}) is not marked` };
  if (!forms.includes(consonants(info.pieces[i]))) return { pattern: null, why: "a form that is not in the owner's table" };
  return { pattern: "p" + pgn.toLowerCase(), extra: [info.starts[i], info.ends[i]], example: { from: info.starts[i], to: info.ends[i] } };
}

// ============================================================ Demonstratives
export const DEMO_TABLE = {
  pronoun: { near: { MS: "זֶה", FS: "זֹאת", MP: "אֵלֶּה", FP: "אֵלֶּה" }, far: { MS: "הוּא", FS: "הִיא", MP: "הֵם", FP: "הֵן" } },
  adjective: { near: { MS: "הַזֶּה", FS: "הַזֹּאת", MP: "הָאֵלֶּה", FP: "הָאֵלֶּה" }, far: { MS: "הַהוּא", FS: "הַהִיא", MP: "הָהֵם", FP: "הָהֵן" } },
};
export const DEMO_PATTERNS = [
  mk("near_pronoun", "near_pronoun", "Near demonstrative pronoun", "A demonstrative pronoun stands on its own and points to something near: זֶה (this, MS), זֹאת (this, FS), אֵלֶּה (these, MP and FP). It has no article."),
  mk("near_adjective", "near_adjective", "Near demonstrative adjective", "A demonstrative adjective follows the noun it modifies, agrees with it in gender and number, and takes the article: הַזֶּה, הַזֹּאת, הָאֵלֶּה. A near demonstrative points to something close."),
  mk("far_adjective", "far_adjective", "Far demonstrative adjective", "A far demonstrative adjective uses the third-person independent pronoun with the article, and follows the noun it modifies: הַהוּא, הַהִיא, הָהֵם, הָהֵן."),
];
export const DEMO_GROUPS = DEMO_PATTERNS.map((p) => ({ id: p.id, label: p.label, patterns: [p.id] }));
export function classifyDemonstrative(w, mp, ctx) {
  const info = pieceInfo(w, mp);
  if (!info) return null;
  const tags = info.tags;
  const hasArticle = tags.includes("Td");
  const near = tags.findIndex((t) => /^Pdx[mfc][sp]$/.test(t));
  const far = tags.findIndex((t) => /^Pp3[mf][sp]$/.test(t));
  if (near < 0 && !(far >= 0 && hasArticle)) return null;
  if (tags.some((t) => /^S/.test(t) || t === "R" || t === "Rd")) return { pattern: null, why: "another prefix or a suffix is on the word" };
  let g, n, distance, i;
  if (near >= 0) { i = near; g = tags[i][3]; n = tags[i][4]; distance = "near"; }
  else { i = far; g = tags[i][3]; n = tags[i][4]; distance = "far"; }
  if (g === "c") {
    // אֵלֶּה serves both genders: take the gender from the noun before it when it is an adjective
    if (!hasArticle) return { pattern: null, why: "a plural pronoun אֵלֶּה could be masculine or feminine" };
    const prev = ctx.words.slice(0, ctx.wi).reverse().find((x) => !x.seg);
    const pi = prev ? pieceInfo(prev, mp) : null;
    const nounTag = pi && pi.tags.find((t) => /^Nc[mf][p][acd]$/.test(t));
    if (!nounTag) return { pattern: null, why: "the noun it modifies is not clear" };
    g = nounTag[2];
  }
  const gn = (g + n).toUpperCase();
  const type = hasArticle ? "adjective" : "pronoun";
  const pattern = distance === "near" ? (type === "pronoun" ? "near_pronoun" : "near_adjective") : "far_adjective";
  return { pattern, extra: [type, gn, distance], example: { type, gn, distance } };
}

// ============================================================ Adjectives
export const ADJ_PATTERNS = [
  mk("attributive", "attributive", "Attributive", "An attributive adjective directly describes a noun (“the old man”). It usually stands after the noun, and it agrees with the noun in gender, number and definiteness."),
  mk("predicate", "predicate", "Predicate", "A predicate adjective makes a statement about a noun, with an implied “to be” (“the man is old”). The noun is the subject and the adjective is the predicate. It usually comes before the noun but can come after it, and it agrees with the noun in gender and number, not in definiteness."),
  mk("substantive", "substantive", "Substantive", "A substantive adjective functions as a noun (“the old one”). It can be definite or indefinite."),
];
export const ADJ_GROUPS = ADJ_PATTERNS.map((p) => ({ id: p.id, label: p.label, patterns: [p.id] }));
export const ADJ_GN = ["MS", "FS", "MP", "FP"];
function nounFeatures(word, mp) {
  const info = pieceInfo(word, mp);
  if (!info) return null;
  const nt = info.tags.find((t) => /^Nc[mfbc][spd][acd]$/.test(t));
  if (!nt) return null;
  const definite = info.tags.includes("Td") || info.tags.includes("Rd") || info.tags.some((t) => /^Sp/.test(t));
  return { g: nt[2], n: nt[3], definite };
}
export function classifyAdjective(w, mp, ctx) {
  const info = pieceInfo(w, mp);
  if (!info) return null;
  const ai = info.tags.findIndex((t) => /^Aa[mfbc][spd][acd]$/.test(t));
  if (ai < 0) return null;
  const at = info.tags[ai];
  const g = at[2], n = at[3];
  if (!"mf".includes(g) || !"sp".includes(n)) return { pattern: null, why: "the gender or number of this adjective is not simple" };
  const definite = info.tags.includes("Td") || info.tags.includes("Rd");
  const gn = (g + n).toUpperCase();
  const neighbours = (dir) => {
    let k = ctx.wi + dir;
    while (ctx.words[k] && ctx.words[k].seg) k += dir;
    return ctx.words[k] || null;
  };
  const prev = neighbours(-1);
  const next = neighbours(1);
  const pf = prev ? nounFeatures(prev, mp) : null;
  const nf = next ? nounFeatures(next, mp) : null;
  const agrees = (f) => f && f.g === g && f.n === n;
  const make = (pattern) => ({ pattern, extra: [gn, info.starts[ai], info.ends[ai]], example: { gn, from: info.starts[ai], to: info.ends[ai] } });
  if (agrees(pf)) {
    if (pf.definite && definite) return make("attributive");
    if (pf.definite && !definite) return make("predicate");
    if (!pf.definite && !definite) return { pattern: null, why: "both the noun and the adjective are indefinite, so it could be attributive or predicate" };
    return { pattern: null, why: "the noun is indefinite but the adjective has the article" };
  }
  if (!definite && agrees(nf) && nf.definite && !(agrees(pf))) return make("predicate"); // an adjective before a definite noun
  if (definite) {
    const prevInfo = prev ? pieceInfo(prev, mp) : null;
    const prevLast = prevInfo ? prevInfo.tags[prevInfo.tags.length - 1][0] : "";
    if (!pf && !agrees(nf) && prevLast !== "A" && !(prevInfo && prevInfo.tags.some((t) => /^N/.test(t)))) return make("substantive");
    return { pattern: null, why: "it is not clear whether this adjective modifies a noun or stands for one" };
  }
  return { pattern: null, why: "the adjective's function is not clear from its neighbours" };
}

// ============================================================ Interrogative ה
const INTERROG_NOTE = "";
export const INTERROG_PATTERNS = [
  mk("lexical", "lexical", "Lexical Form", "The interrogative ה takes its lexical form, הֲ, before any non-guttural consonant that has a vowel."),
  mk("guttural_no_qamets", "guttural_no_qamets", "Guttural without ◌ָ", "Before a guttural that has a vowel other than qameṣ or qameṣ-ḥaṭuf, the interrogative ה takes pataḥ: הַ."),
  mk("vocal_sheva", "vocal_sheva", "Vocal Sheva", "Before any consonant that has a vocal sheva, the interrogative ה takes pataḥ: הַ."),
  mk("guttural_qamets", "guttural_qamets", "Guttural with ◌ָ", "Before a guttural that has a qameṣ or qameṣ-ḥaṭuf, the interrogative ה takes segol: הֶ."),
];
export const INTERROG_GROUPS = [
  { id: "lexical", label: "Lexical Form", patterns: ["lexical"] },
  { id: "guttural_no_qamets", label: "Guttural w/out ◌ָ", patterns: ["guttural_no_qamets"] },
  { id: "vocal_sheva", label: "Vocal Sheva", patterns: ["vocal_sheva"] },
  { id: "guttural_qamets", label: "Guttural w/ ◌ָ", patterns: ["guttural_qamets"] },
];
export const INTERROG_TABLE = [
  { form: "הֲ", rule: "Before any non-guttural consonant that has a vowel.", article: "הַ + a dagesh forte in the first letter of the noun", note: "The interrogative has no dagesh; the article doubles the next letter." },
  { form: "הַ", rule: "Before a guttural that has a vowel other than qameṣ or qameṣ-ḥaṭuf.", article: "הַ (implicit doubling), or הָ (compensatory lengthening) before א, ר or ע", note: "The two can look identical: the interrogative keeps its pataḥ, while the article’s guttural rejects the dagesh." },
  { form: "הַ", rule: "Before any consonant that has a vocal sheva.", article: "הַ + a dagesh forte, which may be lost before a SQNMLVY consonant with a vocal sheva", note: "The two can look identical when the dagesh is lost: the interrogative never doubles, the article would double but may lose it." },
  { form: "הֶ", rule: "Before a guttural that has a qameṣ or qameṣ-ḥaṭuf.", article: "הֶ before an unaccented ה or ע with qameṣ (an Exceptional Form)", note: "The two can look identical: the interrogative takes segol before a guttural with qameṣ, and so does the article in its exceptional form." },
];
export function classifyInterrogative(w, mp, ctx) {
  const info = pieceInfo(w, mp);
  if (!info || info.tags[0] !== "Ti" || info.pieces.length < 2) return null;
  const pre = parseLetters(info.pieces[0]);
  if (pre.length !== 1 || pre[0].ch !== "ה") return null; // the interrogative pronouns (מָה, מִי) are not this ה
  const p = pre[0];
  const sl = parseLetters(info.pieces.slice(1).join(""));
  if (!sl.length) return null;
  const s1 = sl[0];
  const has = (l, m) => l.marks.includes(m);
  const guttural = GUTTURALS.includes(s1.ch);
  const fv = fullVowelAt(sl);
  const held = (why) => ({ pattern: null, why });
  const ok = (pattern) => ({ pattern, extra: [0, 0], example: { from: 0, to: 0 } });
  if (has(p, H_PATAH)) return !guttural && (fv || s1.vowel === "hataf") ? ok("lexical") : held("הֲ before something other than a non-guttural with a vowel");
  if (has(p, PATAH)) {
    if (s1.vowel === "sheva") return ok("vocal_sheva");
    if (guttural && (fv || s1.vowel === "hataf") && s1.full !== "qames" && s1.full !== "qames-hatuf") return ok("guttural_no_qamets");
    return held("הַ before a letter the table does not cover");
  }
  if (has(p, SEGOL)) return guttural && (s1.full === "qames" || s1.full === "qames-hatuf") ? ok("guttural_qamets") : held("הֶ before a letter the table does not cover");
  return held("an unexpected vowel on the interrogative ה");
}
/** A word that begins with the definite article (for the "that is the article, not the interrogative" message). */
export function isArticleWord(w, mp) {
  const info = pieceInfo(w, mp);
  return !!(info && info.tags[0] === "Td");
}

// ============================================================ Prefixed vav
export const VAV_PATTERNS = [
  mk("lexical", "lexical", "Lexical Form", "The vav conjunction takes its lexical form, וְ, before a consonant that has a full vowel, except before the labials פ, מ and ב."),
  mk("labial_sheva", "labial_sheva", "Labial / Simple Vocal Sheva", "Before a labial consonant (פ, מ, ב) or before a consonant with a simple vocal sheva, the vav becomes a šureq: וּ."),
  mk("compound", "compound", "Compound Sheva", "Before a compound sheva, the vav takes the short vowel that matches the ḥāṭef (pataḥ, segol or qameṣ-ḥaṭuf), and usually has a meteg."),
  mk("yod", "yod", "יְ", "Before a noun that begins with יְ, the vav takes a ḥireq and the yod loses its sheva: וִי."),
  mk("tone", "tone", "Tone Syllable", "Before a tone syllable, or before a monosyllabic word, the vav takes a qameṣ: וָ."),
  mk("consec_compensatory", "consecutive", "Vav Consecutive", "This is a vav consecutive. The vav takes a qameṣ because compensatory lengthening occurs (before the א of a first-person imperfect)."),
  mk("consec_implicit", "consecutive", "Vav Consecutive", "This is a vav consecutive. The vav takes pataḥ (וַ) because the first consonant of the verb is a guttural that cannot take the dagesh (implicit doubling)."),
  mk("consec_sqnmlvy", "consecutive", "Vav Consecutive", "This is a vav consecutive. The vav takes pataḥ (וַ) and the dagesh forte is lost before a SQNMLVY consonant with a vocal sheva."),
  mk("consec_dagesh", "consecutive", "Vav Consecutive", "This is a vav consecutive. The vav takes pataḥ and a dagesh forte follows in the first letter of the converted imperfect verb (וַּ)."),
  mk("divine", "divine", "Divine Name", "Before the divine name יהוה the vav takes pataḥ (וַ), and before the divine name אֱלֹהִים it takes ṣere (וֵ)."),
];
export const VAV_GROUPS = [
  { id: "lexical", label: "Lexical Form", patterns: ["lexical"] },
  { id: "labial_sheva", label: "Labial/Simple Vocal Sheva", patterns: ["labial_sheva"] },
  { id: "compound", label: "Compound Sheva", patterns: ["compound"] },
  { id: "yod", label: "יְ", patterns: ["yod"] },
  { id: "tone", label: "Tone Syllable", patterns: ["tone"] },
  { id: "consecutive", label: "Vav Consecutive", patterns: ["consec_compensatory", "consec_implicit", "consec_sqnmlvy", "consec_dagesh"] },
  { id: "divine", label: "Divine Name", patterns: ["divine"] },
];
export const VAV_TABLE = [
  { forms: ["וְ"], rule: "Before a consonant with a full vowel, except the labials (פ, מ, ב)." },
  { forms: ["וּ"], rule: "Before a labial consonant (פ, מ, ב) or before a consonant with a simple vocal sheva." },
  { forms: ["וַֽ", "וֶֽ", "וָֽ"], rule: "Before a compound sheva (◌ֲ ◌ֱ ◌ֳ). The vav takes the short vowel that matches the ḥāṭef (pataḥ, segol or qameṣ-ḥaṭuf) and usually has a meteg." },
  { forms: ["וִי"], rule: "Before a noun that begins with יְ." },
  { forms: ["וָ"], rule: "Before a tone syllable, or before a monosyllabic word." },
  { forms: ["וָ"], rule: "Compensatory lengthening (vav consecutive)." },
  { forms: ["וַ"], rule: "Before the divine name יהוה, and before certain words that begin with יְ." },
  { forms: ["וַ"], rule: "Implicit doubling or SQNMLVY (vav consecutive)." },
  { forms: ["וֵ"], rule: "Before the divine name אֱלֹהִים." },
  { forms: ["וַּ"], rule: "Before converted imperfect verbs (vav consecutive): the dagesh forte is in the first letter of the verb." },
];
export function classifyVav(w, mp, ctx) {
  const info = pieceInfo(w, mp);
  if (!info || info.tags[0] !== "C" || info.pieces.length < 2 || /^S/.test(info.tags[1]) || info.tags[1] === "Td") return null;
  const pre = parseLetters(info.pieces[0]);
  if (pre.length !== 1 || pre[0].ch !== "ו") return null;
  const p = pre[0];
  const stemText = info.pieces.slice(1).join("");
  const sl = parseLetters(stemText);
  if (!sl.length) return null;
  const s1 = sl[0];
  const verbTag = info.tags.slice(1).find((t) => /^V[a-zA-Z][a-z]/.test(t));
  const consecutive = !!(verbTag && "wq".includes(verbTag[2]));
  const identity = consecutive ? "consec" : "conj";
  const has = (l, m) => l.marks.includes(m);
  const vowelOfPre = has(p, SHEVA) ? "sheva" : has(p, PATAH) ? "patah" : has(p, SEGOL) ? "segol" : has(p, QAMETS) ? "qamets" : has(p, TSERE) ? "tsere" : has(p, HIRIQ) ? "hiriq" : p.dagesh ? "shureq" : null;
  const ok = (pattern) => ({ pattern, extra: [identity, 0, 0], example: { identity, from: 0, to: 0 } });
  const held = (why) => ({ pattern: null, why });
  const lemma = w.lemma || "";
  const stemVav = fullVowelAt(sl) || (s1.ch === "ו" && s1.dagesh && !s1.vowel);
  if (lemma.includes("3068") && vowelOfPre === "patah") return ok("divine");
  if (lemma.includes("430") && vowelOfPre === "tsere") return ok("divine");
  if (verbTag && verbTag[2] === "w") {
    if (vowelOfPre === "qamets" && s1.ch === "א") return ok("consec_compensatory");
    if (vowelOfPre === "patah" && s1.dagesh && fullVowelAt(sl)) return ok("consec_dagesh");
    if (vowelOfPre === "patah" && GUTTURALS.includes(s1.ch) && fullVowelAt(sl) && !s1.dagesh) return ok("consec_implicit");
    if (vowelOfPre === "patah" && s1.vowel === "sheva" && !s1.dagesh) return ok("consec_sqnmlvy");
    return held("a vav consecutive whose spelling is not one of the patterns in the table");
  }
  if (s1.vowel === "hataf") {
    const m = { patah: H_PATAH, segol: H_SEGOL, qamets: H_QAMETS }[vowelOfPre];
    return m && s1.hataf === m ? ok("compound") : held("a compound sheva that does not match the vav's vowel");
  }
  if (vowelOfPre === "sheva") return stemVav && !"פמב".includes(s1.ch) ? ok("lexical") : held("a sheva on the vav before a labial or a letter without a full vowel");
  if (vowelOfPre === "shureq") return "פמב".includes(s1.ch) || s1.vowel === "sheva" ? ok("labial_sheva") : held("a šureq before something other than a labial or a sheva");
  if (vowelOfPre === "hiriq") return s1.ch === "י" && !s1.vowel ? ok("yod") : held("a ḥireq on the vav before something other than a bare yod");
  if (vowelOfPre === "qamets") {
    const an = analyzeWord(stemText, { stemStart: 0, beforeMaqqef: !!ctx.beforeMaqqef, lastInVerse: !!ctx.lastInVerse });
    if (an.nucleus.length === 1 || (an.stress.known && an.stress.nucleus !== null && an.stress.nucleus === an.nucleus[0])) return ok("tone");
    return held("a qameṣ on the vav, and it is not clear that the next syllable is the tone syllable");
  }
  return held("an unexpected vowel on the vav");
}

// ============================================================ Prefixed מ (the preposition מִן)
export const MIN_PATTERNS = [
  mk("lexical", "lexical", "Lexical Form", "Before a noun with the definite article, the preposition keeps its lexical form: מִן־ (joined to the noun by a maqqef)."),
  mk("indefinite_standard", "indefinite_standard", "Indefinite Standard", "Before an indefinite noun that begins with a consonant that is not a guttural, the preposition is מִ and the noun’s first letter has a dagesh forte."),
  mk("implicit_doubling", "implicit_doubling", "Implicit Doubling", "Before an indefinite noun that begins with ה or ח, the preposition is מִ, and the guttural is understood to be doubled (implicit doubling)."),
  mk("vocal_sheva", "vocal_sheva", "Vocal Sheva (וקנמל)", "Before an indefinite noun whose first consonant (ו, ק, נ, מ or ל) has a vocal sheva, the preposition is מִ and the dagesh forte is lost."),
  mk("compensatory", "compensatory", "Compensatory Lengthening", "Before an indefinite noun that begins with א, ע or ר (and sometimes ה or ח), the preposition lengthens to מֵ because the guttural cannot take the dagesh (compensatory lengthening)."),
  mk("yod", "yod", "יְ", "Before a noun that begins with יְ, the preposition takes a ḥireq and the yod loses its sheva: מִי."),
];
export const MIN_GROUPS = MIN_PATTERNS.map((p) => ({ id: p.id, label: p.label, patterns: [p.id] }));
export const MIN_TABLE = [
  { forms: ["מִן־"], rule: "Before a noun with the definite article." },
  { forms: ["מִּ"], rule: "Before an indefinite noun that begins with a consonant that is not a guttural (the noun’s first letter has a dagesh forte)." },
  { forms: ["מִ"], rule: "Before an indefinite noun that begins with ה or ח (implicit doubling)." },
  { forms: ["מִ"], rule: "Before an indefinite noun with a vocal sheva on its first consonant, for ו, ק, נ, מ and ל." },
  { forms: ["מֵ"], rule: "Before an indefinite noun that begins with א, ע or ר, and sometimes ה or ח (compensatory lengthening)." },
  { forms: ["מִי"], rule: "Before a noun that begins with יְ." },
];
export function classifyMin(w, mp, ctx) {
  // the separate word מִן before a maqqef and a word with the article
  if (w.morph === "HR" && consonants(w.text) === "מן" && ctx.beforeMaqqef) {
    let k = ctx.wi + 2;
    const next = ctx.words[k];
    const ni = next && !next.seg ? pieceInfo(next, mp) : null;
    if (ni && (ni.tags[0] === "Td")) return { pattern: "lexical", extra: [0, 1], example: { from: 0, to: 1 } };
    return null;
  }
  const info = pieceInfo(w, mp);
  if (!info || info.tags[0] !== "R" || info.pieces.length < 2 || /^S/.test(info.tags[1]) || info.tags[1] === "Td") return null;
  const pre = parseLetters(info.pieces[0]);
  if (pre.length !== 1 || pre[0].ch !== "מ") return null;
  const p = pre[0];
  const sl = parseLetters(info.pieces.slice(1).join(""));
  if (!sl.length) return null;
  const s1 = sl[0];
  const ok = (pattern) => ({ pattern, extra: [0, 0], example: { from: 0, to: 0 } });
  const held = (why) => ({ pattern: null, why });
  if (p.marks.includes(HIRIQ)) {
    if (s1.ch === "י" && !s1.vowel && !s1.dagesh) return ok("yod");
    if (s1.dagesh && fullVowelAt(sl) && !GUTTURALS.includes(s1.ch)) return ok("indefinite_standard");
    if ("הח".includes(s1.ch) && fullVowelAt(sl) && !s1.dagesh) return ok("implicit_doubling");
    if ("וקנמל".includes(s1.ch) && s1.vowel === "sheva" && !s1.dagesh) return ok("vocal_sheva");
    return held("a מִ whose spelling is not one of the patterns in the table");
  }
  if (p.marks.includes(TSERE)) return "ארע".includes(s1.ch) || "הח".includes(s1.ch) ? ok("compensatory") : held("a מֵ before a letter the table does not cover");
  return held("an unexpected vowel on the מ");
}
