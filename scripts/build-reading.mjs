#!/usr/bin/env node
// Builds the data for the Reading page from the Open Scriptures Hebrew Bible files in data-source/bible/, the
// passages listed in reading-passages.csv, the Strong's lexicon (HebrewStrong.xml) and the public-domain World
// English Bible in data-source/bible/english/. It writes, into netlify/functions/data/:
//   bible-reading.json          a small index: the books, their chapters and their sections (no Hebrew text)
//   bible-reading-<book>.json   one file per book (for example bible-reading-gen.json) with that book's verses
//                               and English, loaded only when the learner opens the book
//
//   node scripts/build-reading.mjs --check      (writes nothing)
//
// Every word of every chosen verse is shipped with a plain-language parsing of each of its pieces (prefix,
// article, noun, verb with binyan and root, suffix …), worked out from the OSHB tagging. If anything is wrong the
// script stops with a message and writes nothing, so the site keeps its previous version.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOsis, morphParts } from "./lib/article-rules.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "data-source", "bible");
const OUT = join(ROOT, "netlify", "functions", "data");
const CHECK_ONLY = process.argv.includes("--check");

// id: the book code used in the OSHB files and in reading-passages.csv. title: the name in the book menu.
// name: the name used inside a reference (for example "Psalm 23:1"). The menu follows this order.
export const BOOKS = {
  Gen: { file: "Gen.xml", web: "web-genesis.json", name: "Genesis", title: "Genesis" },
  Exod: { file: "Exod.xml", web: "web-exodus.json", name: "Exodus", title: "Exodus" },
  Num: { file: "Num.xml", web: "web-numbers.json", name: "Numbers", title: "Numbers" },
  Deut: { file: "Deut.xml", web: "web-deuteronomy.json", name: "Deuteronomy", title: "Deuteronomy" },
  Josh: { file: "Josh.xml", web: "web-joshua.json", name: "Joshua", title: "Joshua" },
  Ruth: { file: "Ruth.xml", web: "web-ruth.json", name: "Ruth", title: "Ruth" },
  "1Sam": { file: "1Sam.xml", web: "web-1samuel.json", name: "1 Samuel", title: "1 Samuel" },
  Ps: { file: "Ps.xml", web: "web-psalms.json", name: "Psalm", title: "Psalms" },
  Prov: { file: "Prov.xml", web: "web-proverbs.json", name: "Proverbs", title: "Proverbs" },
  Isa: { file: "Isa.xml", web: "web-isaiah.json", name: "Isaiah", title: "Isaiah" },
  Jonah: { file: "Jonah.xml", web: "web-jonah.json", name: "Jonah", title: "Jonah" },
};
/** The name of one book's data file (also its dataset name in get-data.js), e.g. "bible-reading-1sam". */
export const bookDataset = (b) => `bible-reading-${b.toLowerCase()}`;

const STEMS = { q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil", H: "Hophal", t: "Hithpael", o: "Polel", O: "Polal", r: "Hithpolel", m: "Poel", M: "Poal", k: "Palel", K: "Pulal", Q: "Qal passive", l: "Pilpel", L: "Polpal", f: "Hithpalpel", D: "Nithpael", j: "Pealal", i: "Pilel", u: "Hothpaal", c: "Tiphil", v: "Hishtaphel", w: "Nithpalel", y: "Nithpoel", z: "Hithpoel" };
const VTYPES = { p: "perfect", q: "perfect (vav-consecutive)", i: "imperfect", w: "imperfect (vav-consecutive)", h: "cohortative", j: "jussive", v: "imperative", r: "active participle", s: "passive participle", a: "infinitive absolute", c: "infinitive construct" };
const GENDER = { m: "masculine", f: "feminine", c: "common", b: "masculine or feminine" };
const NUMBER = { s: "singular", p: "plural", d: "dual" };
const STATE = { a: "absolute", c: "construct", d: "determined" };
const PARTICLES = { a: "affirmation", d: "definite article", e: "exhortation", i: "interrogative", j: "interjection", m: "demonstrative particle", n: "negative", o: "object marker", r: "relative particle" };
const NTYPE = { c: "common noun", g: "gentilic noun", p: "proper name" };
const PTYPE = { d: "demonstrative pronoun", f: "indefinite pronoun", i: "interrogative pronoun", p: "personal pronoun", r: "relative pronoun" };
const ATYPE = { a: "adjective", c: "cardinal number", g: "gentilic adjective", o: "ordinal number" };

const join2 = (...xs) => xs.filter(Boolean).join(" · ");
const pgnWords = (person, g, n) => join2(person && "123".includes(person) ? `${person === "1" ? "first" : person === "2" ? "second" : "third"} person` : "", GENDER[g], NUMBER[n]);

/** One tagged piece (e.g. "Vqp3ms", "Td", "R") as a short plain-language label. */
export function describePiece(code) {
  const c = code[0];
  if (c === "C") return "conjunction";
  if (c === "D") return "adverb";
  if (c === "R") return code[1] === "d" ? "preposition with the definite article" : "preposition";
  if (c === "T") return PARTICLES[code[1]] || "particle";
  if (c === "N") return join2(NTYPE[code[1]] || "noun", code[1] === "p" ? "" : GENDER[code[2]], NUMBER[code[3]], STATE[code[4]]);
  if (c === "A") return join2(ATYPE[code[1]] || "adjective", GENDER[code[2]], NUMBER[code[3]], STATE[code[4]]);
  if (c === "P") return join2(PTYPE[code[1]] || "pronoun", code[1] === "p" ? pgnWords(code[2], code[3], code[4]) : join2(GENDER[code[3]], NUMBER[code[4]]));
  if (c === "S") {
    if (code[1] === "d") return "directional ה";
    if (code[1] === "h") return "paragogic ה";
    if (code[1] === "n") return "paragogic נ";
    return `pronominal suffix · ${pgnWords(code[2], code[3], code[4])}`;
  }
  if (c === "V") {
    const stem = STEMS[code[1]] || "verb";
    const type = VTYPES[code[2]] || "";
    if ("rs".includes(code[2])) return join2(stem, type, GENDER[code[3]], NUMBER[code[4]], STATE[code[5]]);
    if ("ac".includes(code[2])) return join2(stem, type);
    return join2(stem, type, pgnWords(code[3], code[4], code[5]));
  }
  return "word";
}

const stripMarks = (s) => s.replace(/[^\u05d0-\u05ea]/g, "");

function parseLexicon(xml) {
  const map = new Map();
  const re = /<entry id="H(\d+)"[^>]*>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) {
    const w = /<w([^>]*)>([^<]*)<\/w>/.exec(m[2]);
    const pos = (/pos="([^"]*)"/.exec(w ? w[1] : "") || [])[1] || "";
    const defs = [...m[2].matchAll(/<def>([^<]*)<\/def>/g)].map((x) => x[1].trim()).filter(Boolean);
    const usage = ((/<usage>([^<]*)<\/usage>/.exec(m[2]) || [])[1] || "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\bX\s*/g, "")
      .replace(/\.$/, "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    // Strong's "usage" reads best for nouns and names; the definitions read best for verbs.
    const clean = (g) => g.replace(/×\s*/g, "").replace(/\[as such unrepresented in English\]/, "(no English equivalent)").replace(/\s+/g, " ").trim();
    const gloss = pos.startsWith("v") ? defs.slice(0, 3).join(", ") || usage : usage || defs.slice(0, 3).join(", ");
    map.set(m[1], { word: w ? w[2] : "", gloss: clean(gloss) });
  }
  return map;
}

function readCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
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

/**
 * The English of one World English Bible JSON file: { verses: { "1.1": "text" }, titles: { 51: "heading" } }.
 * The WEB prints a psalm's heading as a separate "header" item just before the psalm; the Hebrew counts a heading as
 * one or two verses of its own (see titleEnglish below).
 */
function readEnglish(file) {
  const items = JSON.parse(readFileSync(file, "utf8"));
  const verses = {};
  const titles = {};
  let pendingHeader = "";
  for (const it of items) {
    if (it.type === "header") { pendingHeader = String(it.value || "").replace(/\s+/g, " ").trim(); continue; }
    if (!it.chapterNumber || !it.verseNumber || !/text$/.test(it.type)) continue;
    if (pendingHeader && !titles[it.chapterNumber]) titles[it.chapterNumber] = pendingHeader;
    pendingHeader = "";
    const k = `${it.chapterNumber}.${it.verseNumber}`;
    verses[k] = (verses[k] || "") + it.value;
  }
  for (const k of Object.keys(verses)) verses[k] = verses[k].replace(/\s+/g, " ").trim();
  return { verses, titles };
}

const errors = [];
const warnings = [];
if (!existsSync(join(SRC, "HebrewStrong.xml"))) errors.push("data-source/bible/HebrewStrong.xml is missing.");
if (!existsSync(join(SRC, "reading-passages.csv"))) errors.push("data-source/bible/reading-passages.csv is missing.");

// books: [{ id, name, title, dataset, works: [{ id, title, passages: [indexes into passages] }] }]; one data file per book
const out = { books: [], passages: [], perBook: {} };
if (!errors.length) {
  const lexicon = parseLexicon(readFileSync(join(SRC, "HebrewStrong.xml"), "utf8"));
  if (lexicon.size < 8000) errors.push(`The lexicon has only ${lexicon.size} entries (expected about 8,700).`);
  const rows = readCsv(readFileSync(join(SRC, "reading-passages.csv"), "utf8"));
  const head = rows.shift().map((h) => h.trim());
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  for (const need of ["Work", "Book", "Section", "Start", "End", "Note"]) if (!(need in idx)) errors.push(`reading-passages.csv is missing the "${need}" heading.`);
  const cache = {};
  const book = (b) => {
    if (cache[b]) return cache[b];
    const def = BOOKS[b];
    if (!def) { errors.push(`reading-passages.csv: unknown book "${b}" (use ${Object.keys(BOOKS).join(", ")}).`); return null; }
    for (const f of [join(SRC, def.file), join(SRC, "english", def.web)]) if (!existsSync(f)) { errors.push(`${f.replace(ROOT + "/", "")} is missing.`); return null; }
    const xml = readFileSync(join(SRC, def.file), "utf8");
    const verses = parseOsis(xml);
    const kjv = {};
    for (const m of xml.matchAll(/<verse osisID="([^"]+)"([^>]*)>([\s\S]*?)<\/verse>/g)) {
      const note = /<note>KJV:([^<]+)<\/note>/.exec(m[3]);
      if (note) kjv[m[1]] = note[1];
    }
    const eng = readEnglish(join(SRC, "english", def.web));
    // A psalm's heading is verse 1 (or verses 1–2) in the Hebrew but has no verse number in English. Those leading
    // Hebrew verses carry no KJV numbering note; the next verse's note says it is English verse 1.
    const titleEnglish = {};
    for (const m of xml.matchAll(/<verse osisID="([^"]+)"/g)) {
      const [bk, c, vn] = m[1].split(".");
      if (kjv[m[1]] || !eng.titles[c]) continue;
      const firstNoted = verses.find((x) => x.ref.startsWith(`${bk}.${c}.`) && kjv[x.ref]);
      if (!firstNoted || kjv[firstNoted.ref] !== `${bk}.${c}.1`) continue;
      const lead = verses.filter((x) => x.ref.startsWith(`${bk}.${c}.`) && !kjv[x.ref] && Number(x.ref.split(".")[2]) < Number(firstNoted.ref.split(".")[2]));
      if (lead.some((x) => x.ref === m[1])) titleEnglish[m[1]] = lead[0].ref === m[1] ? eng.titles[c] : "(The heading continues from the verse before it; in English it is one sentence.)";
    }
    return (cache[b] = { verses, order: verses.map((v) => v.ref), kjv, eng: eng.verses, titleEnglish });
  };
  if (!errors.length) {
    rows.forEach((r, n) => {
      const b = r[idx.Book].trim();
      const data = book(b);
      if (!data) return;
      const ref = (s) => `${b}.${String(s).trim().replace(":", ".")}`;
      const a = data.order.indexOf(ref(r[idx.Start]));
      const z = data.order.indexOf(ref(r[idx.End]));
      if (a < 0 || z < 0 || z < a) { errors.push(`reading-passages.csv line ${n + 2}: cannot find ${r[idx.Start]} to ${r[idx.End]} in ${b}.`); return; }
      if (z - a > 12) warnings.push(`reading-passages.csv line ${n + 2}: "${r[idx.Section]}" is ${z - a + 1} verses long — consider splitting it.`);
      const refs = data.order.slice(a, z + 1);
      // A BOOK is picked first, then one of its WORKS (a chapter, or a stretch of one: "Exodus 20:1–17"); a work's
      // SECTIONS are read one at a time.
      let bk = out.books.find((x) => x.id === b);
      if (!bk) {
        bk = { id: b, name: BOOKS[b].name, title: BOOKS[b].title, dataset: bookDataset(b), works: [] };
        out.books.push(bk);
        out.perBook[b] = { verses: {}, english: {} };
      }
      const workTitle = r[idx.Work].trim();
      let work = bk.works.find((w) => w.title === workTitle);
      if (!work) {
        work = { id: `${b}:${workTitle}`, title: workTitle, passages: [] };
        bk.works.push(work);
      }
      const sections = work.passages;
      const prev = sections.length ? out.passages[sections[sections.length - 1]] : null;
      if (prev && data.order.indexOf(prev.verses[prev.verses.length - 1]) + 1 !== a) warnings.push(`reading-passages.csv line ${n + 2}: "${r[idx.Section]}" does not continue straight on from the section before it.`);
      sections.push(out.passages.length);
      // "passages" is every section in reading order, the list the page indexes into. Its id stays the same when rows are added.
      out.passages.push({ id: refs[0], workId: work.id, book: b, title: r[idx.Section].trim(), note: (r[idx.Note] || "").trim(), verses: refs });
      const target = out.perBook[b];
      for (const vref of refs) {
        if (target.verses[vref]) continue;
        const v = data.verses.find((x) => x.ref === vref);
        target.verses[vref] = v.words.map((w) => {
          if (w.seg === "x-maqqef") return { t: w.text, m: 1 };
          if (w.seg) return { t: w.text, s: 1 };
          const mp = morphParts(w.morph);
          const sp = w.text.split("/");
          const lp = (w.lemma || "").split("/");
          const aligned = mp.length === sp.length;
          const parts = aligned ? sp.map((p, i) => [p, describePiece(mp[i])]) : [[w.text.split("/").join(""), mp.map(describePiece).join(" + ")]];
          // the content piece: the last piece that has a Strong's number
          let num = null;
          for (let i = lp.length - 1; i >= 0; i--) { const d = /^(\d+)/.exec(lp[i]); if (d) { num = d[1]; break; } }
          const lex = num ? lexicon.get(num) : null;
          const verbIdx = mp.findIndex((c) => c[0] === "V");
          const word = { t: w.text, parts };
          if (lex && lex.word) {
            word.lem = lex.word;
            if (lex.gloss) word.gl = lex.gloss;
            if (verbIdx >= 0) {
              const letters = [...stripMarks(lex.word)];
              if (letters.length === 3) word.root = letters.join(" – ");
            }
          }
          return word;
        });
        const en = data.titleEnglish[vref] || data.eng[(data.kjv[vref] || vref).split(".").slice(1).join(".")];
        if (en) target.english[vref] = en;
        else warnings.push(`No English found for ${vref}.`);
      }
    });
  }
}
if (!errors.length && out.passages.length < 3) errors.push("Fewer than three reading sections were built.");
// every section of a work, and every work of a book, must be listed together, so "next section" always means the next in the text
if (!errors.length) {
  const seen = new Set();
  let last = null;
  for (const p of out.passages) {
    if (p.workId !== last && seen.has(p.workId)) errors.push(`reading-passages.csv: the sections of "${p.workId.split(":").slice(1).join(":")}" are not all together — keep each chapter's rows next to each other.`);
    seen.add(p.workId);
    last = p.workId;
  }
  const seenBooks = new Set();
  let lastBook = null;
  for (const p of out.passages) {
    if (p.book !== lastBook && seenBooks.has(p.book)) errors.push(`reading-passages.csv: the rows of the book "${p.book}" are not all together — keep each book's rows next to each other.`);
    seenBooks.add(p.book);
    lastBook = p.book;
  }
}

if (errors.length) {
  console.error("\nreading build FAILED — nothing was written:");
  for (const e of errors) console.error("  ERROR: " + e);
  process.exit(1);
}
for (const w of warnings) console.warn("  warning: " + w);
const source = {
  name: "Open Scriptures Hebrew Bible",
  attribution: "Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb",
  license: "CC BY 4.0 (tagging and lexicon); the Westminster Leningrad Codex text is in the public domain",
  english: "World English Bible (public domain)",
};
const index = { source, books: out.books, passages: out.passages };
const indexJson = JSON.stringify(index);
const files = [["bible-reading.json", indexJson]];
let verseTotal = 0;
for (const bk of out.books) {
  const json = JSON.stringify(out.perBook[bk.id]);
  verseTotal += Object.keys(out.perBook[bk.id].verses).length;
  files.push([`${bk.dataset}.json`, json]);
  console.log(`  ${bk.dataset}: ${bk.works.length} chapters, ${Object.keys(out.perBook[bk.id].verses).length} verses (${(json.length / 1024).toFixed(0)} KB)`);
}
console.log(`bible-reading: ${out.books.length} books, ${out.passages.length} sections, ${verseTotal} verses; index ${(indexJson.length / 1024).toFixed(0)} KB`);
if (!CHECK_ONLY) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, json] of files) writeFileSync(join(OUT, name), json);
}
