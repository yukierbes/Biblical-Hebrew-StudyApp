#!/usr/bin/env node
// Builds netlify/functions/data/bible-mixed.json — the verses for the Reading page's "Mixed review":
// verses in which three or more of the Bible in Context pages each have a practice example, so one verse can ask
// about the article, the preposition, the vav, the verb and so on, all together.
//
// It reads the datasets that build-bible.mjs has just written (run that first) and writes only a short index:
// for each verse, which page and which example (the same example objects the pages use). The words and the answer
// choices still come from each page's own dataset, so a question here is exactly the question on that page.
//
//   node scripts/build-mixed.mjs --check      (writes nothing)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, "netlify", "functions", "data");
const CHECK_ONLY = process.argv.includes("--check");

// The pages, most useful first for a mixed verse (those about whole words come before marks and syllables).
const PAGES = ["article", "prefix", "vav", "min", "interrog", "verb", "noun", "adj", "pronoun", "demo", "suffix", "dagesh", "qames", "sheva", "syllable"];
const MAX_QUESTIONS = 4;
const MAX_VERSES = 250;

const errors = [];
const byRef = new Map(); // ref -> { page -> [ex] }
for (const page of PAGES) {
  const file = join(DATA, `bible-${page}.json`);
  if (!existsSync(file)) { errors.push(`bible-${page}.json is missing (run build-bible.mjs first).`); continue; }
  const d = JSON.parse(readFileSync(file, "utf8"));
  for (const ex of d.examples) {
    if (!d.verses[ex.ref]) continue;
    const m = byRef.get(ex.ref) || new Map();
    (m.get(page) || m.set(page, []).get(page)).push(ex);
    byRef.set(ex.ref, m);
  }
}
if (errors.length) {
  console.error("\nmixed-review build FAILED — nothing was written:");
  for (const e of errors) console.error("  ERROR: " + e);
  process.exit(1);
}

// a small, repeatable shuffle so a rebuild gives the same file
let seed = 20261024;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const verses = [];
for (const [ref, pages] of byRef) {
  if (pages.size < 3) continue;
  const order = PAGES.filter((p) => pages.has(p));
  const picks = [];
  const usedWords = new Set();
  for (const page of order) {
    if (picks.length >= MAX_QUESTIONS) break;
    const options = pages.get(page).filter((ex) => !usedWords.has(ex.wi) || page === "dagesh" || page === "sheva" || page === "qames" || page === "syllable");
    if (!options.length) continue;
    const ex = options[Math.floor(rand() * options.length)];
    usedWords.add(ex.wi);
    picks.push({ page: `bible-${page}`, ex });
  }
  if (picks.length >= 3) verses.push({ ref, picks });
}
verses.sort((a, b) => (a.ref < b.ref ? -1 : 1));
// keep a spread over the whole text when there are more than we need
const step = Math.max(1, Math.floor(verses.length / MAX_VERSES));
const kept = verses.filter((_, i) => i % step === 0).slice(0, MAX_VERSES);
if (kept.length < 20) {
  console.error(`mixed-review build FAILED: only ${kept.length} verses have three or more kinds of example.`);
  process.exit(1);
}
const json = JSON.stringify({ verses: kept });
console.log(`bible-mixed: ${kept.length} verses with 3–${MAX_QUESTIONS} questions each (${(json.length / 1024).toFixed(0)} KB)`);
if (!CHECK_ONLY) writeFileSync(join(DATA, "bible-mixed.json"), json);
