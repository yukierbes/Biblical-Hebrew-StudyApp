import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { assert, summary } from "./helpers.mjs";
import { parseReadingBook } from "../scripts/lib/osis-reading.mjs";
import { expandChapter, rootOf, plainRef, parseRef, chapterDatasetName, readWords } from "../public/js/reading-data.js";

// How the Reading data is built: the reader for the Hebrew source (ketiv/qere, Aramaic, paragraph marks), the sections
// a chapter is split into, and the integrity of everything that was built.

const verse = (id, body) => `<verse osisID="${id}">${body}</verse>`;
const w = (text, morph = "HNcmsa", extra = "") => `<w lemma="1" morph="${morph}"${extra}>${text}</w>`;

console.log("Reading the source: ketiv and qere");
{
  // written word + a note holding the pointed word that is read
  let v = parseReadingBook(verse("T.1.1", w("א/ב") + w("ידע", "HVqi3ms", ' type="x-ketiv"') + '<note type="variant"><catchWord>ידע</catchWord><rdg type="x-qere"><w lemma="2" morph="HNcfsa">מוֹדַ֣ע</w></rdg></note>' + w("ג")))[0];
  const kq = v.items.filter((x) => x.k === "kq");
  assert(v.items.length === 3 && kq.length === 1 && kq[0].written === "ידע" && !kq[0].gap && kq[0].qere.length === 1 && kq[0].qere[0].text === "מוֹדַ֣ע", "a ketiv and its qere become one item that keeps the written consonants and the pointed qere");
  assert(kq[0].ketivWord && kq[0].ketivWord.morph === "HVqi3ms", "(the ketiv's own analysis is kept in the data, not shown)");
  // qere only
  v = parseReadingBook(verse("T.1.2", w("א") + '<note type="variant"><rdg type="x-qere"><w lemma="2" morph="HR">אֵלַ֖/י</w></rdg></note>' + w("ב")))[0];
  assert(v.items.length === 3 && v.items[1].k === "kq" && v.items[1].gap === true && v.items[1].written === "", "a qere with no ketiv is a gap: read but not written");
  // ketiv only
  v = parseReadingBook(verse("T.1.3", w("אם", "HC", ' type="x-ketiv"') + '<note type="variant"><catchWord>אם</catchWord><rdg type="x-qere"/></note>'))[0];
  assert(v.items.length === 1 && v.items[0].k === "kq" && v.items[0].qere.length === 0 && v.items[0].written === "אם", "a ketiv with an empty qere is written but not read");
  // two-word qere
  v = parseReadingBook(verse("T.1.4", w("בגד", "HC", ' type="x-ketiv"') + '<note type="variant"><catchWord>בגד</catchWord><rdg type="x-qere"><w lemma="1" morph="HVqp3ms">בָּ֣א</w><w lemma="2" morph="HNp">גָ֑ד</w></rdg></note>'))[0];
  assert(v.items.length === 1 && v.items[0].qere.filter((x) => x.k === "w").length === 2, "a qere of two words stays in one item");
  // a written phrase of two words (the catchWord says so)
  v = parseReadingBook(verse("T.1.5", w("א/ו") + w("עשה", "HVqi3ms", ' type="x-ketiv"') + '<note type="variant"><catchWord>א/ו־עשה</catchWord><rdg type="x-qere"><w lemma="1" morph="HD">לֹא</w><seg type="x-maqqef">־</seg><w lemma="2" morph="HVqi3ms">יַעֲשֶׂה</w></rdg></note>' + w("ח")))[0];
  assert(v.items.length === 2 && v.items[0].written === "או עשה" && v.items[0].qere.length === 3, "when the catchWord shows the ketiv spans two words, both written words are joined (א/ו + עשה)");
  // a catchWord that does not match the words before it: only the ketiv word itself is taken
  v = parseReadingBook(verse("T.1.6", w("זזז") + w("עשה", "HVqi3ms", ' type="x-ketiv"') + '<note type="variant"><catchWord>א/ו־עשה</catchWord><rdg type="x-qere"><w lemma="1" morph="HD">לֹא</w></rdg></note>'))[0];
  assert(v.items.length === 2 && v.items[1].written === "עשה", "a catchWord that does not match leaves the word before it alone");
  // editorial notes and accent variants are not shown
  v = parseReadingBook(verse("T.1.7", w("א") + '<note type="alternative"><rdg type="x-accent"><w lemma="1" morph="HNcmsa">בּ</w></rdg></note>' + '<note n="1">a remark</note>' + w("ב")))[0];
  assert(v.items.length === 2 && v.items.every((x) => x.k === "w"), "editorial notes and accent variants add nothing");
  // a ketiv word keeps vowels out of the written text even if the source has some
  v = parseReadingBook(verse("T.1.8", w("יְעַשׂ", "HVqi3ms", ' type="x-ketiv"') + '<note type="variant"><catchWord>יעש</catchWord><rdg type="x-qere"><w lemma="1" morph="HVqi3ms">יַעַשׂ</w></rdg></note>'))[0];
  assert(v.items[0].written === "יעש", "the written text is consonants only");
}

console.log("\nReading the source: Aramaic and paragraph marks");
{
  const v = parseReadingBook(verse("T.2.1", w("עברי", "HNcmsa") + w("יְגַר", "ANcmsa") + `<seg type="x-pe">{פ}</seg>`) + verse("T.2.2", w("א")))
  assert(v[0].items[0].lang === "H" && v[0].items[1].lang === "A", "each word is marked Hebrew (H) or Aramaic (A) from its morphology code");
  assert(v[0].para === true && v[1].para === false, "a petuhah (פ) or setumah (ס) at the end of a verse is noted");
  assert(parseReadingBook(verse("T.2.3", w("א") + `<seg type="x-samekh">{ס}</seg>`))[0].para === true, "...either kind");
  assert(v[0].items.some((x) => x.k === "seg" && x.type === "x-pe"), "the mark itself is still shown");
}

console.log("\nSections of a chapter");
const { sectionsFor } = await import("../scripts/lib/sections.mjs");
assert(JSON.stringify(sectionsFor(1)) === "[[1,1]]" && JSON.stringify(sectionsFor(12)) === "[[1,12]]", "a chapter of up to 12 verses is one section");
assert(sectionsFor(13).length === 2 && sectionsFor(31).length === 4 && sectionsFor(176).length === 18, "a longer chapter is split into about ten verses each (13: two, 31: four, 176: eighteen)");
assert(JSON.stringify(sectionsFor(24)) === "[[1,8],[9,16],[17,24]]", "24 verses: three even sections");
assert(JSON.stringify(sectionsFor(24, new Set([9]))[0]) === "[1,9]", "a section ends at a paragraph mark within two verses of the even split (the first section ends at verse 9, not 8)");
assert(JSON.stringify(sectionsFor(24, new Set([4, 12]))) === JSON.stringify(sectionsFor(24)), "...but a paragraph mark far from the split, or one that would leave a tiny section, is not used");
let sectionsOk = true;
for (let n = 1; n <= 180; n++) {
  for (const para of [new Set(), new Set([5, 9, 10, 14, 20, 33]), new Set(Array.from({ length: n }, (_, i) => i + 1))]) {
    const s = sectionsFor(n, para);
    const contiguous = s.every(([f, t], i) => f === (i ? s[i - 1][1] + 1 : 1) && t >= f) && s[s.length - 1][1] === n;
    const sizes = s.map(([f, t]) => t - f + 1);
    if (!contiguous || (n > 12 && (Math.min(...sizes) < 4 || Math.max(...sizes) > 14))) sectionsOk = false;
  }
}
assert(sectionsOk, "for every chapter length from 1 to 180 verses, with or without paragraph marks, the sections follow one another with none missing, and are 4 to 14 verses (once the chapter is longer than 12)");
const built = JSON.parse(fs.readFileSync(new URL("../netlify/functions/data/bible-reading.json", import.meta.url), "utf8"));
const chapter = (b, n) => JSON.parse(fs.readFileSync(new URL(`../netlify/functions/data/reading/rd-${b.toLowerCase()}-${n}.json`, import.meta.url), "utf8"));
{
  const lens = (b, n) => chapter(b, n).s.map(([f, t]) => t - f + 1);
  assert(lens("Jonah", 1).join() === "8,8", `Jonah 1 (16 verses) is two sections of eight (${lens("Jonah", 1)})`);
  assert(lens("Ruth", 1).length === 3 && lens("Ps", 117).join() === "2", "Ruth 1 (22 verses) is three sections; Psalm 117 (2 verses) is a single short section");
  assert(lens("Gen", 1).length === 4 && lens("Ps", 119).length >= 15 && Math.max(...lens("Ps", 119)) <= 14, "long chapters are split into sections of about ten verses");
  // a paragraph mark close to an even split is used
  const gen1 = chapter("Gen", 1);
  const paraEnds = new Set();
  const gx = fs.readFileSync(new URL("../data-source/bible/Gen.xml", import.meta.url), "utf8");
  for (const v of parseReadingBook(gx).filter((x) => x.ref.startsWith("Gen.1.") && x.para)) paraEnds.add(Number(v.ref.split(".")[2]));
  const ends = gen1.s.slice(0, -1).map(([, t]) => t);
  assert(paraEnds.size > 0 && ends.some((e) => paraEnds.has(e)), `Genesis 1: a section ends at a paragraph mark where one is close (marks after verses ${[...paraEnds]}; sections end at ${ends})`);
}

console.log("\nEverything that was built holds together");
{
  let chapters = 0, verses = 0, wordsN = 0, bad = [];
  for (const b of built.books) {
    for (let n = 1; n <= b.chapters.length; n++) {
      const raw = chapter(b.id, n);
      const ch = expandChapter(raw);
      chapters++;
      if (raw.n !== b.chapters[n - 1] || raw.b !== b.id || raw.c !== n) bad.push(`${b.id} ${n}: header`);
      if (raw.L.some((l) => typeof l !== "string") || raw.X.some((x) => !Array.isArray(x) || typeof x[0] !== "string")) bad.push(`${b.id} ${n}: tables`);
      for (const [ref, words] of Object.entries(ch.verses)) {
        verses++;
        for (const x of words) {
          wordsN++;
          if (x.m || x.s) { if (typeof x.t !== "string" || !x.t) bad.push(`${ref}: empty mark`); continue; }
          if (x.kq) { if (x.kq.words.some((q) => !q.m && !q.s && (!q.parts || !q.parts.length))) bad.push(`${ref}: qere without parts`); continue; }
          if (!x.parts.length || x.parts.some((p) => typeof p[1] !== "string" || !p[1])) bad.push(`${ref}: a word without labelled parts`);
          if (x.parts.map((p) => p[0]).join("") !== x.t.split("/").join("")) bad.push(`${ref}: the pieces of ${x.t} do not make the word`);
        }
        if (bad.length > 5) break;
      }
      if (bad.length > 5) break;
    }
  }
  assert(bad.length === 0, `all ${chapters} chapters, ${verses} verses and ${wordsN} words are well formed${bad.length ? ": " + bad.slice(0, 3).join("; ") : ""}`);
}
{
  const rawGen = chapter("Gen", 1);
  const labelCount = rawGen.L.length, words = Object.values(rawGen.v).flat().filter((x) => typeof x[0] === "string").length;
  assert(labelCount < words / 4 && new Set(rawGen.L).size === labelCount, `labels are stored once (${labelCount} labels for ${words} words)`);
  assert(new Set(rawGen.X.map((x) => x.join("|"))).size === rawGen.X.length, "...and so are dictionary entries");
}

console.log("\nThe helper functions");
assert(rootOf("בָּרָא") === "ב – ר – א" && rootOf("שָׁמַר") === "ש – מ – ר" && rootOf("אֲנִי") === "א – נ – י" && rootOf("אִישׁ") === "א – י – ש" && rootOf("אָב") === "" && rootOf("") === "", "a root is three letters, or nothing");
assert(plainRef("Genesis", 1, 1, 9) === "Genesis 1:1–9" && plainRef("Psalm", 23, 4, 4) === "Psalm 23:4", "plain references");
assert(JSON.stringify(parseRef("Gen.12.3")) === '{"book":"Gen","chapter":12,"verse":3}' && chapterDatasetName("1Sam", 17) === "rd-1sam-17", "references and chapter names");
const mixed = [{ t: "א", parts: [] }, { t: "־", m: 1 }, { t: "ידע", kq: { words: [{ t: "ל", parts: [] }, { t: "־", m: 1 }, { t: "מ", parts: [] }], gap: false } }, { t: "׃", s: 1 }, { t: "", kq: { words: [{ t: "ג", parts: [] }], gap: true } }];
assert(readWords(mixed).map((x) => `${x.w.t}@${x.wi}`).join() === "א@0,ל@2,מ@2,ג@4", "the words of a verse as read: marks left out, a ketiv/qere pair as its qere words");

console.log("\nThe build");
const run = () => execFileSync("node", [new URL("../scripts/build-reading.mjs", import.meta.url).pathname, "--check"], { encoding: "utf8" });
const out1 = run(), out2 = run();
const v1 = /version (\w{12})/.exec(out1)[1];
assert(v1 === /version (\w{12})/.exec(out2)[1] && v1 === built.version, `the data version is the same every time (${v1}), so saved chapters are only dropped when the data really changes`);
assert(/39 books, 929 chapters, 23213 verses/.test(out1) && /1260 ketiv\/qere items, \d+ Aramaic words/.test(out1), "the build reports what it made: the whole Hebrew Bible");
assert(!/warning/.test(out1), "and has no warnings (every verse has its English)");

const gi = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
assert(/^\*$/m.test(gi("../netlify/functions/data/reading/.gitignore")) && /^rd-\*\.js$/m.test(gi("../netlify/functions/reading-chapters/.gitignore")) && /^\.gitignore$/m.test(gi("../netlify/functions/reading-chapters/.gitignore")), "the build leaves a .gitignore in each generated folder, so the chapters stay out of git whatever the repository's own .gitignore says (loaders.js stays in)");

summary();
