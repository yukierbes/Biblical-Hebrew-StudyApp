#!/usr/bin/env node
// Builds netlify/functions/data/bible-article.json, bible-dagesh.json, bible-suffix.json, bible-qames.json and bible-sheva.json — the data for the
// "Definite Article", "Dagesh" and "Pronominal Suffixes" pages —
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
import { ARTICLE_PATTERNS, ARTICLE_GROUPS, parseOsis, findArticles, morphParts } from "./lib/article-rules.mjs";
import { DAGESH_PATTERNS, DAGESH_GROUPS, analyzeWord } from "./lib/dagesh-rules.mjs";
import { SUFFIX_PATTERNS, SUFFIX_GROUPS, SUFFIX_TABLE, findSuffixes } from "./lib/suffix-rules.mjs";
import { analyzeWord as analyzeHebrewWord, classifyAllQamets, classifyAllShevas } from "./lib/hebrew-word.mjs";
import { QAMES_PATTERNS, QAMES_GROUPS } from "./lib/qames-rules.mjs";
import { SHEVA_PATTERNS, SHEVA_GROUPS } from "./lib/sheva-rules.mjs";

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
for (const p of ARTICLE_PATTERNS) if (!errors.length && counts[p.id] < 2) warnings.push(`Pattern "${p.id}" has only ${counts[p.id]} examples in Genesis.`);

// ---- passages (one CSV per page) ----
function readPassages(file) {
  const passages = [];
  const pPath = join(SRC, file);
  if (!existsSync(pPath)) { errors.push(`data-source/bible/${file} is missing.`); return passages; }
  const rows = parseCsv(readFileSync(pPath, "utf8"));
  const head = rows.shift().map((h) => h.trim());
  for (const need of ["Title", "Start", "End", "Note"]) if (!head.includes(need)) errors.push(`${file} is missing the "${need}" heading.`);
  if (errors.length) return passages;
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  const order = verses.map((v) => v.ref);
  rows.forEach((r, n) => {
    const ref = (s) => "Gen." + String(s).trim().replace(":", ".");
    const a = order.indexOf(ref(r[idx.Start])), b = order.indexOf(ref(r[idx.End]));
    if (a < 0 || b < 0 || b < a) { errors.push(`${file} line ${n + 2}: cannot find ${r[idx.Start]} to ${r[idx.End]} in Genesis.`); return; }
    if (b - a > 12) warnings.push(`${file} line ${n + 2}: "${r[idx.Title]}" is ${b - a + 1} verses long — long passages are tiring to step through.`);
    passages.push({ title: r[idx.Title].trim(), note: (r[idx.Note] || "").trim(), verses: order.slice(a, b + 1) });
  });
  return passages;
}
const articlePassages = errors.length ? [] : readPassages("passages.csv");
const dageshPassages = errors.length ? [] : readPassages("passages-dagesh.csv");
const suffixPassages = errors.length ? [] : readPassages("passages-suffix.csv");
const qamesPassages = errors.length ? [] : readPassages("passages-qames.csv");
const shevaPassages = errors.length ? [] : readPassages("passages-sheva.csv");
const passages = articlePassages;
const passageRefs = new Set(articlePassages.flatMap((p) => p.verses));

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
      if (a) return { t: w.text, a: a.seg, p: a.pattern || "held", ...(a.note ? { n: a.note } : {}) };
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
  groups: ARTICLE_GROUPS,
  counts,
  passages,
  verses: verseOut,
  examples,
  held: held.map((h) => ({ ref: h.ref, wi: h.wi, reason: h.reason })),
};

// ---- Dagesh in Context ----
const DAGESH_MAX_WORDS = 12; // practice verses are short, to keep the data small and the questions readable
const dageshOut = { verses: {}, examples: [], held: [], counts: {}, shureq: 0 };
if (!errors.length) {
  const dPassageRefs = new Set(dageshPassages.flatMap((p) => p.verses));
  const wordCount = (v) => v.words.filter((w) => !w.seg).length;
  const counts = { lene: 0, forte: 0, mappiq: 0 };
  const keep = new Set(dPassageRefs);
  const perWord = new Map(); // "ref#wi" -> analysis
  for (const v of verses) {
    v.words.forEach((w, wi) => {
      if (w.seg) return;
      const res = analyzeWord(w.text.split("/").join(""));
      if (res.length) perWord.set(`${v.ref}#${wi}`, res);
    });
    if (wordCount(v) <= DAGESH_MAX_WORDS) keep.add(v.ref);
  }
  for (const v of verses) {
    if (!keep.has(v.ref)) continue;
    const heldHere = [];
    const words = v.words.map((w, wi) => {
      if (w.seg === "x-maqqef") return { t: w.text, m: 1 };
      if (w.seg) return { t: w.text, s: 1 };
      const res = perWord.get(`${v.ref}#${wi}`) || [];
      const d = [];
      const u = []; // positions of vavs whose dot is the šureq vowel (not a dagesh)
      for (const r of res) {
        if (r.kind === "shureq") { u.push(r.li); continue; }
        if (r.pattern) {
          d.push([r.li, r.pattern]);
          if (wordCount(v) <= DAGESH_MAX_WORDS) { dageshOut.examples.push({ ref: v.ref, wi, li: r.li, pattern: r.pattern }); counts[r.pattern]++; }
        } else {
          d.push([r.li, "held"]);
          dageshOut.held.push({ ref: v.ref, wi, li: r.li, reason: r.reason });
        }
      }
      return { t: w.text, ...(d.length ? { d } : {}), ...(u.length ? { u } : {}) };
    });
    dageshOut.verses[v.ref] = words;
  }
  dageshOut.counts = counts;
  // totals over the whole book, for the guide
  const total = { lene: 0, forte: 0, mappiq: 0, held: 0, shureq: 0 };
  for (const res of perWord.values()) for (const r of res) { if (r.kind === "shureq") total.shureq++; else total[r.pattern || "held"]++; }
  dageshOut.totals = total;
  for (const p of dageshPassages) {
    const steps = p.verses.reduce((n, ref) => n + (dageshOut.verses[ref] || []).reduce((m, w) => m + (w.d ? w.d.filter((x) => x[1] !== "held").length : 0), 0), 0);
    if (steps > 25) warnings.push(`passages-dagesh.csv: "${p.title}" has ${steps} dots to step through — consider a shorter passage.`);
  }
}

// ---- Pronominal Suffixes ----
const SUFFIX_MAX_WORDS = 12;
const suffixOut = { verses: {}, examples: [], held: [], counts: { type1: 0, type2: 0 }, totals: { type1: 0, type2: 0, held: 0 } };
if (!errors.length) {
  const found = findSuffixes(verses, morphParts);
  const byKey = new Map(found.map((x) => [`${x.ref}#${x.wi}`, x]));
  for (const x of found) {
    if (x.type) suffixOut.totals[x.type]++;
    else suffixOut.totals.held++;
  }
  const wordCount = (v) => v.words.filter((w) => !w.seg).length;
  const passageRefsSuffix = new Set(suffixPassages.flatMap((p) => p.verses));
  for (const v of verses) {
    const short = wordCount(v) <= SUFFIX_MAX_WORDS;
    if (!short && !passageRefsSuffix.has(v.ref)) continue;
    const hasAny = v.words.some((w, wi) => byKey.has(`${v.ref}#${wi}`));
    if (!hasAny && !passageRefsSuffix.has(v.ref)) continue;
    suffixOut.verses[v.ref] = v.words.map((w, wi) => {
      if (w.seg === "x-maqqef") return { t: w.text, m: 1 };
      if (w.seg) return { t: w.text, s: 1 };
      const x = byKey.get(`${v.ref}#${wi}`);
      if (!x) return { t: w.text };
      if (!x.type) {
        if (short) suffixOut.held.push({ ref: v.ref, wi, reason: x.reason });
        return { t: w.text, xh: 1 };
      }
      if (short) {
        suffixOut.examples.push({ ref: v.ref, wi, pattern: x.type, pgn: x.pgn, from: x.from, stem: x.stem });
        suffixOut.counts[x.type]++;
      }
      return { t: w.text, x: [x.type, x.pgn, x.from, x.stem] };
    });
  }
  for (const p of suffixPassages) {
    const steps = p.verses.reduce((n, ref) => n + (suffixOut.verses[ref] || []).filter((w) => w.x).length, 0);
    if (steps > 14) warnings.push(`passages-suffix.csv: "${p.title}" has ${steps} suffixes to step through — consider a shorter passage.`);
  }
}

// ---- Qameṣ vs Qameṣ-ḥaṭuf and Shevas (both read from the same word analysis) ----
const WORD_MAX = 12;
const PREFIX_TAG = /^(C|R|Td|Ti|Tr|Tm|Tj)$/;
const qamesOut = { verses: {}, examples: [], held: [], counts: {}, totals: {} };
const shevaOut = { verses: {}, examples: [], held: [], counts: {}, totals: {} };
if (!errors.length) {
  const wordCount = (v) => v.words.filter((w) => !w.seg).length;
  const qPassage = new Set(qamesPassages.flatMap((p) => p.verses));
  const sPassage = new Set(shevaPassages.flatMap((p) => p.verses));
  const qTotals = {};
  const sTotals = {};
  for (const v of verses) {
    const short = wordCount(v) <= WORD_MAX;
    const keepQ = short || qPassage.has(v.ref);
    const keepS = short || sPassage.has(v.ref);
    const qWords = [];
    const sWords = [];
    v.words.forEach((w, wi) => {
      if (w.seg === "x-maqqef") { qWords.push({ t: w.text, m: 1 }); sWords.push({ t: w.text, m: 1 }); return; }
      if (w.seg) { qWords.push({ t: w.text, s: 1 }); sWords.push({ t: w.text, s: 1 }); return; }
      const next = v.words[wi + 1];
      const beforeMaqqef = !!(next && next.seg === "x-maqqef");
      const lastInVerse = !v.words.slice(wi + 1).some((x) => !x.seg);
      // where the first root letter is, after any prefixes (a conjunction, preposition or the article); a preposition
      // that is followed by a suffix is the stem itself (לָךְ), not a prefix
      const pieces = w.text.split("/");
      const tags = morphParts(w.morph);
      let k = 0, stemStart = 0;
      while (k < pieces.length - 1 && PREFIX_TAG.test(tags[k] || "") && !/^S/.test(tags[k + 1] || "")) { stemStart += [...pieces[k]].filter((c) => c >= "א" && c <= "ת").length; k++; }
      const an = analyzeHebrewWord(pieces.join(""), { stemStart, beforeMaqqef, lastInVerse });
      const q = [], qh = [], sh = [], shh = [];
      for (const r of classifyAllQamets(an)) {
        if (r.pattern) { qTotals[r.pattern] = (qTotals[r.pattern] || 0) + 1; q.push([r.li, r.pattern]); if (short) { qamesOut.examples.push({ ref: v.ref, wi, li: r.li, pattern: r.pattern }); qamesOut.counts[r.pattern] = (qamesOut.counts[r.pattern] || 0) + 1; } }
        else { qTotals.held = (qTotals.held || 0) + 1; qh.push(r.li); if (short) qamesOut.held.push({ ref: v.ref, wi, li: r.li, reason: r.why }); }
      }
      for (const r of classifyAllShevas(an)) {
        if (r.pattern) { sTotals[r.pattern] = (sTotals[r.pattern] || 0) + 1; sh.push([r.li, r.pattern]); if (short) { shevaOut.examples.push({ ref: v.ref, wi, li: r.li, pattern: r.pattern }); shevaOut.counts[r.pattern] = (shevaOut.counts[r.pattern] || 0) + 1; } }
        else { sTotals.held = (sTotals.held || 0) + 1; shh.push(r.li); if (short) shevaOut.held.push({ ref: v.ref, wi, li: r.li, reason: r.why }); }
      }
      qWords.push({ t: w.text, ...(q.length ? { q } : {}), ...(qh.length ? { qh } : {}) });
      sWords.push({ t: w.text, ...(sh.length ? { sh } : {}), ...(shh.length ? { shh } : {}) });
    });
    if (keepQ) qamesOut.verses[v.ref] = qWords;
    if (keepS) shevaOut.verses[v.ref] = sWords;
  }
  qamesOut.totals = qTotals;
  shevaOut.totals = sTotals;
  for (const [name, passages, out, key] of [["passages-qames.csv", qamesPassages, qamesOut, "q"], ["passages-sheva.csv", shevaPassages, shevaOut, "sh"]]) {
    for (const p of passages) {
      const steps = p.verses.reduce((n, ref) => n + (out.verses[ref] || []).reduce((m, w) => m + (w[key] ? w[key].length : 0), 0), 0);
      if (steps > 16) warnings.push(`${name}: "${p.title}" has ${steps} items to step through — consider a shorter passage.`);
    }
  }
}

if (errors.length) {
  console.error("\nbible build FAILED — nothing was written:");
  for (const e of errors) console.error("  ERROR: " + e);
  process.exit(1);
}
for (const w of warnings) console.warn("  warning: " + w);
const dageshData = {
  source: output.source,
  patterns: DAGESH_PATTERNS,
  groups: DAGESH_GROUPS,
  counts: dageshOut.counts,
  totals: dageshOut.totals,
  passages: dageshPassages,
  verses: dageshOut.verses,
  examples: dageshOut.examples,
  held: dageshOut.held,
};
const dageshJson = JSON.stringify(dageshData);
const suffixData = {
  source: output.source,
  patterns: SUFFIX_PATTERNS,
  groups: SUFFIX_GROUPS,
  table: SUFFIX_TABLE,
  counts: suffixOut.counts,
  totals: suffixOut.totals,
  passages: suffixPassages,
  verses: suffixOut.verses,
  examples: suffixOut.examples,
  held: suffixOut.held,
};
const suffixJson = JSON.stringify(suffixData);
const qamesData = { source: output.source, patterns: QAMES_PATTERNS, groups: QAMES_GROUPS, counts: qamesOut.counts, totals: qamesOut.totals, passages: qamesPassages, verses: qamesOut.verses, examples: qamesOut.examples, held: qamesOut.held };
const shevaData = { source: output.source, patterns: SHEVA_PATTERNS, groups: SHEVA_GROUPS, counts: shevaOut.counts, totals: shevaOut.totals, passages: shevaPassages, verses: shevaOut.verses, examples: shevaOut.examples, held: shevaOut.held };
const qamesJson = JSON.stringify(qamesData);
const shevaJson = JSON.stringify(shevaData);
const json = JSON.stringify(output);
console.log(`bible-qames: ${qamesData.examples.length} practice examples, ${qamesData.held.length} held back, ${qamesPassages.length} passages, ${Object.keys(qamesData.verses).length} verses (${(qamesJson.length / 1024).toFixed(0)} KB)`);
console.log(`bible-sheva: ${shevaData.examples.length} practice examples, ${shevaData.held.length} held back, ${shevaPassages.length} passages, ${Object.keys(shevaData.verses).length} verses (${(shevaJson.length / 1024).toFixed(0)} KB)`);
console.log(`bible-suffix: ${suffixData.examples.length} practice examples (${suffixData.counts.type1} Type 1, ${suffixData.counts.type2} Type 2), ${suffixData.held.length} held back, ${suffixPassages.length} passages, ${Object.keys(suffixData.verses).length} verses (${(suffixJson.length / 1024).toFixed(0)} KB)`);
console.log(`bible-dagesh: ${dageshData.examples.length} practice examples (${dageshData.counts.lene} lene, ${dageshData.counts.forte} forte, ${dageshData.counts.mappiq} mappiq), ${dageshData.held.length} held back, ${dageshPassages.length} passages, ${Object.keys(dageshData.verses).length} verses (${(dageshJson.length / 1024).toFixed(0)} KB)`);
console.log(`bible-article: ${found.length} articles found in Genesis → ${examples.length} practice examples, ${held.length} held back, ${passages.length} passages, ${Object.keys(verseOut).length} verses (${(json.length / 1024).toFixed(0)} KB)`);
if (!CHECK_ONLY) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "bible-article.json"), json);
  writeFileSync(join(OUT, "bible-dagesh.json"), dageshJson);
  writeFileSync(join(OUT, "bible-suffix.json"), suffixJson);
  writeFileSync(join(OUT, "bible-qames.json"), qamesJson);
  writeFileSync(join(OUT, "bible-sheva.json"), shevaJson);
}
