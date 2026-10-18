#!/usr/bin/env node
// Builds netlify/functions/data/bible-article.json — the "Definite Article in Context" data —
// from the Open Scriptures Hebrew Bible file(s) in data-source/bible/.
//
// Like build-data.mjs, you normally never run this yourself: Netlify runs it on every deploy
// (see netlify.toml). To check things on your own computer without writing anything:
//
//   node scripts/build-bible.mjs --check     (or: npm run check-bible)
//
// What it does: finds every definite article the OSHB tags in Genesis, sorts each into one of the
// patterns in scripts/lib/article-rules.mjs (your rule sheets), and writes ONLY the verses the app
// needs (the guided passages plus verses with a sorted article). Cases that do not match your
// rules are written to a separate "held" list and are never used as practice examples.
//
// If anything is wrong (a missing file, a passage that cannot be found, suspiciously few articles),
// nothing is written and the deploy keeps the previous version of the site.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ARTICLE_PATTERNS, parseOsis, findArticles, morphParts } from "./lib/article-rules.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "data-source", "bible");
const OUT = join(ROOT, "netlify", "functions", "data");
const CHECK_ONLY = process.argv.includes("--check");
const MAX_WORDS_PER_EXAMPLE_VERSE = 20; // longer verses are too heavy for a practice question

const errors = [];
const warnings = [];

// ---- CSV (passages) — tiny reader, quotes supported ----
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// ---- read Genesis ----
const genPath = join(SRC, "Gen.xml");
if (!existsSync(genPath)) errors.push("data-source/bible/Gen.xml is missing.");
let verses = [];
if (!errors.length) {
  const xml = readFileSync(genPath, "utf8");
  if (!xml.includes("Open Scriptures Hebrew Bible")) errors.push("data-source/bible/Gen.xml does not look like an Open Scriptures Hebrew Bible file.");
  verses = parseOsis(xml);
  if (verses.length < 1500) errors.push(`Gen.xml has only ${verses.length} verses (Genesis has 1,533). The file may be cut off.`);
}

const found = errors.length ? [] : findArticles(verses);
if (!errors.length && found.length < 1400) errors.push(`Only ${found.length} articles were found in Genesis (expected about 1,500).`);
const classified = found.filter((a) => a.pattern);
const held = found.filter((a) => !a.pattern);
const counts = Object.fromEntries(ARTICLE_PATTERNS.map((p) => [p.id, classified.filter((a) => a.pattern === p.id).length]));
for (const p of ARTICLE_PATTERNS) if (!errors.length && counts[p.id] < 3) warnings.push(`Pattern "${p.id}" has only ${counts[p.id]} examples in Genesis.`);

// ---- passages ----
const passages = [];
const passageRefs = new Set();
const pPath = join(SRC, "passages.csv");
if (!errors.length) {
  if (!existsSync(pPath)) errors.push("data-source/bible/passages.csv is missing.");
  else {
    const rows = parseCsv(readFileSync(pPath, "utf8"));
    const head = rows.shift().map((h) => h.trim());
    for (const need of ["Title", "Start", "End", "Note"]) if (!head.includes(need)) errors.push(`passages.csv is missing the "${need}" heading.`);
    if (!errors.length) {
      const idx = Object.fromEntries(head.map((h, i) => [h, i]));
      const order = verses.map((v) => v.ref);
      rows.forEach((r, n) => {
        const ref = (s) => "Gen." + String(s).trim().replace(":", ".");
        const a = order.indexOf(ref(r[idx.Start])), b = order.indexOf(ref(r[idx.End]));
        if (a < 0 || b < 0 || b < a) { errors.push(`passages.csv line ${n + 2}: cannot find ${r[idx.Start]} to ${r[idx.End]} in Genesis.`); return; }
        if (b - a > 12) warnings.push(`passages.csv line ${n + 2}: "${r[idx.Title]}" is ${b - a + 1} verses long — long passages are tiring to step through.`);
        const refs = order.slice(a, b + 1);
        refs.forEach((x) => passageRefs.add(x));
        passages.push({ title: r[idx.Title].trim(), note: (r[idx.Note] || "").trim(), verses: refs });
      });
    }
  }
}

// ---- the verses the app needs ----
const verseOut = {};
const examples = [];
if (!errors.length) {
  const articleKey = new Map(found.map((a) => [`${a.ref}#${a.wi}`, a]));
  const wordCount = (v) => v.words.filter((w) => !w.seg).length;
  const exampleVerses = new Set();
  for (const a of classified) {
    const v = verses.find((x) => x.ref === a.ref);
    if (wordCount(v) <= MAX_WORDS_PER_EXAMPLE_VERSE) {
      examples.push({ ref: a.ref, wi: a.wi, pattern: a.pattern });
      exampleVerses.add(a.ref);
    }
  }
  for (const v of verses) {
    if (!passageRefs.has(v.ref) && !exampleVerses.has(v.ref)) continue;
    verseOut[v.ref] = v.words.map((w, wi) => {
      if (w.seg === "x-maqqef") return { t: w.text, m: 1 };
      if (w.seg) return { t: w.text, s: 1 };
      const a = articleKey.get(`${v.ref}#${wi}`);
      if (a) return { t: w.text, a: a.seg, p: a.pattern || "held" };
      if (morphParts(w.morph).includes("Ti")) return { t: w.text, i: 1 }; // the question-marker ה, which looks like the article
      return { t: w.text };
    });
  }
}

const output = {
  source: {
    book: "Genesis",
    name: "Open Scriptures Hebrew Bible",
    attribution: "Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb",
    license: "CC BY 4.0 (tagging); the Westminster Leningrad Codex text is in the public domain",
  },
  patterns: ARTICLE_PATTERNS,
  counts,
  passages,
  verses: verseOut,
  examples,
  held: held.map((h) => ({ ref: h.ref, wi: h.wi, reason: h.reason })),
};

if (errors.length) {
  console.error("\nbible build FAILED — nothing was written:");
  for (const e of errors) console.error("  ERROR: " + e);
  process.exit(1);
}
for (const w of warnings) console.warn("  warning: " + w);
const json = JSON.stringify(output);
console.log(`bible-article: ${found.length} articles found in Genesis → ${examples.length} practice examples, ${held.length} held back, ${passages.length} passages, ${Object.keys(verseOut).length} verses (${(json.length / 1024).toFixed(0)} KB)`);
if (!CHECK_ONLY) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "bible-article.json"), json);
}
