#!/usr/bin/env node
// Builds the data for the Reading page from the Open Scriptures Hebrew Bible files in data-source/bible/, the
// Strong's lexicon (HebrewStrong.xml) and the public-domain World English Bible in data-source/bible/english/.
//
// EVERY chapter of every book listed in BOOKS below is built. It writes, into netlify/functions/data/:
//   data/bible-reading.json       a small index: the books, how many verses each chapter has, the data version
//   data/reading/rd-<book>-<n>.json   one compact file per chapter (for example rd-gen-1.json): its verses, their parsing
//                                 and the English. NOT committed to git (see .gitignore): this script makes them on
//                                 every deploy, and `npm test` runs it first.
//   reading-chapters/rd-<book>-<n>.js  the same text as a JavaScript string, for the get-reading function (a string is
//                                 far lighter to bundle and start than JSON turned into objects). Not committed.
//   reading-chapters/loaders.js   one line per chapter, so get-reading.js can load one chapter at a time (committed)
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
const MODULES_OUT = join(dirname(OUT), "reading-chapters");
const CHECK_ONLY = process.argv.includes("--check");

// id: the book code used in the OSHB files and in references (Gen.1.1). The books are in the order of the Hebrew Bible
// (as in the BHS): Torah, the Former and Latter Prophets (the Twelve are listed as 12 books), then the Writings.
// division: torah | former | latter | twelve | writings (how the page groups the book list). title: the name in the book menu.
// name: the name used inside a reference (for example "Psalm 23:1"). The menu follows this order.
export const BOOKS = {
  Gen: { file: "Gen.xml", web: "web-genesis.json", name: "Genesis", title: "Genesis", division: "torah" },
  Exod: { file: "Exod.xml", web: "web-exodus.json", name: "Exodus", title: "Exodus", division: "torah" },
  Lev: { file: "Lev.xml", web: "web-leviticus.json", name: "Leviticus", title: "Leviticus", division: "torah" },
  Num: { file: "Num.xml", web: "web-numbers.json", name: "Numbers", title: "Numbers", division: "torah" },
  Deut: { file: "Deut.xml", web: "web-deuteronomy.json", name: "Deuteronomy", title: "Deuteronomy", division: "torah" },
  Josh: { file: "Josh.xml", web: "web-joshua.json", name: "Joshua", title: "Joshua", division: "former" },
  Judg: { file: "Judg.xml", web: "web-judges.json", name: "Judges", title: "Judges", division: "former" },
  "1Sam": { file: "1Sam.xml", web: "web-1samuel.json", name: "1 Samuel", title: "1 Samuel", division: "former" },
  "2Sam": { file: "2Sam.xml", web: "web-2samuel.json", name: "2 Samuel", title: "2 Samuel", division: "former" },
  "1Kgs": { file: "1Kgs.xml", web: "web-1kings.json", name: "1 Kings", title: "1 Kings", division: "former" },
  "2Kgs": { file: "2Kgs.xml", web: "web-2kings.json", name: "2 Kings", title: "2 Kings", division: "former" },
  Isa: { file: "Isa.xml", web: "web-isaiah.json", name: "Isaiah", title: "Isaiah", division: "latter" },
  Jer: { file: "Jer.xml", web: "web-jeremiah.json", name: "Jeremiah", title: "Jeremiah", division: "latter" },
  Ezek: { file: "Ezek.xml", web: "web-ezekiel.json", name: "Ezekiel", title: "Ezekiel", division: "latter" },
  Hos: { file: "Hos.xml", web: "web-hosea.json", name: "Hosea", title: "Hosea", division: "twelve" },
  Joel: { file: "Joel.xml", web: "web-joel.json", name: "Joel", title: "Joel", division: "twelve" },
  Amos: { file: "Amos.xml", web: "web-amos.json", name: "Amos", title: "Amos", division: "twelve" },
  Obad: { file: "Obad.xml", web: "web-obadiah.json", name: "Obadiah", title: "Obadiah", division: "twelve" },
  Jonah: { file: "Jonah.xml", web: "web-jonah.json", name: "Jonah", title: "Jonah", division: "twelve" },
  Mic: { file: "Mic.xml", web: "web-micah.json", name: "Micah", title: "Micah", division: "twelve" },
  Nah: { file: "Nah.xml", web: "web-nahum.json", name: "Nahum", title: "Nahum", division: "twelve" },
  Hab: { file: "Hab.xml", web: "web-habakkuk.json", name: "Habakkuk", title: "Habakkuk", division: "twelve" },
  Zeph: { file: "Zeph.xml", web: "web-zephaniah.json", name: "Zephaniah", title: "Zephaniah", division: "twelve" },
  Hag: { file: "Hag.xml", web: "web-haggai.json", name: "Haggai", title: "Haggai", division: "twelve" },
  Zech: { file: "Zech.xml", web: "web-zechariah.json", name: "Zechariah", title: "Zechariah", division: "twelve" },
  Mal: { file: "Mal.xml", web: "web-malachi.json", name: "Malachi", title: "Malachi", division: "twelve" },
  Ps: { file: "Ps.xml", web: "web-psalms.json", name: "Psalm", title: "Psalms", division: "writings" },
  Job: { file: "Job.xml", web: "web-job.json", name: "Job", title: "Job", division: "writings" },
  Prov: { file: "Prov.xml", web: "web-proverbs.json", name: "Proverbs", title: "Proverbs", division: "writings" },
  Ruth: { file: "Ruth.xml", web: "web-ruth.json", name: "Ruth", title: "Ruth", division: "writings" },
  Song: { file: "Song.xml", web: "web-songofsolomon.json", name: "Song of Songs", title: "Song of Songs", division: "writings" },
  Eccl: { file: "Eccl.xml", web: "web-ecclesiastes.json", name: "Ecclesiastes", title: "Ecclesiastes", division: "writings" },
  Lam: { file: "Lam.xml", web: "web-lamentations.json", name: "Lamentations", title: "Lamentations", division: "writings" },
  Esth: { file: "Esth.xml", web: "web-esther.json", name: "Esther", title: "Esther", division: "writings" },
  Dan: { file: "Dan.xml", web: "web-daniel.json", name: "Daniel", title: "Daniel", division: "writings" },
  Ezra: { file: "Ezra.xml", web: "web-ezra.json", name: "Ezra", title: "Ezra", division: "writings" },
  Neh: { file: "Neh.xml", web: "web-nehemiah.json", name: "Nehemiah", title: "Nehemiah", division: "writings" },
  "1Chr": { file: "1Chr.xml", web: "web-1chronicles.json", name: "1 Chronicles", title: "1 Chronicles", division: "writings" },
  "2Chr": { file: "2Chr.xml", web: "web-2chronicles.json", name: "2 Chronicles", title: "2 Chronicles", division: "writings" },
};
/** The dataset name of one chapter (the file name and the name the app asks get-data for), e.g. "rd-1sam-17". */
export const chapterDataset = (book, chapter) => `rd-${book.toLowerCase()}-${chapter}`;

// Aramaic has its own stems (the Peal is the Aramaic counterpart of the Qal): the names in the Open Scriptures guide to its morphology codes.
const ARAMAIC_STEMS = { q: "Peal", Q: "Peil", u: "Hithpeel", p: "Pael", P: "Ithpaal", M: "Hithpaal", a: "Aphel", h: "Haphel", s: "Saphel", e: "Shaphel", H: "Hophal", i: "Ithpeel", t: "Hishtaphel", v: "Ishtaphel", w: "Hithaphel", o: "Polel", z: "Ithpoel", r: "Hithpolel", f: "Hithpalpel", b: "Hephal", c: "Tiphel", m: "Poel", l: "Palpel", L: "Ithpalpel", O: "Ithpolel", G: "Ittaphal" };
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
export function describePiece(code, lang = "H") {
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
    const stem = (lang === "A" ? ARAMAIC_STEMS : STEMS)[code[1]] || "verb";
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
  const parts = aligned ? sp.map((p, i) => [p, describePiece(mp[i], w.lang)]) : [[sp.join(""), mp.map((c) => describePiece(c, w.lang)).join(" + ")]];
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
    const entry = { id, name: def.name, title: def.title, division: def.division, chapters: [], bytes: 0 };
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
        // The source marks a Hebrew verse that shares an English verse with a suffix: "1Kgs.22.43!b" is the second part of
        // English 22:43. The first part shows the whole English verse; a later part says where its English is.
        const mapped = /^(.+)!([a-z])$/.exec(kjv[v.ref] || v.ref);
        const engRef = mapped ? mapped[1] : kjv[v.ref] || v.ref;
        let en = titleEnglish[v.ref] || eng.verses[engRef.split(".").slice(1).join(".")];
        if (en && !titleEnglish[v.ref] && mapped && mapped[2] !== "a") en = `(In English this verse is a later part of ${def.title} ${engRef.split(".").slice(1).join(":")}, which is shown with the verse before it.)`;
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
if (!errors.length && built.length < 900) errors.push(`Only ${built.length} chapters were built (expected 929).`);

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
  books: index.books.map((b) => ({ id: b.id, name: b.name, title: b.title, division: b.division, chapters: b.chapters, kb: Math.round(b.bytes / 1024) })),
});
const loaders =
  `// WRITTEN BY scripts/build-reading.mjs — do not edit. One line per chapter, so get-reading.js can load one chapter at a time.\n` +
  `// (The chapter modules themselves are made on every deploy and are not kept in git.)\n` +
  `export const READING_CHAPTERS = {\n` +
  built.map((b) => `  "${b.name}": () => import("./${b.name}.js"),`).join("\n") +
  `\n};\n`;

const totalKb = built.reduce((n, b) => n + b.json.length, 0) / 1024;
for (const b of index.books) console.log(`  ${b.id.padEnd(5)} ${String(b.chapters.length).padStart(3)} chapters, ${String(b.chapters.reduce((n, x) => n + x, 0)).padStart(5)} verses, ${(b.bytes / 1024).toFixed(0)} KB`);
console.log(`bible-reading: ${index.books.length} books, ${built.length} chapters, ${verseTotal} verses, ${(totalKb / 1024).toFixed(1)} MB in all (about ${(totalKb / verseTotal).toFixed(2)} KB a verse); ${kqTotal} ketiv/qere items, ${aramaicWords} Aramaic words; version ${version}; index ${(indexJson.length / 1024).toFixed(0)} KB`);

if (!CHECK_ONLY) {
  mkdirSync(CHAPTERS_OUT, { recursive: true });
  mkdirSync(MODULES_OUT, { recursive: true });
  // Keep the generated files out of git wherever the repository's own .gitignore is (each folder ignores them itself).
  writeFileSync(join(CHAPTERS_OUT, ".gitignore"), "# made by scripts/build-reading.mjs on every build: not kept in git\n*\n");
  writeFileSync(join(MODULES_OUT, ".gitignore"), "# made by scripts/build-reading.mjs on every build: the chapter modules are not kept in git (loaders.js is)\nrd-*.js\n.gitignore\n");
  const keep = new Set(built.map((b) => `${b.name}.json`));
  for (const f of readdirSync(CHAPTERS_OUT)) if (f.endsWith(".json") && !keep.has(f)) unlinkSync(join(CHAPTERS_OUT, f));
  const keepJs = new Set(built.map((b) => `${b.name}.js`));
  for (const f of readdirSync(MODULES_OUT)) if (/^rd-.*\.js$/.test(f) && !keepJs.has(f)) unlinkSync(join(MODULES_OUT, f));
  for (const b of built) {
    writeFileSync(join(CHAPTERS_OUT, `${b.name}.json`), b.json);
    writeFileSync(join(MODULES_OUT, `${b.name}.js`), `export default ${JSON.stringify(b.json)};\n`);
  }
  writeFileSync(join(OUT, "bible-reading.json"), indexJson);
  writeFileSync(join(MODULES_OUT, "loaders.js"), loaders);
}
