import fs from "node:fs";
import vm from "node:vm";
import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { recordItemResult, getScheduleEntries } from "../public/js/srs.js";
import { getVocabRows } from "../public/js/vocab-data.js";
import { vocabRowKey } from "../public/js/vocab-overrides.js";
import * as rv from "../public/js/reading-vocab.js";
import * as ra from "../public/js/reading-accents.js";
import { offlineDatasets } from "../public/js/reading-offline.js";
import { expandChapter } from "../public/js/reading-data.js";
import { parseOsis } from "../scripts/lib/article-rules.mjs";

const { document, localStorage } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const readJson = (name) => JSON.parse(fs.readFileSync(new URL(`../netlify/functions/data/${name}.json`, import.meta.url), "utf8"));
const readingIndex = readJson("bible-reading");
// the index lists the books and how long each chapter is; each chapter's verses and English are in a file of their own
const reading = { verses: {}, english: {}, chapters: {}, raw: {} };
for (const b of readingIndex.books) {
  for (let n = 1; n <= b.chapters.length; n++) {
    const name = `rd-${b.id.toLowerCase()}-${n}`;
    const raw = readJson(`reading/${name}`);
    const ch = expandChapter(raw);
    reading.raw[name] = raw;
    reading.chapters[`${b.id}.${n}`] = ch;
    Object.assign(reading.verses, ch.verses);
    Object.assign(reading.english, ch.english);
  }
}
const allChapters = Object.values(reading.chapters);

console.log("What can be read");
assert(readingIndex.books.map((b) => b.id).join() === "Gen,Exod,Num,Deut,Josh,Ruth,1Sam,Ps,Prov,Isa,Jonah", "eleven books, in Bible order");
assert(!readingIndex.verses && !readingIndex.english && /^[0-9a-f]{12}$/.test(readingIndex.version), "the index holds no Hebrew or English, and carries a data version");
const counts = Object.fromEntries(readingIndex.books.map((b) => [b.id, b.chapters.reduce((n, x) => n + x, 0)]));
assert(JSON.stringify(counts) === JSON.stringify({ Gen: 1533, Exod: 1213, Num: 1289, Deut: 959, Josh: 658, Ruth: 85, "1Sam": 811, Ps: 2527, Prov: 915, Isa: 1291, Jonah: 48 }), "every verse of every book is there: " + JSON.stringify(counts));
assert(readingIndex.books.map((b) => b.chapters.length).join() === "50,40,36,34,24,4,31,150,31,66,4", "every chapter of every book is there (470 chapters)");
assert(allChapters.every((c) => Object.keys(c.verses).length === c.count && Array.from({ length: c.count }, (_, i) => `${c.book}.${c.chapter}.${i + 1}`).every((r) => c.verses[r] && c.verses[r].length > 0)), "every chapter holds verses 1 to its last, each with Hebrew words");
assert(allChapters.every((c) => c.sections.every((x, i) => x.from === (i ? c.sections[i - 1].to + 1 : 1)) && c.sections[c.sections.length - 1].to === c.count), "each chapter's sections follow one another from verse 1 to the last, none left out and none twice");
assert(allChapters.every((c) => c.sections.every((x) => (c.count <= 12 ? c.sections.length === 1 : x.to - x.from + 1 >= 4 && x.to - x.from + 1 <= 14))), "a chapter of up to 12 verses is one section; a longer one is split into sections of 4 to 14 verses");
const sizeOf = (c) => c.sections.map((x) => x.to - x.from + 1);
assert(sizeOf(reading.chapters["Gen.1"]).join() === "8,8,7,8" || sizeOf(reading.chapters["Gen.1"]).length === 4, `Genesis 1 (31 verses) is four sections (${sizeOf(reading.chapters["Gen.1"])})`);
assert(sizeOf(reading.chapters["Ps.119"]).length >= 15, "Psalm 119 (176 verses) is split into many sections");
assert(allChapters.every((c) => Object.keys(c.english).length === c.count), "every verse has its English");
assert(JSON.stringify(readingIndex).length < 10000 && Object.values(reading.raw).every((r) => JSON.stringify(r).length < 200000) && Object.values(reading.raw).reduce((n, r) => n + JSON.stringify(r).length, 0) < 12e6, "the index is under 10 KB and every chapter under 200 KB (the whole is about 10 MB)");
assert(reading.chapters["Ruth.1"].sections[0].verses[0] === "Ruth.1.1" && reading.chapters["Ruth.4"].verses["Ruth.4.22"], "Ruth runs from 1:1 to 4:22");
assert(Object.keys(reading.chapters["Josh.24"].verses).length === 33, "Joshua 24 has its 33 verses");
assert(/Hear, Israel: Yahweh is our God/.test(reading.english["Deut.6.4"]) && /Whom shall I send/.test(reading.english["Isa.6.8"]) && /Yahweh bless you, and keep you/.test(reading.english["Num.6.24"]), "the English of Deuteronomy 6:4, Isaiah 6:8 and Numbers 6:24 is the right verse");
// numbering: the Hebrew counts a psalm's heading as verse(s) and Jonah 2:1 is 1:17 in English
assert(/For the Chief Musician. A Psalm by David, when Nathan/.test(reading.english["Ps.51.1"]) && /Have mercy on me, God/.test(reading.english["Ps.51.3"]), "Psalm 51: the heading is verses 1–2 and 'Have mercy' is Hebrew verse 3");
assert(/Chief Musician/.test(reading.english["Ps.19.1"]) && /The heavens declare/.test(reading.english["Ps.19.2"]), "Psalm 19: the heading is verse 1 and 'The heavens declare' is Hebrew verse 2");
assert(/prepared a great fish/.test(reading.english["Jonah.2.1"]) && /Jonah prayed/.test(reading.english["Jonah.2.2"]), "Jonah 2:1 is the great fish (English 1:17)");
assert(reading.chapters["Ps.51"].headings === 2 && reading.chapters["Ps.19"].headings === 1 && reading.chapters["Ps.1"].headings === 0, "psalm headings are recorded (Psalm 51: two verses, Psalm 19: one, Psalm 1: none)");
assert(/In the beginning, God created/.test(reading.english["Gen.1.1"]) && /serve Yahweh/.test(reading.english["Josh.24.15"]), "the English matches the verses");
const g11 = reading.verses["Gen.1.1"];
assert(g11[1].t.replace(/[^\u05d0-\u05ea]/g, "") === "ברא" && g11[1].lem.replace(/[^\u05d0-\u05ea]/g, "") === "ברא" && g11[1].root === "ב – ר – א" && g11[1].pos === "V" && g11[1].parts[0][1].startsWith("Qal"), "a word is rebuilt from the compact file: text, dictionary form, root, kind and parts (Genesis 1:1 בָּרָא)");
assert(g11[0].parts.length === 2 && /preposition/.test(g11[0].parts[0][1]) && g11[0].pos === "N", "...a prefixed word keeps its pieces");
assert(g11.some((w) => w.s) && reading.verses["Gen.1.4"].some((w) => w.m || w.s || w.t), "...and marks such as sof pasuq are kept");

console.log("\nKetiv/Qere and Aramaic in the data");
const allWords = Object.values(reading.verses).flat();
const kqs = allWords.filter((w) => w.kq);
assert(kqs.length === 367, `every ketiv/qere item is a single item (${kqs.length} in the eleven books)`);
assert(kqs.filter((w) => w.kq.gap).length === 2 && kqs.filter((w) => !w.kq.gap && w.kq.words.length === 0).length === 1, "two are read but not written, and one is written but not read");
assert(kqs.filter((w) => !w.kq.gap).every((w) => w.t === w.t.replace(/[^\u05d0-\u05ea\u05be ]/g, "")), "every written ketiv is consonants only: no vowels, no accents");
assert(kqs.filter((w) => w.kq.gap).every((w) => w.t === ""), "a gap has no written text");
assert(kqs.every((w) => w.kq.words.every((q) => q.m || q.s || /[\u05b0-\u05c7]/.test(q.t))), "every qere word is pointed");
const ruth21 = reading.verses["Ruth.2.1"];
assert(ruth21.filter((w) => w.kq).length === 1 && ruth21.find((w) => w.kq).t === "מידע" && ruth21.find((w) => w.kq).kq.words[0].t.includes("מוֹדַ"), "Ruth 2:1: the ketiv מידע and its qere מוֹדַע are one item");
assert(reading.verses["Gen.30.11"].find((w) => w.kq).kq.words.filter((q) => !q.m && !q.s).length === 2, "Genesis 30:11: a qere of two words stays in one item");
const spans = Object.values(reading.verses).flat().filter((w) => w.kq && /\s/.test(w.t));
assert(spans.length === 5, `a ketiv that spans two written words is one item (${spans.length} such)`);
assert(reading.verses["1Sam.20.2"].find((w) => w.kq).t === "לו עשה" && reading.verses["1Sam.20.2"].find((w) => w.kq).kq.words.filter((q) => !q.m && !q.s).length === 2, "1 Samuel 20:2: written 'לו עשה', read as two words");
assert(reading.verses["1Sam.9.1"].find((w) => w.kq && /\s/.test(w.t)).kq.words.length === 1, "1 Samuel 9:1: written as two words, read as one (Benjamin)");
assert(allWords.filter((w) => w.a).length === 2 && reading.verses["Gen.31.47"].filter((w) => w.a).length === 2, "the two Aramaic words are flagged (Genesis 31:47)");
assert(allWords.filter((w) => !w.kq && !w.m && !w.s).every((w) => w.parts && w.parts.length > 0), "every ordinary word has its parts");

console.log("\nWords you know");
const rows = getVocabRows();
const index = rv.buildVocabIndex(rows);
assert(index.size > 1000, "the vocabulary list is indexed by consonants");
const multi = rows.find((r) => String(r.Hebrew).split(/\s*[;,]\s*/).length > 1 && rv.consonants(r.Hebrew.split(/\s*[;,]\s*/)[1]) !== rv.consonants(r.Hebrew.split(/\s*[;,]\s*/)[0]));
const secondForm = rv.canonical(multi.Hebrew.split(/\s*[;,]\s*/)[1]);
assert(multi && index.get(secondForm) && index.get(secondForm).includes(multi), `every form of an entry is findable (the second form of "${multi.Hebrew}")`);
assert(index.get(rv.canonical("הלך")) && !index.has("ילכ") && rv.canonical("ילך") === rv.canonical("הלך"), "the lexicon's יָלַךְ is read as הָלַךְ");
const refs = reading.chapters["Gen.1"].sections[0].verses;
let k = rv.passageKnowledge(refs, reading.verses, index, new Set());
assert(k.words > 0 && k.known === 0 && k.pct === 0, "nothing started: 0% known");
assert(k.names >= 0 && k.words === k.known + k.notStarted + k.notInList, "every counted word is known, not started, or not in the list");
const allKeys = new Set(rows.map(vocabRowKey));
k = rv.passageKnowledge(refs, reading.verses, index, allKeys);
assert(k.pct === Math.round((k.known / k.words) * 100) && k.pct > 60, `everything started: the share is just the words that are in the list (${k.pct}%)`);
assert(k.notStarted === 0 && k.unknown.every((u) => !u.inList), "...and the rest are words not in the list at all");
// a word started in any vocabulary mode counts
const aman = rows.find((r) => /^אָמַר/.test(r.Hebrew));
recordItemResult("vocab-flashcards-english", vocabRowKey(aman), true);
const some = rv.passageKnowledge(refs, reading.verses, index, rv.startedVocabKeys());
assert(rv.startedVocabKeys().has(vocabRowKey(aman)), "a word started in any vocabulary mode is 'started'");
assert(some.known > 0 && some.known < k.known, "so only started words count as known");
// all passages: a sensible match rate
let words = 0, matched = 0;
for (const c of allChapters) for (const sec of c.sections) {
  const x = rv.passageKnowledge(sec.verses, reading.verses, index, allKeys);
  words += x.words;
  matched += x.known;
}
assert(matched / words > 0.9, `most counted words are found in the vocabulary list (${Math.round((matched / words) * 100)}%)`);
// final and regular letters are the same letter: the word for "land" (lexicon אֶרֶץ, list אֶרֶצ)
const land = rv.describeWord({ t: "x", lem: "אֶרֶץ", parts: [["x", "noun"]], pos: "N" }, index);
assert(land.kind === "word" && land.rows.some((r) => /land/.test(r.English)), "final and regular letters match: אֶרֶץ finds the list's אֶרֶצ (land)");
// entries that share a spelling are told apart by the part of speech
const shared = [...index.entries()].filter(([, v]) => new Set(v.map((r) => r.POS)).size > 1);
assert(shared.length > 20, `${shared.length} spellings are shared by entries of different kinds`);
const [sharedKey, sharedRows] = shared.find(([, v]) => v.some((r) => r.POS === "Verb") && v.some((r) => r.POS === "Noun"));
const verbRow = sharedRows.find((r) => r.POS === "Verb");
const nounRow = sharedRows.find((r) => r.POS === "Noun");
const asVerb = rv.describeWord({ t: "x", lem: verbRow.Hebrew, parts: [["x", "Qal"]], pos: "V" }, index).rows;
const asNoun = rv.describeWord({ t: "x", lem: verbRow.Hebrew, parts: [["x", "noun"]], pos: "N" }, index).rows;
assert(asVerb.length >= 1 && asVerb.every((r) => r.POS === "Verb") && asNoun.length >= 1 && asNoun.every((r) => r.POS === "Noun"), `a word is matched to the entry of its own kind: ${verbRow.Hebrew} as a verb or as a noun`);
assert(rv.describeWord({ t: "x", lem: verbRow.Hebrew, parts: [["x", "noun"]] }, index).rows.length === sharedRows.length, "...and when the kind is not known, all the entries are kept");
assert(rv.describeWord({ t: "x", lem: "קְלָלָה", parts: [["x", "noun"]], pos: "Z" }, index).kind === "word", "an unfamiliar kind does not break matching");
// Aramaic words are not Hebrew vocabulary
assert(rv.describeWord({ t: "x", lem: verbRow.Hebrew, parts: [["x", "noun"]], pos: "N", a: 1 }, index).kind === "aramaic", "an Aramaic word is neither matched nor counted");
const k47 = rv.passageKnowledge(["Gen.31.47"], reading.verses, index, allKeys);
assert(k47.words === reading.verses["Gen.31.47"].filter((w) => !w.m && !w.s && !w.a && w.lem).length - reading.verses["Gen.31.47"].filter((w) => !w.m && !w.s && !w.a && w.lem && w.parts.some((p) => /proper name/.test(p[1]))).length, "Genesis 31:47: the two Aramaic words are not counted");
// a ketiv/qere pair counts as what is READ
const kqCount = rv.passageKnowledge(["Ruth.2.1"], reading.verses, index, allKeys);
const plainCount = reading.verses["Ruth.2.1"].filter((w) => !w.kq && !w.m && !w.s && w.lem && !w.parts.some((p) => /proper name/.test(p[1]))).length;
assert(kqCount.words === plainCount + 1, "Ruth 2:1: the ketiv/qere pair counts once, as its qere word");
const sc = rv.selfCheckWords(reading.verses["Ruth.2.1"]);
assert(sc.filter((x) => reading.verses["Ruth.2.1"][x.wi].kq).length === 1 && sc.find((x) => reading.verses["Ruth.2.1"][x.wi].kq).w.t.includes("מוֹדַ"), "the self-check offers the qere word for a ketiv/qere pair, once");

console.log("\nSelf-check");
const verseRef = reading.chapters["Gen.1"].sections[0].verses[0];
const verse = reading.verses[verseRef];
const wi = verse.findIndex((w) => rv.describeWord(w, index).rows.length > 0);
const w = verse[wi];
const row = rv.describeWord(w, index).rows[0];
const key = vocabRowKey(row);
assert(!getScheduleEntries(rv.REVIEW_MODE)[key], "before: the word is not in the review schedule");
let r = rv.setWordCheck(verseRef, wi, w, true, index);
assert(r.sentToReview === 0 && !getScheduleEntries(rv.REVIEW_MODE)[key], "'Got it' changes nothing in the review");
r = rv.setWordCheck(verseRef, wi, w, false, index);
const e = getScheduleEntries(rv.REVIEW_MODE)[key];
assert(r.sentToReview >= 1 && e && e.timesSeen === 1 && e.timesCorrect === 0 && e.dueDate <= Date.now(), "'Missed it' sends the vocabulary word to review, due now");
rv.setWordCheck(verseRef, wi, w, false, index);
assert(getScheduleEntries(rv.REVIEW_MODE)[key].timesSeen === 1, "marking the same miss twice counts once");
assert(rv.verseCheckSummary(verseRef).missed === 1 && rv.verseCheckSummary(verseRef).got === 0, "the verse summary follows the latest mark");
const orphan = { t: "x", lem: "קְלָלָה", gl: "test word", parts: [["x", "noun"]] };
r = rv.setWordCheck(verseRef, 99, orphan, false, new Map());
assert(r.notInList === true && Object.keys(rv.getMissedWords()).length === 1, "a miss that is not in the vocabulary list is saved in a short list");

console.log("\nAccents");
const accents = readJson("accents");
const ai = ra.buildAccentIndex(accents.rows);
assert(ai.prose.size > 20 && ai.poetry.size > 10, "prose and poetry accents are indexed");
const gen11 = reading.verses["Gen.1.1"] || Object.values(reading.verses)[0];
const g = ra.analyzeVerse(reading.verses["Gen.1.1"], { poetry: false, index: ai });
assert(g.main && /atna/i.test(g.main.accent.name) && g.main.accent.group === 1, "Genesis 1:1 divides at the atnakh");
const pausesWithNames = g.words.filter((x) => x.pause).map((x) => x.pause.name);
assert(pausesWithNames[pausesWithNames.length - 1] === "silluq", "the last word carries the silluq");
assert(g.words.filter((x) => x.pause && x.pause.name === "silluq").length === 1, "a meteg elsewhere is not read as a silluq");
const noAtnach = ra.analyzeVerse(reading.verses["Ruth.1.16"] ? reading.verses["Ruth.1.16"] : reading.verses["Gen.12.1"], { poetry: false, index: ai });
assert(noAtnach.main === null || noAtnach.main.accent.group >= 1, "a verse is analysed without error");
assert(ra.isPoetryBook("Ps") && ra.isPoetryBook("Prov") && !ra.isPoetryBook("Gen") && !ra.isPoetryBook("Isa"), "Psalms and Proverbs use the poetry accents; Genesis and Isaiah the prose accents");
const kqVerse = reading.verses["Ruth.2.1"];
const kqAcc = ra.analyzeVerse(kqVerse, { poetry: false, index: ai });
const kqAt = kqVerse.findIndex((w) => w.kq);
assert(kqAcc.words[kqAt].accents.length > 0 || kqVerse[kqAt].kq.words.every((q) => !/[\u0591-\u05AF]/.test(q.t)), "a ketiv/qere pair's accent is read from its qere (the written ketiv has none)");
const psXml = fs.readFileSync(new URL("../data-source/bible/Ps.xml", import.meta.url), "utf8");
const psWords = parseOsis(psXml).find((v) => v.ref === "Ps.1.1").words.map((w) => ({ t: w.text }));
assert(ra.analyzeVerse(psWords, { poetry: true, index: ai }).words.some((x) => x.pause), "a psalm verse finds its pauses");

console.log("\nThe Reading page");
navigateTo(document, "bible-reading");
await wait(700);
assert(content.querySelectorAll(".reading-book-select option").length === readingIndex.books.length, "each book is listed once");
assert(content.querySelectorAll(".reading-chapter-select option").length === readingIndex.books[0].chapters.length, "the chapters of the open book are listed");
assert(content.querySelectorAll(".reading-passages .choice-btn").length === reading.chapters["Gen.1"].sections.length, "the sections of the open chapter are listed");
assert(content.querySelectorAll(".reading-know").length >= 4, "each section shows how much of it you know");
assert(/You know about \d+% of the words/.test(content.querySelector(".reading-knowledge").textContent), "the open passage says how much you know");
const easy = content.querySelector(".reading-sort input");
easy.checked = true;
easy.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
await wait(60);
const pcts = [...content.querySelectorAll(".reading-section-list .reading-know")].map((s) => parseInt(s.textContent, 10));
assert(pcts.every((p, i) => i === 0 || pcts[i - 1] >= p), "'Easiest first' orders the sections by words known");
assert(!!content.querySelector(".reading-offline button"), "there is a Save for offline button");
// accent overlay
const divBox = [...document.querySelectorAll("#sidebar-extra input[type=checkbox]")].find((c) => /accent divisions/.test(c.parentElement.textContent));
assert(!!divBox && !divBox.disabled, "the sidebar offers 'Show accent divisions'");
divBox.checked = true;
divBox.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
await wait(80);
assert(content.querySelectorAll(".bible-word.accent-pause").length > 0, "pauses are marked on the words");
assert(content.querySelectorAll(".bible-word.accent-main").length > 0, "the main division is outlined");
assert(!!content.querySelector(".reading-divisions") && /Main division/.test(content.textContent), "and said in words under the verse");
const labels = [...content.querySelectorAll(".accent-pause")].map((n) => n.dataset.accentLabel);
assert(labels.every((l) => /^[1-4]$/.test(l)), "each pause shows a strength from 1 to 4");
// tap a word: accent line
click(content.querySelector(".reading-verse .bible-word.accent-pause"));
await wait(60);
assert(/Accent:/.test(content.querySelector(".reading-parse").textContent), "tapping a word names its accent");
// self-check
const showEn = [...content.querySelectorAll(".reading-verse button")].find((b) => b.textContent === "Show English");
click(showEn);
await wait(60);
assert(content.querySelectorAll(".reading-selfcheck-row").length > 0, "after the English, each word has Got it / Missed it");
const checkRows = [...content.querySelectorAll(".reading-selfcheck-row")];
const lastRow = checkRows[checkRows.length - 1];
click([...lastRow.querySelectorAll("button")].find((b) => b.textContent === "Missed it"));
await wait(40);
assert(/review|vocabulary list/.test(lastRow.textContent), "a miss says where it went");
assert(/\d+ missed/.test(content.querySelector(".reading-selfcheck-summary").textContent), "the verse summary updates");

console.log("\nOffline");
assert(offlineDatasets().includes("bible-reading") && offlineDatasets().includes("bible-mixed") && offlineDatasets().includes("vocabulary"), "'Save for offline' covers the passages, Mixed review and vocabulary");
assert(offlineDatasets().filter((n) => n.startsWith("bible-")).length >= 17, "...and every Bible practice dataset the mixed questions use");
assert(!offlineDatasets(readingIndex).some((n) => n.startsWith("rd-")), "...but no chapters unless a book is asked for");
const ruthSet = offlineDatasets(readingIndex, "Ruth");
assert(["rd-ruth-1", "rd-ruth-2", "rd-ruth-3", "rd-ruth-4"].every((n) => ruthSet.includes(n)) && ruthSet.filter((n) => n.startsWith("rd-")).length === 4, "a book is saved a book at a time: Ruth is its four chapters");
assert(offlineDatasets(readingIndex, "Ps").filter((n) => n.startsWith("rd-")).length === 150 && !offlineDatasets(readingIndex, "Ps").includes("rd-gen-1"), "...Psalms its 150, and nothing from another book");

// the service worker, run in isolation
const swSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function makeSw({ online = true, status = 200 } = {}) {
  const store = new Map();
  const listeners = {};
  const caches = {
    open: async (name) => ({
      put: async (k, v) => store.set(name + "|" + (typeof k === "string" ? k : k.url), v),
      match: async (k) => store.get(name + "|" + (typeof k === "string" ? k : k.url)),
      addAll: async () => {},
      keys: async () => [...store.keys()].filter((k) => k.startsWith(name + "|")).map((k) => { const u = k.slice(name.length + 1); return { url: u.startsWith("http") ? u : "https://app.test" + u }; }),
      delete: async (k) => store.delete(name + "|" + (typeof k === "string" ? k : k.url.replace("https://app.test", ""))),
    }),
    match: async () => undefined,
    keys: async () => [...new Set([...store.keys()].map((k) => k.split("|")[0]))],
    delete: async (n) => { for (const k of [...store.keys()]) if (k.startsWith(n + "|")) store.delete(k); return true; },
  };
  class Headers { constructor(init) { this.m = new Map(init instanceof Headers ? init.m : Object.entries(init || {})); } get(k) { return this.m.has(k) ? this.m.get(k) : null; } set(k, v) { this.m.set(k, v); } }
  class Resp { constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.statusText = init.statusText || ""; this.headers = new Headers(init.headers); this.ok = this.status < 400; } clone() { return new Resp(this.body, { status: this.status, headers: this.headers }); } }
  const sandbox = {
    self: { addEventListener: (t, f) => (listeners[t] = f), location: { origin: "https://app.test" }, skipWaiting() {}, clients: { claim() {} } },
    caches, Response: Resp, Headers, URL, Promise, console,
    fetch: async (req) => { if (!sandbox.__online) throw new Error("offline"); return new Resp("DATA:" + req.url, { status: sandbox.__status }); },
    __online: online, __status: status,
  };
  vm.runInNewContext(swSource, sandbox);
  const run = (url) => new Promise((resolve) => {
    let p = null;
    listeners.fetch({ request: { method: "GET", url }, respondWith: (x) => (p = x) });
    resolve(p);
  });
  return { sandbox, store, run, listeners, caches };
}
const sw = makeSw();
const dataUrl = "https://app.test/.netlify/functions/get-data?dataset=bible-reading";
let resp = await sw.run(dataUrl);
assert((await resp).body.startsWith("DATA:"), "online, a dataset comes from the network");
await new Promise((r) => setTimeout(r, 10));
assert([...sw.store.keys()].some((k) => k.startsWith("hebrew-app-data-v1|") && k.includes("bible-reading")), "...and a copy is kept");
sw.sandbox.__online = false;
resp = await sw.run(dataUrl);
assert((await resp).body.startsWith("DATA:"), "offline, the saved copy is served");
resp = await sw.run("https://app.test/.netlify/functions/get-data?dataset=never-saved");
assert((await resp).status === 503, "offline and never saved: a clear 503, not a crash");
const bad = makeSw({ status: 401 });
await bad.run(dataUrl);
await new Promise((r) => setTimeout(r, 10));
assert(bad.store.size === 0, "an error answer (not signed in) is never saved");
assert(sw.run("https://app.test/.netlify/functions/sync") && sw.listeners.fetch({ request: { method: "GET", url: "https://app.test/.netlify/functions/sync" }, respondWith: () => { throw new Error("sync must not be answered from a cache"); } }) === undefined, "the sync function is still never cached");
// a new release must keep the saved datasets
sw.store.set("hebrew-verb-app-v1|x", 1);
let activated;
sw.listeners.activate({ waitUntil: (p) => (activated = p) });
await activated;
assert([...sw.store.keys()].some((k) => k.startsWith("hebrew-app-data-v1|")) && ![...sw.store.keys()].some((k) => k.startsWith("hebrew-verb-app-v1|")), "a new release clears old app files but keeps the saved datasets");
assert(/navigator\.onLine/.test(fs.readFileSync(new URL("../public/js/auth-fetch.js", import.meta.url), "utf8")), "offline, an expired sign-in token no longer stops data requests");


console.log("\nSaved chapters (kept by data version, not by release)");
const csw = makeSw();
const ch1 = "https://app.test/.netlify/functions/get-data?dataset=rd-gen-1&v=aaa111";
let cr = await csw.run(ch1);
assert((await cr).body.startsWith("DATA:"), "a chapter comes from the network the first time");
await new Promise((r) => setTimeout(r, 10));
csw.sandbox.__online = false;
cr = await csw.run(ch1);
assert((await cr).body.startsWith("DATA:"), "...and from the saved copy afterwards");
// a saved chapter with no release mark (a different release saved it) is still right: only the data version matters
csw.store.set("hebrew-app-data-v1|/.netlify/functions/get-data?dataset=rd-gen-2&v=aaa111", new csw.sandbox.Response("CHAPTER-2"));
csw.sandbox.__online = true;
let netCalls = 0;
const countingFetch = csw.sandbox.fetch;
csw.sandbox.fetch = async (req) => { netCalls++; return countingFetch(req); };
cr = await csw.run("https://app.test/.netlify/functions/get-data?dataset=rd-gen-2&v=aaa111");
assert((await cr).body === "CHAPTER-2" && netCalls === 0, "a chapter saved under an earlier release is used as it is: no request at all");
// the data changed: a new version is fetched, and the older copy of that chapter is dropped
cr = await csw.run("https://app.test/.netlify/functions/get-data?dataset=rd-gen-1&v=bbb222");
assert((await cr).body.startsWith("DATA:") && netCalls === 1, "a new data version is fetched again");
await new Promise((r) => setTimeout(r, 20));
const keysNow = [...csw.store.keys()];
assert(keysNow.some((k) => k.includes("rd-gen-1&v=bbb222")) && !keysNow.some((k) => k.includes("rd-gen-1&v=aaa111")), "...and the older copy of that chapter is removed");
assert(keysNow.some((k) => k.includes("rd-gen-2&v=aaa111")), "...but other chapters are left alone");
// ordinary datasets are still kept by release
const plain = makeSw();
const ds = "https://app.test/.netlify/functions/get-data?dataset=vocabulary";
plain.store.set("hebrew-app-data-v1|/.netlify/functions/get-data?dataset=vocabulary", new plain.sandbox.Response("OLD"));
let plainNet = 0; const pf = plain.sandbox.fetch; plain.sandbox.fetch = async (r) => { plainNet++; return pf(r); };
await plain.run(ds);
assert(plainNet === 1, "other datasets are still fetched again after a new release (a copy without this release's mark is not trusted)");

summary();
