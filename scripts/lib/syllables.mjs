// Dividing a written Hebrew word into syllables, for the Syllables page. Built on the word analysis in hebrew-word.mjs.
//
// Conventions (from the owner's "Syllables & Stress" sheet):
//  * An open syllable (Cv) ends with a vowel or a vowel letter (mater); a closed syllable (CvC) ends with a
//    consonant. A silent sheva closes a syllable.
//  * A vocal sheva and a compound sheva (ḥāṭef) are each their own syllable.
//  * A dagesh forte doubles a consonant: the first half closes one syllable, the second half starts the next.
//    Doubled consonants are therefore written as TWO slots (the bare consonant, then the consonant with its marks).
//  * The tone (stress) syllable is the one carrying the accent; the syllables around it are the pretonic and
//    propretonic (before) and the post-tonic and propost-tonic (after).
//  * Vowel length by the Vowels page: short = pataḥ, segol, ḥireq, qibbuṣ, qameṣ-ḥaṭuf; long = qameṣ, ṣere, ṣere-yod,
//    ḥireq-yod, ḥolem, ḥolem-vav, šureq; a vocal or compound sheva is "sheva".
//
// A word is returned only when every decision in it could be made with confidence (the stress is known, every sheva
// is sorted, every qameṣ is sorted); otherwise null with a reason, and the word is never used.

import { analyzeWord, classifyAllQamets } from "./hebrew-word.mjs";

const SHORT = new Set(["patah", "segol", "hiriq", "qibbuts", "qames-hatuf"]);
const LONG = new Set(["qames", "tsere", "tsere-yod", "hiriq-yod", "holem", "holem-vav", "shureq"]);
const TONES = ["tonic", "pretonic", "propretonic", "posttonic", "proposttonic"];

/** The text of one letter with its marks, optionally without accent marks. */
function letterText(l) {
  return l.ch + l.marks;
}

/**
 * Syllabifies a word. Returns { slots: [text], syllables: [{ start, end, closed, tone, vowel, nucleus }], tonic: index } or { why }.
 * `opts` is passed on to the word analysis (stemStart, beforeMaqqef, lastInVerse).
 */
export function syllabify(text, opts = {}) {
  const an = analyzeWord(text, opts);
  const L = an.letters;
  if (!an.stress.known || an.stress.nucleus === null) return { why: "the stress of the word is not known" };
  const qamets = new Map(classifyAllQamets(an).map((r) => [r.li, r]));
  const slots = [];
  const syllables = [];
  const letterSlot = []; // letter index -> [first slot, last slot]
  let pending = []; // slots of consonants waiting for the next vowel (e.g. the ל of לוֹ)
  const last = () => syllables[syllables.length - 1];
  const push = (t) => {
    slots.push(t);
    return slots.length - 1;
  };

  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    const isNucleus = an.nucleus.includes(i);
    const sh = l.vowel === "sheva" ? an.shevas.get(i) : null;
    const isVocal = l.vowel === "hataf" || (sh && sh.kind === "vocal");
    const isSilent = sh && sh.kind === "silent";
    if (sh && !sh.kind) return { why: "a sheva could not be sorted as vocal or silent" };
    const doubled = an.dagPattern(i) === "forte" && l.dagesh && (isNucleus || isVocal || isSilent);

    if (an.mater[i]) {
      if (!last()) return { why: "a vowel letter with nothing before it" };
      last().end = push(letterText(l));
      letterSlot[i] = [last().end, last().end];
      continue;
    }

    if (!isNucleus && !isVocal && !isSilent) {
      // a consonant with no vowel of its own: a closing consonant, or the start of a syllable whose vowel is a following vav
      const nextVav = L[i + 1] && an.nucleus.includes(i + 1) && ["shureq", "holem-vav"].includes(an.kind[i + 1]);
      const s = push(letterText(l));
      letterSlot[i] = [s, s];
      if (nextVav || !last()) pending.push(s);
      else {
        last().end = s;
        last().closed = true;
      }
      continue;
    }

    if (isSilent) {
      if (!last()) return { why: "a silent sheva at the start of the word" };
      if (doubled) return { why: "a doubled consonant with a silent sheva" };
      const s = push(letterText(l));
      letterSlot[i] = [s, s];
      last().end = s;
      last().closed = true;
      continue;
    }

    // a vowel or a vocal sheva: this letter starts a new syllable
    let firstSlot;
    if (doubled) {
      if (!last()) return { why: "a doubled consonant at the start of the word" };
      const bare = push(l.ch); // the first half of the doubled consonant closes the syllable before it
      last().end = bare;
      last().closed = true;
      firstSlot = push(letterText(l));
    } else {
      firstSlot = push(letterText(l));
    }
    letterSlot[i] = [doubled ? firstSlot - 1 : firstSlot, firstSlot];
    let start = pending.length ? pending[0] : firstSlot;
    if (pending.length) {
      // pending consonants were pushed before this letter's slot: the syllable begins at the first of them
      start = pending[0];
      pending = [];
    }
    let vowel;
    if (isNucleus) {
      const kind = an.kind[i];
      if (kind === "qames") {
        const q = qamets.get(i);
        if (!q || !q.pattern) return { why: "a qameṣ that cannot be sorted as qameṣ or qameṣ-ḥaṭuf" };
        vowel = q.pattern.startsWith("hatuf") ? "short" : "long";
      } else if (SHORT.has(kind)) vowel = "short";
      else if (LONG.has(kind)) vowel = "long";
      else return { why: "an unexpected vowel" };
    } else vowel = "sheva";
    syllables.push({ start, end: firstSlot, closed: false, vowel, nucleus: isNucleus ? i : null, letter: i });
  }
  if (pending.length) return { why: "a consonant with no vowel before a vowel letter" };
  if (!syllables.length) return { why: "no syllables" };

  // the tone syllable and the ones around it
  const tonic = syllables.findIndex((s) => s.nucleus === an.stress.nucleus);
  if (tonic < 0) return { why: "the accent is not on a vowel" };
  syllables.forEach((s, k) => {
    const d = k - tonic;
    s.tone = d === 0 ? "tonic" : d === -1 ? "pretonic" : d === -2 ? "propretonic" : d === 1 ? "posttonic" : d === 2 ? "proposttonic" : "other";
  });
  return { slots, syllables, tonic };
}

/**
 * Which of the owner's rules a syllable shows (or "other"):
 *  CAPL closed accented prefers long; OPRL open pretonic requires long; CURS closed unaccented requires short;
 *  OAPS open accented prefers short; OOPPS originally open propretonic (gets) sheva.
 */
export function syllableRule(s) {
  if (s.vowel === "sheva") return s.tone === "propretonic" ? "OOPPS" : "other";
  if (s.closed && s.tone === "tonic" && s.vowel === "long") return "CAPL";
  if (!s.closed && s.tone === "pretonic" && s.vowel === "long") return "OPRL";
  if (s.closed && s.tone !== "tonic" && s.vowel === "short") return "CURS";
  if (!s.closed && s.tone === "tonic" && s.vowel === "short") return "OAPS";
  return "other";
}
