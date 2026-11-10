#!/usr/bin/env node
// Builds the data for the Reading page from the Open Scriptures Hebrew Bible files in data-source/bible/, the
// Strong's lexicon (HebrewStrong.xml) and the public-domain World English Bible in data-source/bible/english/.
//
// EVERY chapter of every book listed in BOOKS below is built. It writes, into netlify/functions/data/:
//   bible-reading.json            a small index: the books, how many verses each chapter has, the data version
//   reading/rd-<book>-<n>.json    one compact file per chapter (for example rd-gen-1.json): its verses, their parsing
//                                 and the English. NOT committed to git (see .gitignore): this script makes them on
//                                 every deploy, and `npm test` runs it first.
//   reading-loaders.js            one line per chapter file, so the data function can load one chapter at a time
//
//   node scripts/build-reading.mjs --check      (writes nothing)
//
// A chapter file holds each word once, as a short array, with the repeated labels and dictionary entries kept in two
// small tables inside the file (see compactWord below); public/js/reading-data.js turns it back into the word objects
// the page uses. Chapters are split into sections of about 8 to 12 verses here, at a paragraph mark (petuhah or
// setumah) when one is close. Ketiv/qere pairs, Aramaic words and gaps are explained in scripts/lib/osis-reading.mjs.
// If anything is wrong the script stops with a message and writes nothing, so the site keeps its previous version.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { morphParts } from "./lib/article-rules.mjs";
import { parseReadingBook } from "./lib/osis-reading.mjs";
import { sectionsFor } from "./lib/sections.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "data-source", "bible");
const OUT = join(ROOT, "netlify", "functions", "data");
const CHAPTERS_OUT = join(OUT, "reading");
const CHECK_ONLY = process.argv.includes("--check");

// id: the book code used in the OSHB files and in references (Gen.1.1). title: the name in the book menu.
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
/** The dataset name of one chapter (the file name and the name the app asks get-data for), e.g. "rd-1sam-17". */
export const chapterDataset = (book, chapter) => `rd-${book.toLowerCase()}-${chapter}`;

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


// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

// What kind of word a piece is, as one letter, so the page can pick the right entry from the vocabulary list when
// several share a spelling (אֵל "God" and אֶל "to"): N noun, n proper name, V verb, A adjective, U numeral, P pronoun,
// R preposition, C conjunction, D adverb, T particle.
function posLetter(code) {
  const c = code[0];
  if (c === "N") return code[1] === "p" ? "n" : "N";
  if (c === "A") return "co".includes(code[1]) ? "U" : "A";
  return "VPRCDT".includes(c) ? c : "";
}

/** One OSHB word: its pieces with plain labels, its dictionary entry and a few facts. */
function analyzeWord(w, lexicon) {
  const mp = morphParts(w.morph);
  const sp = w.text.split("/");
  const lp = (w.lemma || "").split("/");
  const aligned = mp.length === sp.length;
  const parts = aligned ? sp.map((p, i) => [p, describePiece(mp[i])]) : [[sp.join(""), mp.map(describePiece).join(" + ")]];
  // the content piece: the last piece that has a Strong's number
  let num = null;
  let ci = -1;
  for (let i = lp.length - 1; i >= 0; i--) {
    const d = /^(\d+)/.exec(lp[i]);
    if (d) { num = d[1]; ci = i; break; }
  }
  const lex = num ? lexicon.get(num) : null;
  let piece = mp[Math.min(Math.max(ci, 0), mp.length - 1)] || "";
  if (piece[0] === "S" && mp.length > 1) piece = mp[mp.length - 2];
  const out = { t: w.text, parts, pos: piece ? posLetter(piece) : "", aramaic: w.lang === "A" };
  if (lex && lex.word) {
    out.lem = lex.word;
    out.gl = lex.gloss || "";
    out.verb = mp.some((c) => c[0] === "V");
  }
  return out;
}

/**
 * One chapter's words are kept in short arrays. The labels ("Qal · perfect · third person · masculine · singular") and
 * the dictionary entries repeat a great deal, so each is stored once in a table (L and X) and the words point to them.
 *   word      [text, [piece, labelNo, piece, labelNo ...], dictionaryNo or -1, flags, kind]
 *               flags: 1 = a verb (the root is read off the dictionary form), 2 = Aramaic     kind: see posLetter
 *   maqqef    [1, "־"]          other marks (sof pasuq, paseq, paragraph marks ...)  [2, text]
 *   ketiv/qere  [3, written consonants, [items of the qere ...], flags]      read but not written  [4, "", [items], flags]
 */
function makeCompactor(lexicon) {
  const labels = [];
  const labelNo = new Map();
  const dict = [];
  const dictNo = new Map();
  const no = (map, list, value, make) => {
    if (!map.has(value)) { map.set(value, list.length); list.push(make()); }
    return map.get(value);
  };
  const compactWord = (w) => {
    const a = analyzeWord(w, lexicon);
    const flat = [];
    for (const [piece, label] of a.parts) flat.push(piece, no(labelNo, labels, label, () => label));
    let x = -1;
    if (a.lem !== undefined) x = no(dictNo, dict, `${a.lem}\u0001${a.gl}`, () => [a.lem, a.gl]);
    return [a.t, flat, x, (a.verb ? 1 : 0) + (a.aramaic ? 2 : 0), a.pos];
  };
  const compactItem = (it) => {
    if (it.k === "seg") return [it.type === "x-maqqef" ? 1 : 2, it.text];
    if (it.k === "w") return compactWord(it);
    return [it.gap ? 4 : 3, it.written, it.qere.map(compactItem), it.lang === "A" ? 2 : 0];
  };
  return { compactItem, labels, dict };
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

const errors = [];
const warnings = [];
if (!existsSync(join(SRC, "HebrewStrong.xml"))) errors.push("data-source/bible/HebrewStrong.xml is missing.");

const built = []; // { name, json, book, chapter }
const index = { books: [] };
let verseTotal = 0;
let kqTotal = 0;
let aramaicWords = 0;
if (!errors.length) {
  const lexicon = parseLexicon(readFileSync(join(SRC, "HebrewStrong.xml"), "utf8"));
  if (lexicon.size < 8000) errors.push(`The lexicon has only ${lexicon.size} entries (expected about 8,700).`);
  for (const [id, def] of Object.entries(BOOKS)) {
    for (const f of [join(SRC, def.file), join(SRC, "english", def.web)]) if (!existsSync(f)) errors.push(`${f.replace(ROOT + "/", "")} is missing.`);
    if (errors.length) continue;
    const xml = readFileSync(join(SRC, def.file), "utf8");
    const verses = parseReadingBook(xml);
    const kjv = {};
    for (const m of xml.matchAll(/<verse osisID="([^"]+)"([^>]*)>([\s\S]*?)<\/verse>/g)) {
      const note = /<note>KJV:([^<]+)<\/note>/.exec(m[3]);
      if (note) kjv[m[1]] = note[1];
    }
    const eng = readEnglish(join(SRC, "english", def.web));
    // A psalm's heading is verse 1 (or verses 1–2) in the Hebrew but has no verse number in English. Those leading
    // Hebrew verses carry no KJV numbering note; the next verse's note says it is English verse 1.
    const titleEnglish = {};
    for (const v of verses) {
      const [bk, c] = v.ref.split(".");
      if (kjv[v.ref] || !eng.titles[c]) continue;
      const firstNoted = verses.find((x) => x.ref.startsWith(`${bk}.${c}.`) && kjv[x.ref]);
      if (!firstNoted || kjv[firstNoted.ref] !== `${bk}.${c}.1`) continue;
      const lead = verses.filter((x) => x.ref.startsWith(`${bk}.${c}.`) && !kjv[x.ref] && Number(x.ref.split(".")[2]) < Number(firstNoted.ref.split(".")[2]));
      if (lead.some((x) => x.ref === v.ref)) titleEnglish[v.ref] = lead[0].ref === v.ref ? eng.titles[c] : "(The heading continues from the verse before it; in English it is one sentence.)";
    }
    const byChapter = new Map();
    for (const v of verses) {
      const [, c, vn] = v.ref.split(".");
      if (!byChapter.has(Number(c))) byChapter.set(Number(c), []);
      byChapter.get(Number(c)).push({ ...v, n: Number(vn) });
    }
    const chapters = [...byChapter.keys()].sort((a, b) => a - b);
    if (chapters.some((c, i) => c !== i + 1)) errors.push(`${id}: the chapters are not numbered 1, 2, 3 … in order.`);
    const entry = { id, name: def.name, title: def.title, chapters: [], bytes: 0 };
    for (const c of chapters) {
      const vs = byChapter.get(c);
      if (vs.some((v, i) => v.n !== i + 1)) { errors.push(`${id} ${c}: the verses are not numbered 1, 2, 3 … in order.`); continue; }
      const { compactItem, labels, dict } = makeCompactor(lexicon);
      const chapter = { b: id, c, n: vs.length, s: sectionsFor(vs.length, new Set(vs.filter((v) => v.para).map((v) => v.n))), v: {}, e: {} };
      for (const v of vs) {
        chapter.v[v.n] = v.items.map(compactItem);
        for (const it of v.items) {
          if (it.k === "kq") kqTotal++;
          if (it.k === "w" && it.lang === "A") aramaicWords++;
        }
        const en = titleEnglish[v.ref] || eng.verses[(kjv[v.ref] || v.ref).split(".").slice(1).join(".")];
        if (en) chapter.e[v.n] = en;
        else warnings.push(`No English found for ${v.ref}.`);
      }
      const headings = vs.filter((v) => titleEnglish[v.ref]).length; // a psalm's heading counts as Hebrew verse 1 (or 1–2)
      if (headings) chapter.h = headings;
      chapter.L = labels;
      chapter.X = dict;
      const name = chapterDataset(id, c);
      const json = JSON.stringify(chapter);
      built.push({ name, json });
      entry.chapters.push(vs.length);
      entry.bytes += json.length;
      verseTotal += vs.length;
    }
    index.books.push(entry);
  }
}
if (!errors.length && built.length < 400) errors.push(`Only ${built.length} chapters were built (expected about 470).`);

if (errors.length) {
  console.error("\nreading build FAILED — nothing was written:");
  for (const e of errors) console.error("  ERROR: " + e);
  process.exit(1);
}
const missingEnglish = warnings.filter((w) => w.startsWith("No English"));
for (const w of warnings.filter((x) => !x.startsWith("No English"))) console.warn("  warning: " + w);
if (missingEnglish.length) console.warn(`  warning: ${missingEnglish.length} verses have no English (for example ${missingEnglish.slice(0, 3).map((w) => w.replace("No English found for ", "")).join(", ")}).`);

// The version changes only when the Reading data changes, so the app can keep chapters it has saved until then.
const hash = createHash("sha1");
for (const b of built) hash.update(b.name).update(b.json);
const version = hash.digest("hex").slice(0, 12);
const source = {
  name: "Open Scriptures Hebrew Bible",
  attribution: "Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb",
  license: "CC BY 4.0 (tagging and lexicon); the Westminster Leningrad Codex text is in the public domain",
  english: "World English Bible (public domain)",
};
const indexJson = JSON.stringify({
  source,
  version,
  books: index.books.map((b) => ({ id: b.id, name: b.name, title: b.title, chapters: b.chapters, kb: Math.round(b.bytes / 1024) })),
});
const loaders =
  `// WRITTEN BY scripts/build-reading.mjs — do not edit. One line per chapter file, so get-data.js can load one chapter at a time.\n` +
  `// (The chapter files themselves are made on every deploy and are not kept in git.)\n` +
  `export const READING_LOADERS = {\n` +
  built.map((b) => `  "${b.name}": () => import("./reading/${b.name}.json", { with: { type: "json" } }),`).join("\n") +
  `\n};\n`;

const totalKb = built.reduce((n, b) => n + b.json.length, 0) / 1024;
for (const b of index.books) console.log(`  ${b.id.padEnd(5)} ${String(b.chapters.length).padStart(3)} chapters, ${String(b.chapters.reduce((n, x) => n + x, 0)).padStart(5)} verses, ${(b.bytes / 1024).toFixed(0)} KB`);
console.log(`bible-reading: ${index.books.length} books, ${built.length} chapters, ${verseTotal} verses, ${(totalKb / 1024).toFixed(1)} MB in all (about ${(totalKb / verseTotal).toFixed(2)} KB a verse); ${kqTotal} ketiv/qere items, ${aramaicWords} Aramaic words; version ${version}; index ${(indexJson.length / 1024).toFixed(0)} KB`);

if (!CHECK_ONLY) {
  mkdirSync(CHAPTERS_OUT, { recursive: true });
  const keep = new Set(built.map((b) => `${b.name}.json`));
  for (const f of readdirSync(CHAPTERS_OUT)) if (f.endsWith(".json") && !keep.has(f)) unlinkSync(join(CHAPTERS_OUT, f));
  for (const b of built) writeFileSync(join(CHAPTERS_OUT, `${b.name}.json`), b.json);
  writeFileSync(join(OUT, "bible-reading.json"), indexJson);
  writeFileSync(join(OUT, "reading-loaders.js"), loaders);
}
