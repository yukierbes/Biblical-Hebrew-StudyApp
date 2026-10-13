#!/usr/bin/env node
// Regenerates netlify/functions/data/{verbs,vocabulary,accents,consonants,vowels}.json from
// the plain CSV files under data-source/.
//
// You normally never run this yourself: Netlify runs it on every deploy (see
// `command` in netlify.toml), so uploading a changed CSV to GitHub is all it
// takes — the site rebuilds its data from the CSVs. To check a CSV on your own
// computer before uploading, run:
//
//   node scripts/build-data.mjs --check     (or: npm run check-data)
//
// which reads everything, reports any problems, and writes nothing. Without
// --check it also writes the JSON files (npm run build-data).
//
// What to edit:
//   data-source/vocabulary.csv        — one row per word
//   data-source/accents.csv           — one row per accent mark
//   data-source/consonants.csv        — one row per consonant form (dagesh forms are their own rows)
//   data-source/vowels.csv            — one row per vowel
//   data-source/verbs/*.csv           — one file per verb paradigm
//
// This script is deliberately fussy, because the data it writes is what the
// whole app runs on and the mistakes that matter are the silent ones:
//   * The files must be UTF-8. Hebrew saved in any other encoding comes out as
//     garbage or as "?" — which is reported, not published.
//   * A missing or renamed column heading is reported (not filled with blanks).
//   * A file that is suddenly much shorter than before (cut off, or the wrong
//     file) is reported rather than shrinking the app's data.
//   * Likely typos (an unknown binyan or mode, a stray file) are listed as warnings.
// If anything is an ERROR, nothing at all is written. Warnings never stop the build.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BINYAN_ORDER, BINYAN_ORDER_ONLY_POLEL, MODE_ORDER, POLEL_DATASETS } from "../public/js/constants.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "data-source");
const OUT = join(ROOT, "netlify", "functions", "data");
const CHECK_ONLY = process.argv.includes("--check");
// Set ALLOW_DATA_SHRINK=1 (e.g. as a Netlify environment variable) to publish a deliberately much smaller data set.
const ALLOW_SHRINK = process.env.ALLOW_DATA_SHRINK === "1";

const errors = [];
const warnings = [];
const rel = (path) => relative(ROOT, path).split("\\").join("/");
const HEBREW_LETTER = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
const KNOWN_BINYAN = new Set([...BINYAN_ORDER, ...BINYAN_ORDER_ONLY_POLEL]);
const KNOWN_MODE = new Set(MODE_ORDER);

/** Up to `n` examples, as "row 4 (x), row 9 (y), ... and 3 more". */
function examples(list, n = 4) {
  const shown = list.slice(0, n).join(", ");
  return list.length > n ? `${shown}, and ${list.length - n} more` : shown;
}

// ---------- tiny RFC-4180-ish CSV parser (no dependency needed) ----------
// Handles quoted fields, commas/newlines inside quotes, and "" as an
// escaped quote — i.e. anything a normal spreadsheet export produces.
function parseCsv(text) {
  // Strip a UTF-8 BOM if the spreadsheet program added one.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Last field/row (files not always ending in a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-blank trailing lines some spreadsheet apps add.
  while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();
  return rows;
}

/** Lower-cases a column heading and drops spaces/punctuation, so
 * "Hebrew Name", "hebrew_name" and "HebrewName" all compare equal. */
function normalizeHeader(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parses a CSV file into an array of objects.
 *
 * `columns` maps each column name this script uses to the headings it
 * will accept for it in the CSV (compared ignoring case, spaces and
 * punctuation — so "Hebrew Name" in a spreadsheet works as well as
 * "HebrewName"). Extra columns in the CSV are ignored. If a required
 * column can't be found the script STOPS with a clear message, rather
 * than quietly writing blanks into the app's data (which is what used
 * to happen when a heading didn't match exactly).
 */
function readCsvAsObjects(path, columns, { hebrewColumns = [] } = {}) {
  const text = readCsvText(path);
  if (text === null) return [];
  const rows = parseCsv(text);
  if (rows.length === 0) {
    errors.push(`${rel(path)} is empty.`);
    return [];
  }
  const header = rows[0].map(normalizeHeader);
  const indexFor = {};
  const missing = [];
  for (const [name, accepted] of Object.entries(columns)) {
    const idx = header.findIndex((h) => accepted.map(normalizeHeader).includes(h));
    if (idx === -1) missing.push(name);
    else indexFor[name] = idx;
  }
  if (missing.length) {
    errors.push(
      `${rel(path)} is missing the column(s): ${missing.join(", ")}. ` +
        `The headings in the file's first row are: ${rows[0].join(" | ")}. Fix the heading(s) and upload it again.`
    );
    return [];
  }
  const objects = rows.slice(1).map((r) => {
    const obj = {};
    for (const name of Object.keys(columns)) obj[name] = clean(r[indexFor[name]] ?? "");
    return obj;
  });

  // Hebrew that arrives as "?" (or as anything without Hebrew letters in it) means the
  // file was saved in the wrong encoding. Excel's plain "CSV" does exactly this.
  for (const column of hebrewColumns) {
    const bad = [];
    objects.forEach((o, i) => {
      if (o[column] && !HEBREW_LETTER.test(o[column])) bad.push(`row ${i + 2} "${o[column]}"`);
    });
    if (bad.length) {
      errors.push(
        `${rel(path)}: the "${column}" column should contain Hebrew, but ${examples(bad)} has none. ` +
          `This almost always means the file was saved in the wrong format and the Hebrew was lost. ` +
          `Re-save it as CSV UTF-8 (see "Editing the data" in the README) and upload it again.`
      );
    }
  }
  return objects;
}

/**
 * Reads a CSV file as text, but only if it is genuinely UTF-8. A file in some other
 * encoding is rejected here — decoding it "loosely" would publish garbled Hebrew.
 */
function readCsvText(path) {
  const bytes = readFileSync(path);
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    errors.push(
      `${rel(path)} was saved as "Unicode Text" (UTF-16), which this can't read. ` +
        `Save it as CSV UTF-8 instead (in Excel: Save As, then "CSV UTF-8 (Comma delimited)") and upload it again.`
    );
    return null;
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    errors.push(
      `${rel(path)} is not saved as UTF-8, so its Hebrew would come out as garbage. ` +
        `Save it as CSV UTF-8 (in Excel: Save As, then "CSV UTF-8 (Comma delimited)"; in Google Sheets: File, Download, ` +
        `Comma-separated values) and upload it again.`
    );
    return null;
  }
  if (text.includes("\uFFFD")) {
    errors.push(`${rel(path)} contains damaged characters (\uFFFD), which means some text was already lost when it was saved. Re-save it from the original spreadsheet as CSV UTF-8.`);
    return null;
  }
  return text;
}

function clean(s) {
  return String(s).split(/\s+/).filter(Boolean).join(" "); // trims + collapses stray whitespace
}

const outputs = []; // [{ file, data, count, label }] — written only once every check has passed
function output(file, data, count, label) {
  outputs.push({ file, data, count, label });
}

// ---------- vocabulary.csv -> vocabulary.json ----------
// Columns: Lesson, Frequency, Hebrew, English, POS, Category
function buildVocabulary() {
  const path = join(SRC, "vocabulary.csv");
  if (!existsSync(path)) {
    errors.push("data-source/vocabulary.csv is missing.");
    return;
  }
  const raw = readCsvAsObjects(
    path,
    {
      Lesson: ["Lesson"],
      Frequency: ["Frequency"],
      Hebrew: ["Hebrew"],
      English: ["English"],
      POS: ["POS", "Part of Speech"],
      Category: ["Category"],
    },
    { hebrewColumns: ["Hebrew"] }
  );
  const rows = [];
  const lessonOrder = [];
  const seenLessons = new Set();
  const posSet = new Set();
  const categorySet = new Set();
  const lessonRuns = []; // to notice a lesson that's split into two separate stretches of the file
  const emptyEnglish = [];
  const emptyHebrew = [];
  const badFrequency = [];

  raw.forEach((r, i) => {
    const lesson = r.Lesson || "";
    if (!seenLessons.has(lesson)) {
      seenLessons.add(lesson);
      lessonOrder.push(lesson);
    } else if (lessonRuns[lessonRuns.length - 1] !== lesson) {
      warnings.push(`vocabulary.csv: lesson "${lesson}" starts again at row ${i + 2}, after other lessons. Keep each lesson's words together, or the lessons will be listed in the wrong order.`);
    }
    lessonRuns.push(lesson);
    if (!r.English) emptyEnglish.push(`row ${i + 2}`);
    if (!r.Hebrew) emptyHebrew.push(`row ${i + 2}`);
    if (r.Frequency && !/^\d+$/.test(r.Frequency)) badFrequency.push(`row ${i + 2} "${r.Frequency}"`);
    if (r.POS) posSet.add(r.POS);
    if (r.Category) categorySet.add(r.Category); // blanks stay blank on purpose, not added to the option list

    rows.push({
      Lesson: lesson,
      Frequency: parseInt(r.Frequency, 10) || 0,
      Hebrew: r.Hebrew || "",
      English: r.English || "",
      POS: r.POS || "",
      Category: r.Category || "",
    });
  });
  if (emptyHebrew.length) warnings.push(`vocabulary.csv: no Hebrew in ${examples(emptyHebrew)}.`);
  if (emptyEnglish.length) warnings.push(`vocabulary.csv: no English in ${examples(emptyEnglish)}.`);
  if (badFrequency.length) warnings.push(`vocabulary.csv: Frequency should be a whole number, but ${examples(badFrequency)} is not.`);

  output(
    "vocabulary.json",
    { rows, lessonOrder, posOrder: [...posSet].sort(), categoryOrder: [...categorySet].sort() },
    rows.length,
    "vocabulary words"
  );
}

// ---------- accents.csv -> accents.json ----------
// Columns: Type, Group, HebrewName, EnglishName, Symbol, Placement, Keyboard
function buildAccents() {
  const path = join(SRC, "accents.csv");
  if (!existsSync(path)) {
    errors.push("data-source/accents.csv is missing.");
    return;
  }
  const raw = readCsvAsObjects(
    path,
    {
      Type: ["Type"],
      Group: ["Group"],
      HebrewName: ["HebrewName", "Hebrew Name"],
      EnglishName: ["EnglishName", "English Name"],
      Symbol: ["Symbol"],
      Placement: ["Placement"],
      Keyboard: ["Keyboard", "Keyboard Key", "Keyboard Shortcut"],
    },
    { hebrewColumns: ["HebrewName", "Placement"] }
  );
  const rows = [];
  const typeOrder = [];
  const groupOrder = [];
  const seenTypes = new Set();
  const seenGroups = new Set();

  for (const r of raw) {
    if (r.Type && !seenTypes.has(r.Type)) {
      seenTypes.add(r.Type);
      typeOrder.push(r.Type);
    }
    if (r.Group && !seenGroups.has(r.Group)) {
      seenGroups.add(r.Group);
      groupOrder.push(r.Group);
    }
    rows.push({
      Type: r.Type || "",
      Group: r.Group || "",
      HebrewName: r.HebrewName || "",
      EnglishName: r.EnglishName || "",
      Symbol: r.Symbol || "",
      Placement: r.Placement || "",
      Keyboard: r.Keyboard || "",
    });
  }
  output("accents.json", { rows, typeOrder, groupOrder }, rows.length, "accent marks");
}

// ---------- consonants.csv -> consonants.json ----------
// Columns: Name, Form, Transliteration, Category, Keyboard Key
// Category may hold several comma-separated values (e.g. "Guttural, Matres
// Lectionis") or be blank on purpose.
function buildConsonants() {
  const path = join(SRC, "consonants.csv");
  if (!existsSync(path)) {
    errors.push("data-source/consonants.csv is missing.");
    return;
  }
  const raw = readCsvAsObjects(
    path,
    {
      Name: ["Name"],
      Form: ["Form"],
      Transliteration: ["Transliteration"],
      Category: ["Category"],
      Keyboard: ["Keyboard", "Keyboard Key", "Keyboard Shortcut"],
    },
    { hebrewColumns: ["Form"] }
  );
  const rows = [];
  const categoryOrder = [];
  const seenCats = new Set();
  const seenNames = new Set();
  for (const r of raw) {
    if (!r.Name || !r.Form) continue;
    if (seenNames.has(r.Name)) warnings.push(`consonants.csv: the name "${r.Name}" appears more than once.`);
    seenNames.add(r.Name);
    for (const c of splitList(r.Category)) {
      if (!seenCats.has(c)) {
        seenCats.add(c);
        categoryOrder.push(c);
      }
    }
    rows.push({
      Name: r.Name,
      Form: r.Form,
      Transliteration: r.Transliteration || "",
      Category: r.Category || "",
      Keyboard: r.Keyboard || "",
    });
  }
  if (rows.length === 0) errors.push("data-source/consonants.csv has no rows.");
  output("consonants.json", { rows, categoryOrder }, rows.length, "consonant forms");
}

// ---------- vowels.csv -> vowels.json ----------
// Columns: Class, Name, Length, Form, Pronunciation, Keyboard Key
function buildVowels() {
  const path = join(SRC, "vowels.csv");
  if (!existsSync(path)) {
    errors.push("data-source/vowels.csv is missing.");
    return;
  }
  const raw = readCsvAsObjects(
    path,
    {
      Class: ["Class"],
      Name: ["Name"],
      Length: ["Length"],
      Form: ["Form"],
      Pronunciation: ["Pronunciation"],
      Keyboard: ["Keyboard", "Keyboard Key", "Keyboard Shortcut"],
    },
    { hebrewColumns: ["Form"] }
  );
  const rows = [];
  const classOrder = [];
  const lengthOrder = [];
  const seenNames = new Set();
  for (const r of raw) {
    if (!r.Name || !r.Form) continue;
    if (seenNames.has(r.Name)) warnings.push(`vowels.csv: the name "${r.Name}" appears more than once.`);
    seenNames.add(r.Name);
    if (r.Class && !classOrder.includes(r.Class)) classOrder.push(r.Class);
    if (r.Length && !lengthOrder.includes(r.Length)) lengthOrder.push(r.Length);
    rows.push({
      Class: r.Class || "",
      Name: r.Name,
      Length: r.Length || "",
      Form: r.Form,
      Pronunciation: r.Pronunciation || "",
      Keyboard: r.Keyboard || "",
    });
  }
  if (rows.length === 0) errors.push("data-source/vowels.csv has no rows.");
  output("vowels.json", { rows, classOrder, lengthOrder }, rows.length, "vowels");
}

/** "Guttural, Matres Lectionis" -> ["Guttural", "Matres Lectionis"] */
function splitList(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// ---------- verbs/*.csv -> verbs.json ----------
// One file per verb paradigm. Filenames start with a two-digit number
// ("01 Strong Verb (קטל).csv") purely to control ordering — rename/
// renumber files to reorder verbs, or add a new numbered file to add one.
// The number + following space is stripped to get the verb's display
// name. Columns in each file: Binyan, Mode, Person, Gender, Number,
// Conjugation, Gloss Translation
function buildVerbs() {
  const dir = join(SRC, "verbs");
  if (!existsSync(dir)) {
    errors.push("data-source/verbs/ is missing.");
    return;
  }
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort(); // "01 ...", "02 ...", etc. sort correctly as plain strings

  const datasets = [];
  const data = {};
  let total = 0;

  for (const file of files) {
    const name = file.replace(/\.csv$/i, "").replace(/^\d+\s*/, "");
    const where = `verbs/${file}`;
    if (!/^\d+/.test(file)) warnings.push(`${where} doesn't start with a number, so it will be listed in the wrong place. Name verb files like "05 Name (root).csv".`);
    if (datasets.includes(name)) {
      errors.push(`Two verb files make the verb "${name}" (${where} is the second). Each verb needs its own name.`);
      continue;
    }
    const raw = readCsvAsObjects(
      join(dir, file),
      {
        Binyan: ["Binyan"],
        Mode: ["Mode"],
        Person: ["Person"],
        Gender: ["Gender"],
        Number: ["Number"],
        Conjugation: ["Conjugation"],
        "Gloss Translation": ["Gloss Translation", "Gloss"],
      },
      { hebrewColumns: ["Conjugation"] }
    );
    if (raw.length === 0) {
      if (!errors.some((e) => e.includes(where))) errors.push(`${where} has no rows.`);
      continue;
    }

    // Likely typos: they wouldn't stop anything, but would quietly add a binyan / mode / PGN no other verb has.
    const odd = { Binyan: [], Mode: [], Person: [], Gender: [], Number: [] };
    const allowed = { Person: ["1", "2", "3", ""], Gender: ["M", "F", "C", ""], Number: ["S", "P", ""] };
    const emptyForm = [];
    raw.forEach((r, i) => {
      if (!KNOWN_BINYAN.has(r.Binyan)) odd.Binyan.push(`row ${i + 2} "${r.Binyan}"`);
      if (!KNOWN_MODE.has(r.Mode)) odd.Mode.push(`row ${i + 2} "${r.Mode}"`);
      for (const k of ["Person", "Gender", "Number"]) if (!allowed[k].includes(r[k])) odd[k].push(`row ${i + 2} "${r[k]}"`);
      if (!r.Conjugation) emptyForm.push(`row ${i + 2}`);
    });
    for (const [k, list] of Object.entries(odd)) {
      if (list.length) warnings.push(`${where}: unexpected ${k} value in ${examples(list)}. Check the spelling.`);
    }
    if (emptyForm.length) warnings.push(`${where}: no Conjugation in ${examples(emptyForm)}.`);
    if (raw.some((r) => /^(Polel|Polal|Hitpolel)$/.test(r.Binyan)) && !POLEL_DATASETS.has(name)) {
      warnings.push(`${where} uses Polel/Polal/Hitpolel but "${name}" isn't in POLEL_DATASETS (public/js/constants.js), so it will be shown with the usual binyan names.`);
    }

    datasets.push(name);
    total += raw.length;
    data[name] = raw.map((r) => ({
      Binyan: r.Binyan || "",
      Mode: r.Mode || "",
      Person: r.Person || "",
      Gender: r.Gender || "",
      Number: r.Number || "",
      Conjugation: r.Conjugation || "",
      "Gloss Translation": r["Gloss Translation"] || "",
    }));
  }
  if (datasets.length === 0) {
    errors.push("data-source/verbs/ has no verb files.");
    return;
  }
  output("verbs.json", { datasets, data }, total, `verb forms in ${datasets.length} verb files`);
}

// ---------- files that won't be used ----------
function warnAboutStrayFiles() {
  const used = new Set(["vocabulary.csv", "accents.csv", "consonants.csv", "vowels.csv", "verbs"]);
  for (const f of existsSync(SRC) ? readdirSync(SRC) : []) {
    if (f.startsWith(".") || used.has(f)) continue;
    warnings.push(`data-source/${f} is not used by the app (it reads vocabulary.csv, accents.csv, consonants.csv, vowels.csv and the files in verbs/). If it was meant to replace one of those, rename it to match.`);
  }
  const verbsDir = join(SRC, "verbs");
  for (const f of existsSync(verbsDir) ? readdirSync(verbsDir) : []) {
    if (f.startsWith(".") || f.toLowerCase().endsWith(".csv")) continue;
    warnings.push(`data-source/verbs/${f} is not a .csv file, so it is ignored.`);
  }
}

// ---------- compare with what is already published ----------
function previousCount(file) {
  try {
    const old = JSON.parse(readFileSync(join(OUT, file), "utf-8"));
    if (file === "verbs.json") return { count: Object.values(old.data).reduce((n, rows) => n + rows.length, 0), verbs: old.datasets };
    return { count: old.rows.length };
  } catch (e) {
    return null; // nothing published yet
  }
}

function guardAgainstShrinking() {
  for (const o of outputs) {
    const before = previousCount(o.file);
    if (!before || before.count === 0) continue;
    const ratio = o.count / before.count;
    if (ratio < 0.5 && !ALLOW_SHRINK) {
      errors.push(
        `${o.file.replace(".json", "")}: the new data has only ${o.count} ${o.label}, but the published data has ${before.count}. ` +
          `That looks like a cut-off or wrong file, so nothing was changed. If you really meant to remove that much, ` +
          `set the environment variable ALLOW_DATA_SHRINK=1 in Netlify and deploy again.`
      );
    } else if (ratio < 0.9) {
      warnings.push(`${o.file.replace(".json", "")}: ${o.count} ${o.label} now, down from ${before.count}.`);
    }
    if (o.file === "verbs.json" && before.verbs) {
      const now = new Set(Object.keys(o.data.data));
      const gone = before.verbs.filter((v) => !now.has(v));
      if (gone.length) warnings.push(`verbs: no longer present: ${gone.join(", ")}.`);
    }
  }
}

// ---------- go ----------
console.log(CHECK_ONLY ? "Checking data-source/ (nothing will be written) ..." : "Building data from data-source/ ...");
buildVocabulary();
buildAccents();
buildConsonants();
buildVowels();
buildVerbs();
warnAboutStrayFiles();
guardAgainstShrinking();

if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length}) — these did not stop the build, but are worth a look:`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}
if (errors.length) {
  console.error(`\nERRORS (${errors.length}) — nothing was changed:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  console.error("\nFix the file(s) above and upload them again.");
  process.exit(1);
}

for (const o of outputs) {
  console.log(`  ${String(o.count).padStart(5)} ${o.label}`);
  if (!CHECK_ONLY) {
    writeFileSync(join(OUT, o.file), JSON.stringify(o.data), "utf-8");
    console.log(`        wrote ${rel(join(OUT, o.file))}`);
  }
}
console.log(CHECK_ONLY ? "\nAll good — the data files are fine." : "\nDone.");
