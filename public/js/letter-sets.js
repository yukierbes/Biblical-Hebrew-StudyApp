// Everything that differs between the Consonants study set and the Vowels
// study set lives here, so the four page types (Review, Flashcards, Typing,
// Games) can be written once and run for either one — the same way the
// Accents pages work, but without copying them twice.
//
// A "set" describes: where its rows come from, how a row is identified,
// which sidebar filters it has, what a card shows on each side, what each
// typing prompt shows, which hints exist, and what the Sort game sorts by.

import {
  getConsonantRows,
  getConsonantCategoryOrder,
  getVowelRows,
  getVowelClassOrder,
  getVowelLengthOrder,
} from "./letter-data.js";

export const NO_CATEGORY = "No category";
const PLACEHOLDER = "\u25CC"; // ◌

/** "Guttural, Matres Lectionis" -> ["Guttural", "Matres Lectionis"] */
export function categoriesOf(row) {
  return String(row.Category || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** True when another row in `rows` is written with exactly the same Form
 * (qameṣ / qameṣ-ḥaṭuf) — so the mark alone can't say which one it is. */
export function isSharedForm(row, rows) {
  return rows.some((r) => r.Name !== row.Name && r.Form === row.Form);
}

// ---------------------------------------------------------------------
// Consonants
// ---------------------------------------------------------------------

const CONSONANTS = {
  id: "consonants",
  pagePrefix: "consonant", // page names: consonant-review, consonant-flashcards, ...
  srsPrefix: "consonant", // spaced-repetition modes: consonant-flashcards, ...
  title: "Consonants",
  singular: "consonant",
  plural: "consonants",
  Singular: "Consonant",
  rows: getConsonantRows,
  rowKey: (row) => row.Name,

  // Sidebar filters. `options()` lists what can be ticked; `match` decides
  // whether a row passes once something is ticked.
  filters: [
    {
      key: "Category",
      label: "Category",
      options: () => [...getConsonantCategoryOrder(), NO_CATEGORY],
      match: (row, selected) => {
        const cats = categoriesOf(row);
        if (cats.length === 0) return selected.includes(NO_CATEGORY);
        return cats.some((c) => selected.includes(c));
      },
    },
  ],

  // Review table
  columns: ["Name", "Form", "Transliteration", "Category", "Keyboard"],
  columnLabels: { Name: "Name", Form: "Form", Transliteration: "Transliteration", Category: "Category", Keyboard: "Keyboard Key" },
  hebrewColumns: ["Form"],
  printWeights: { Name: 1.2, Form: 0.8, Transliteration: 1, Category: 1.6, Keyboard: 1 },
  csvName: "consonants_filtered",

  // Flashcards (and the printed cards): Hebrew on the front; name and
  // transliteration on the back.
  frontHtml: (row) => `<span class="letter-glyph" lang="he" dir="rtl">${row.Form}</span>`,
  backPrimary: (row) => row.Name,
  backSecondary: (row) => (row.Transliteration ? `Transliteration: ${row.Transliteration}` : ""),
  backMeta: (row) => categoriesOf(row).join(" · "),
  print: { glyphFront: true, frontField: "Form", backField: "Name", secondaryField: "Transliteration", metaFields: ["Category"], backFieldIsHebrew: false },
  printRow: (row) => row,

  // Typing prompts. "names": shown the name (and transliteration), type the
  // letter. "symbol": shown the letter, pick the keyboard shortcut.
  promptNameHtml: (row) =>
    `<div class="gloss-display" style="font-size:1.8rem;">${row.Name}</div>` +
    (row.Transliteration ? `<div class="gloss-display" style="font-size:1.3rem; margin-top:6px;">${row.Transliteration}</div>` : ""),
  answerLabel: "Letter",
  keyboardButtonLabel: "Hebrew Keyboard",
  keyboardKind: "hebrew",

  // "Get Hint" in Typing Practice: one clue per press.
  hints: (row) => {
    const cats = categoriesOf(row);
    return cats.length ? [`Category: ${cats.join(", ")}`] : [];
  },

  // Sort game: which bucket a row belongs in.
  sortTitle: "Category Sort",
  sortNoun: "Category",
  sortBucket: (row) => categoriesOf(row)[0] || NO_CATEGORY,
  sortBucketLabel: (bucket) => bucket,
  sortMinBuckets: 2,
  sortDesc: "A letter appears with its name — sort it into the right Category before it gets away.",

  memoryDesc: "Flip two cards at a time to match each letter with its name. Fewer moves and less time is better.",
  memoryNameHtml: (row) => `<span class="memory-card-english">${row.Name}</span>`,
  lightningNameText: (row) => row.Name,
  achievementNoun: "Consonant",
};

// ---------------------------------------------------------------------
// Vowels
// ---------------------------------------------------------------------

const VOWELS = {
  id: "vowels",
  pagePrefix: "vowel",
  srsPrefix: "vowel",
  title: "Vowels",
  singular: "vowel",
  plural: "vowels",
  Singular: "Vowel",
  rows: getVowelRows,
  rowKey: (row) => row.Name,

  filters: [
    {
      key: "Class",
      label: "Class",
      options: getVowelClassOrder,
      match: (row, selected) => selected.includes(row.Class),
    },
    {
      key: "Length",
      label: "Length",
      options: getVowelLengthOrder,
      match: (row, selected) => selected.includes(row.Length),
    },
  ],

  columns: ["Class", "Name", "Length", "Form", "Pronunciation", "Keyboard"],
  columnLabels: { Class: "Class", Name: "Name", Length: "Length", Form: "Form", Pronunciation: "Pronunciation", Keyboard: "Keyboard Key" },
  hebrewColumns: ["Form"],
  printWeights: { Class: 0.6, Name: 1.4, Length: 1.3, Form: 0.8, Pronunciation: 1, Keyboard: 1.2 },
  csvName: "vowels_filtered",

  // Hebrew on the front; class, name and length on the back.
  frontHtml: (row) => `<span class="letter-glyph" lang="he" dir="rtl">${row.Form}</span>`,
  backPrimary: (row) => row.Name,
  backSecondary: (row) => `Class ${row.Class}`,
  backMeta: (row) => row.Length,
  print: { glyphFront: true, frontField: "Form", backField: "Name", secondaryField: "ClassLabel", metaFields: ["Length"], backFieldIsHebrew: false },
  // The printed back shows "Class A" under the name, so give the print
  // code a column that already says so.
  printRow: (row) => ({ ...row, ClassLabel: `Class ${row.Class}` }),

  promptNameHtml: (row) =>
    `<div class="gloss-display" style="font-size:1.8rem;">${row.Name}</div>` +
    (row.Pronunciation ? `<div class="gloss-display" style="font-size:1.3rem; margin-top:6px;">${row.Pronunciation}</div>` : ""),
  answerLabel: "Vowel",
  keyboardButtonLabel: "Vowel Keyboard",
  keyboardKind: "vowel",

  hints: (row) => [`Class: ${row.Class}`, `Length: ${row.Length}`],

  sortTitle: "Class Sort",
  sortNoun: "Class",
  sortBucket: (row) => row.Class,
  sortBucketLabel: (bucket) => `Class ${bucket}`,
  sortMinBuckets: 2,
  sortDesc: "A vowel appears with its name — sort it into the right Class (A, E, I, O or U) before it gets away.",

  memoryDesc: "Flip two cards at a time to match each vowel with its name. Fewer moves and less time is better.",
  memoryNameHtml: (row) => `<span class="memory-card-english">${row.Name}</span>`,
  lightningNameText: (row) => row.Name,
  achievementNoun: "Vowel",
};

export const LETTER_SETS = { consonants: CONSONANTS, vowels: VOWELS };

export function getLetterSet(id) {
  return LETTER_SETS[id];
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

export function freshFilters(set) {
  const f = {};
  for (const def of set.filters) f[def.key] = [];
  return f;
}

/** Applies the sidebar filters: within one filter, a row passes if it
 * matches any ticked value; across filters, it must pass every filter that
 * has something ticked. */
export function applyLetterFilters(set, rows, filters) {
  let out = rows;
  for (const def of set.filters) {
    const selected = filters[def.key];
    if (selected && selected.length) out = out.filter((r) => def.match(r, selected));
  }
  return out;
}

/** What the "Show Hint" panel offers for a row shown only as a mark: the
 * vowel's class, when another vowel is written the very same way. */
export function ambiguityHints(set, row) {
  if (set.id !== "vowels") return [];
  if (!isSharedForm(row, set.rows())) return [];
  return [{ text: `This vowel belongs to the ${row.Class} class.` }];
}

export { PLACEHOLDER };
