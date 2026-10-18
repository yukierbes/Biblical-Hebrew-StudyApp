// Pronominal suffixes on nouns and prepositions: Type 1 and Type 2 (the owner's Pronominal
// Suffixes table, example סוּס "horse" / סוּסִים "horses").
//
//   Type 1 suffixes go on singular nouns (סוּסִי "my horse").
//   Type 2 suffixes go on plural nouns (סוּסַי "my horses").
//   Some prepositions and particles take one set or the other.
//
// How a word is sorted: the Open Scriptures Hebrew Bible tags the suffix and its person/gender/
// number (e.g. "Sp3ms"); the app then checks that the ENDING as written matches that person/
// gender/number in the table, and takes Type 1 or Type 2 from which column matched. A word whose
// ending is not in the table is held back and never used as an example.
//
// Pure functions (no browser, no files). Marks are compared as sets per letter, so the order the
// source happens to use for vowel points and dagesh does not matter; the displayed text is never changed.

/** The owner's table. Each ending starts with the vowel written on the last letter of the stem (if any), then the suffix letters. */
export const SUFFIX_TABLE = [
  { pgn: "1CS", gloss: "my", type1: ["ִי"], type2: ["ַי"], eg1: "סוּסִי", eg2: "סוּסַי" },
  { pgn: "2MS", gloss: "your (m.s.)", type1: ["ְךָ"], type2: ["ֶיךָ"], eg1: "סוּסְךָ", eg2: "סוּסֶיךָ" },
  { pgn: "2FS", gloss: "your (f.s.)", type1: ["ֵךְ"], type2: ["ַיִךְ"], eg1: "סוּסֵךְ", eg2: "סוּסַיִךְ" },
  { pgn: "3MS", gloss: "his", type1: ["וֹ", "ֹה"], type2: ["ָיו"], eg1: "סוּסוֹ", eg2: "סוּסָיו" },
  { pgn: "3FS", gloss: "her", type1: ["ָהּ"], type2: ["ֶיהָ"], eg1: "סוּסָהּ", eg2: "סוּסֶיהָ" },
  { pgn: "1CP", gloss: "our", type1: ["ֵנוּ"], type2: ["ֵינוּ"], eg1: "סוּסֵנוּ", eg2: "סוּסֵינוּ" },
  { pgn: "2MP", gloss: "your (m.pl.)", type1: ["ְכֶם"], type2: ["ֵיכֶם"], eg1: "סוּסְכֶם", eg2: "סוּסֵיכֶם" },
  { pgn: "2FP", gloss: "your (f.pl.)", type1: ["ְכֶן"], type2: ["ֵיכֶן"], eg1: "סוּסְכֶן", eg2: "סוּסֵיכֶן" },
  { pgn: "3MP", gloss: "their (m.)", type1: ["ָם", "ָהֶם"], type2: ["ֵיהֶם"], eg1: "סוּסָם", eg2: "סוּסֵיהֶם" },
  { pgn: "3FP", gloss: "their (f.)", type1: ["ָן", "ָהֶן"], type2: ["ֵיהֶן"], eg1: "סוּסָן", eg2: "סוּסֵיהֶן" },
];

export const SUFFIX_PATTERNS = [
  {
    id: "type1",
    group: "type1",
    label: "Type 1 Suffix",
    explain:
      "Type 1 suffixes are added to singular nouns (סוּס “horse” → סוּסִי “my horse”). Some prepositions and particles also take Type 1 suffixes.",
  },
  {
    id: "type2",
    group: "type2",
    label: "Type 2 Suffix",
    explain:
      "Type 2 suffixes are added to plural nouns (סוּסִים “horses” → סוּסַי “my horses”); most have a yod before the suffix. Some prepositions and particles also take Type 2 suffixes.",
  },
];

export const SUFFIX_GROUPS = [
  { id: "type1", label: "Type 1 Suffix", patterns: ["type1"] },
  { id: "type2", label: "Type 2 Suffix", patterns: ["type2"] },
];

const isLetter = (c) => c >= "\u05d0" && c <= "\u05ea";
const isAccent = (c) => (c >= "\u0591" && c <= "\u05af") || c === "\u05bd"; // accents and meteg/silluq

/** "Sp3ms" -> "3MS" */
export function pgnFromTag(tag) {
  const m = /^Sp([123])([mfcb])([sp])$/.exec(tag || "");
  return m ? `${m[1]}${m[2].toUpperCase()}${m[3].toUpperCase()}` : null;
}

/** Word -> [{ letter, marks }] with accents removed and the marks of each letter sorted. */
function canonLetters(text) {
  const out = [];
  let lead = ""; // marks before the first letter (should not happen)
  for (const ch of text) {
    if (isAccent(ch)) continue;
    if (isLetter(ch)) out.push({ letter: ch, marks: [] });
    else if (out.length) out[out.length - 1].marks.push(ch);
    else lead += ch;
  }
  return out.map((l) => ({ letter: l.letter, marks: [...l.marks].sort().join("") }));
}

/** An ending from the table -> { lead: marks on the stem's last letter, letters: [{letter, marks}] } */
function parseEnding(ending) {
  const chars = [...ending];
  let lead = [];
  let i = 0;
  while (i < chars.length && !isLetter(chars[i])) lead.push(chars[i++]);
  const letters = [];
  for (; i < chars.length; i++) {
    if (isLetter(chars[i])) letters.push({ letter: chars[i], marks: [] });
    else letters[letters.length - 1].marks.push(chars[i]);
  }
  return { lead: [...lead].sort().join(""), letters: letters.map((l) => ({ letter: l.letter, marks: [...l.marks].sort().join("") })) };
}

const PARSED = SUFFIX_TABLE.map((row) => ({
  row,
  t1: row.type1.map(parseEnding),
  t2: row.type2.map(parseEnding),
}));

/**
 * Does the written word end with this table ending? Returns the index of the first letter to highlight
 * (the stem's last letter when the ending starts with a vowel written under it), or -1.
 */
function matchEnding(ls, parsed) {
  const k = parsed.letters.length;
  const start = ls.length - k;
  if (start < 1) return -1;
  for (let j = 0; j < k; j++) {
    if (ls[start + j].letter !== parsed.letters[j].letter) return -1;
    if (ls[start + j].marks !== parsed.letters[j].marks) return -1;
  }
  if (parsed.lead) {
    // every mark of the ending's leading vowel must be on the stem's last letter
    const have = ls[start - 1].marks;
    if (![...parsed.lead].every((m) => have.includes(m))) return -1;
    return start - 1;
  }
  return start;
}

/**
 * Sorts one word that OSHB tags with a pronominal suffix.
 * `wordText` is the whole word (pieces joined), `tagPgn` e.g. "3MS".
 * Returns { type: "type1"|"type2", pgn, from } or null when the ending is not in the table.
 */
export function classifySuffix(wordText, tagPgn) {
  const ls = canonLetters(wordText);
  const hits = [];
  for (const { row, t1, t2 } of PARSED) {
    for (const [type, list] of [["type1", t1], ["type2", t2]]) {
      for (const p of list) {
        const from = matchEnding(ls, p);
        if (from >= 0) hits.push({ type, pgn: row.pgn, from, size: p.letters.length + (p.lead ? 1 : 0) });
      }
    }
  }
  const agree = hits.filter((h) => h.pgn === tagPgn);
  if (!agree.length) return null;
  agree.sort((a, b) => b.size - a.size);
  const best = agree[0];
  return { type: best.type, pgn: best.pgn, from: best.from };
}

/**
 * Finds and sorts every noun or preposition with a pronominal suffix in a verse list
 * (from article-rules' parseOsis). Verbs are left out: their object suffixes are a different topic.
 * Returns [{ ref, wi, stem: "noun"|"preposition", type|null, pgn, from?, reason? }].
 */
export function findSuffixes(verses, morphParts) {
  const out = [];
  for (const v of verses) {
    v.words.forEach((w, wi) => {
      if (w.seg) return;
      const mp = morphParts(w.morph);
      const last = mp[mp.length - 1];
      const tagPgn = pgnFromTag(last);
      if (!tagPgn || mp.length < 2) return;
      const stemTag = mp[mp.length - 2];
      const stem = stemTag[0] === "N" ? "noun" : stemTag[0] === "R" ? "preposition" : null;
      if (!stem) return;
      const res = classifySuffix(w.text.split("/").join(""), tagPgn);
      out.push({ ref: v.ref, wi, stem, pgn: tagPgn, type: res ? res.type : null, from: res ? res.from : undefined, reason: res ? undefined : `the ending is not one of the table's ${tagPgn} endings` });
    });
  }
  return out;
}
