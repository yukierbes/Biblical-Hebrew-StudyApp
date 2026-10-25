// Finding vocabulary words that share a root, for Word Lookup's "Root letters" search.
//
// A root is three (sometimes two or four) consonants, and the words built on it keep those consonants in order
// with other letters around them: שמר finds שָׁמַר, מִשְׁמָר, שֹׁמֵר, מִשְׁמֶרֶת. The search ignores vowel points and
// treats final and regular letters as the same (ך/כ, ם/מ, ן/נ, ף/פ, ץ/צ), whichever form the search or the word uses.

const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const NON_LETTERS = /[^\u05D0-\u05EA]/g;
const MARKS = /[\u0591-\u05C7]/g;

/** Hebrew consonants only, in order: no vowel points or accents, no spaces or punctuation, final forms made regular. */
export function rootLetters(text) {
  return [...(text ?? "").toString().normalize("NFC").replace(MARKS, "").replace(NON_LETTERS, "")].map((c) => FINALS[c] || c).join("");
}

/** Letters that may drop out of a word built on a weak root (I-nun, I-yod, I-alef, II-vav/yod, III-he …). */
export const WEAK_LETTERS = new Set(["י", "ו", "ה", "א", "נ"]);

/** The separate forms in a vocabulary entry, e.g. "אִישׁ ; אֲנָשִׁים" or "מָה , מֶה , מַה" -> three/two letter strings. */
export function wordForms(hebrew) {
  return (hebrew ?? "")
    .toString()
    .split(/[\s,;/()]+/)
    .map(rootLetters)
    .filter(Boolean);
}

function isSubsequence(needle, hay) {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++;
  return i === needle.length;
}

/**
 * How one word form relates to the root letters, or null if it does not match.
 *   "adjacent"  the root letters appear side by side (שמר in הַשְּׁמִירָה: ש-מ-ר)
 *   "ordered"   the root letters appear in order with other letters between them
 *   "starts"    the form begins with the root letters
 *   "weak"      one weak letter of the root is missing (only when `weak` is allowed): { kind: "weak", missing: "נ" }
 * `mode`: "ordered" (default — adjacent or not), "adjacent" (side by side only), "starts" (begins with the root).
 */
export function matchForm(form, root, { mode = "ordered", weak = false } = {}) {
  if (!root || root.length < 2 || !form) return null;
  const starts = form.startsWith(root);
  const adjacent = form.includes(root);
  const ordered = isSubsequence(root, form);
  if (mode === "starts") {
    if (starts) return { kind: "starts" };
  } else if (mode === "adjacent") {
    if (adjacent) return { kind: "adjacent" };
  } else if (ordered) {
    return { kind: adjacent ? "adjacent" : "ordered" };
  }
  if (weak && root.length >= 3) {
    for (let k = 0; k < root.length; k++) {
      if (!WEAK_LETTERS.has(root[k])) continue;
      const reduced = root.slice(0, k) + root.slice(k + 1);
      const okMode = mode === "starts" ? form.startsWith(reduced) : mode === "adjacent" ? form.includes(reduced) : isSubsequence(reduced, form);
      if (okMode && !isSubsequence(root, form)) return { kind: "weak", missing: root[k] };
    }
  }
  return null;
}

const KIND_ORDER = { starts: 0, adjacent: 1, ordered: 2, weak: 3 };

/** The best match among a word's separate forms (starts/adjacent beat ordered beat weak), or null. */
export function matchWord(hebrew, root, options) {
  let best = null;
  for (const form of wordForms(hebrew)) {
    const m = matchForm(form, root, options);
    if (m && (!best || KIND_ORDER[m.kind] < KIND_ORDER[best.kind])) best = m;
  }
  return best;
}

/**
 * Finds the rows whose Hebrew matches the root letters. Returns [{ row, match }], best matches first
 * (adjacent or starting with the root, then letters in order, then weak-root guesses), keeping the book's order within each.
 */
export function findRootMatches(rows, rootInput, options = {}) {
  const root = rootLetters(rootInput);
  if (root.length < 2) return [];
  const out = [];
  rows.forEach((row, i) => {
    const m = matchWord(row.Hebrew, root, options);
    if (m) out.push({ row, match: m, i });
  });
  out.sort((a, b) => KIND_ORDER[a.match.kind] - KIND_ORDER[b.match.kind] || a.i - b.i);
  return out.map(({ row, match }) => ({ row, match }));
}

/** Plain-language label for a match, for the results table. */
export function describeMatch(match) {
  if (!match) return "";
  if (match.kind === "starts") return "starts with the root";
  if (match.kind === "adjacent") return "root letters together";
  if (match.kind === "ordered") return "root letters spread apart";
  return `weak root? missing ${match.missing}`;
}

/** True when two root spellings are the same root (same consonants, ignoring points and final forms). */
export function sameRoot(a, b) {
  const x = rootLetters(a);
  return x.length > 0 && x === rootLetters(b);
}
