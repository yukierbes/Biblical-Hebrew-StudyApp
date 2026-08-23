#!/usr/bin/env node
// Regenerates netlify/functions/data/{verbs,vocabulary,accents}.json from
// the plain CSV files under data-source/. This is the ONLY thing you need
// to run after editing those CSVs — no Python, no pandas, no Excel.
//
// Usage:
//   node scripts/build-data.mjs
//   (or:  npm run build-data)
//
// What to edit:
//   data-source/vocabulary.csv        — one row per word
//   data-source/accents.csv           — one row per accent mark
//   data-source/verbs/*.csv           — one file per verb paradigm
//
// After running this, the JSON files it writes under
// netlify/functions/data/ are what the deployed app actually reads (see
// "Project structure" in README.md) — commit those JSON changes, bump
// CACHE_VERSION in public/sw.js, and redeploy, same as before.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "data-source");
const OUT = join(ROOT, "netlify", "functions", "data");

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

/** Parses a CSV file into an array of objects keyed by its header row. */
function readCsvAsObjects(path) {
  const rows = parseCsv(readFileSync(path, "utf-8"));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((col, idx) => {
      obj[col] = clean(r[idx] ?? "");
    });
    return obj;
  });
}

function clean(s) {
  return String(s).split(/\s+/).filter(Boolean).join(" "); // trims + collapses stray whitespace
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data), "utf-8");
  console.log(`  wrote ${path.replace(ROOT + "/", "")}`);
}

// ---------- vocabulary.csv -> vocabulary.json ----------
// Columns: Lesson, Frequency, Hebrew, English, POS, Category
function buildVocabulary() {
  const raw = readCsvAsObjects(join(SRC, "vocabulary.csv"));
  const rows = [];
  const lessonOrder = [];
  const seenLessons = new Set();
  const posSet = new Set();
  const categorySet = new Set();

  for (const r of raw) {
    const lesson = r.Lesson || "";
    if (!seenLessons.has(lesson)) {
      seenLessons.add(lesson);
      lessonOrder.push(lesson);
    }
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
  }

  writeJson(join(OUT, "vocabulary.json"), {
    rows,
    lessonOrder,
    posOrder: [...posSet].sort(),
    categoryOrder: [...categorySet].sort(),
  });
}

// ---------- accents.csv -> accents.json ----------
// Columns: Type, Group, HebrewName, EnglishName, Symbol, Placement, Keyboard
function buildAccents() {
  const raw = readCsvAsObjects(join(SRC, "accents.csv"));
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

  writeJson(join(OUT, "accents.json"), { rows, typeOrder, groupOrder });
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
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort(); // "01 ...", "02 ...", etc. sort correctly as plain strings

  const datasets = [];
  const data = {};

  for (const file of files) {
    const name = file.replace(/\.csv$/i, "").replace(/^\d+\s*/, "");
    const raw = readCsvAsObjects(join(dir, file));
    datasets.push(name);
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

  writeJson(join(OUT, "verbs.json"), { datasets, data });
}

console.log("Building data from data-source/ ...");
buildVocabulary();
buildAccents();
buildVerbs();
console.log("Done. Next steps:");
console.log("  1. Review the diff in netlify/functions/data/*.json");
console.log("  2. Bump CACHE_VERSION in public/sw.js");
console.log("  3. Commit everything and redeploy");
