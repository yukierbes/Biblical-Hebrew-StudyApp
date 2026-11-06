import fs from "node:fs";
import vm from "node:vm";
import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { recordItemResult, getScheduleEntries } from "../public/js/srs.js";
import { getVocabRows } from "../public/js/vocab-data.js";
import { vocabRowKey } from "../public/js/vocab-overrides.js";
import * as rv from "../public/js/reading-vocab.js";
import * as ra from "../public/js/reading-accents.js";
import { offlineDatasets } from "../public/js/reading-offline.js";
import { parseOsis } from "../scripts/lib/article-rules.mjs";

const { document, localStorage } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const readJson = (name) => JSON.parse(fs.readFileSync(new URL(`../netlify/functions/data/${name}.json`, import.meta.url), "utf8"));
const readingIndex = readJson("bible-reading");
// the index holds the books, chapters and sections; each book's verses and English are in a file of their own
const reading = { ...readingIndex, verses: {}, english: {}, works: readingIndex.books.flatMap((b) => b.works) };
for (const b of readingIndex.books) {
  const part = readJson(b.dataset);
  Object.assign(reading.verses, part.verses);
  Object.assign(reading.english, part.english);
}

console.log("What can be read");
assert(readingIndex.books.map((b) => b.id).join() === "Gen,Exod,Num,Deut,Josh,Ruth,1Sam,Ps,Prov,Isa,Jonah", "eleven books, in Bible order");
assert(!readingIndex.verses && !readingIndex.english, "the index holds no Hebrew or English: each book has its own file");
assert(readingIndex.books.every((b) => b.dataset === `bible-reading-${b.id.toLowerCase()}`), "each book names its own data file");
const refsOfWork = (w) => w.passages.flatMap((i) => reading.passages[i].verses);
const sizes = Object.fromEntries(reading.works.map((w) => [w.title, refsOfWork(w).length]));
const expected = { "Genesis 1": 31, "Genesis 2": 25, "Genesis 3": 24, "Genesis 22": 24, "Exodus 1": 22, "Exodus 2": 25, "Exodus 3": 22, "Exodus 20:1–17 The Ten Commandments": 17, "Numbers 6:22–26 The priestly blessing": 5, "Deuteronomy 6:1–15": 15, "Joshua 24": 33, "Ruth 1": 22, "Ruth 2": 23, "Ruth 3": 18, "Ruth 4": 22, "1 Samuel 1": 28, "Psalm 1": 6, "Psalm 19": 15, "Psalm 23": 6, "Psalm 25": 22, "Psalm 37": 40, "Psalm 51": 21, "Psalm 117": 2, "Psalm 121": 8, "Psalm 150": 6, "Proverbs 1": 33, "Proverbs 2": 22, "Proverbs 3": 35, "Isaiah 6": 13, "Jonah 1": 16, "Jonah 2": 11, "Jonah 3": 10, "Jonah 4": 11 };
assert(Object.keys(expected).every((t) => sizes[t] === expected[t]) && Object.keys(sizes).length === Object.keys(expected).length, "every chapter or passage asked for is there, with every verse: " + Object.keys(expected).filter((t) => sizes[t] !== expected[t]).join());
assert(reading.passages.every((p, i) => reading.passages.findIndex((q) => q.id === p.id) === i), "every section has its own stable id");
assert(reading.works.every((w) => w.passages.every((i) => reading.passages[i].workId === w.id)), "each section knows its chapter");
assert(reading.works.every((w) => { const r = refsOfWork(w); return new Set(r).size === r.length; }), "no verse is in two sections of the same work");
assert(reading.works.every((w) => { const r = refsOfWork(w); const nums = r.map((x) => x.split(".").slice(1).map(Number)); return nums.every((n, i) => i === 0 || n[0] > nums[i - 1][0] || (n[0] === nums[i - 1][0] && n[1] === nums[i - 1][1] + 1) || n[1] === 1); }), "sections follow on from each other with no verse missing");
assert(reading.passages.every((p) => p.verses.length >= 2 && p.verses.length <= 9), "every section is two to nine verses");
assert(JSON.stringify(readingIndex).length < 60000 && readingIndex.books.every((b) => JSON.stringify(readJson(b.dataset)).length < 400000), "the index and each book file stay small");
const work = (t) => reading.works.find((w) => w.title === t);
assert(refsOfWork(work("Ruth 1"))[0] === "Ruth.1.1" && refsOfWork(work("Ruth 4")).slice(-1)[0] === "Ruth.4.22", "Ruth runs from 1:1 to 4:22");
assert(refsOfWork(work("Joshua 24"))[0] === "Josh.24.1" && refsOfWork(work("Joshua 24")).slice(-1)[0] === "Josh.24.33", "Joshua 24 runs from 1 to 33");
assert(refsOfWork(work("Exodus 20:1–17 The Ten Commandments")).join() === Array.from({ length: 17 }, (_, i) => `Exod.20.${i + 1}`).join(), "the Ten Commandments are Exodus 20:1–17");
assert(refsOfWork(work("Numbers 6:22–26 The priestly blessing")).join() === "Num.6.22,Num.6.23,Num.6.24,Num.6.25,Num.6.26", "the priestly blessing is Numbers 6:22–26");
assert(refsOfWork(work("Deuteronomy 6:1–15"))[0] === "Deut.6.1" && refsOfWork(work("Deuteronomy 6:1–15")).slice(-1)[0] === "Deut.6.15", "Deuteronomy 6:1–15");
assert(/Hear, Israel: Yahweh is our God/.test(reading.english["Deut.6.4"]) && /Whom shall I send/.test(reading.english["Isa.6.8"]) && /Yahweh bless you, and keep you/.test(reading.english["Num.6.24"]), "the English of Deuteronomy 6:4, Isaiah 6:8 and Numbers 6:24 is there");
// numbering: the Hebrew counts a psalm's heading as verse(s) and Jonah 2:1 is 1:17 in English
assert(/For the Chief Musician. A Psalm by David, when Nathan/.test(reading.english["Ps.51.1"]) && /Have mercy on me, God/.test(reading.english["Ps.51.3"]), "Psalm 51: the heading is verses 1–2 and 'Have mercy' is Hebrew verse 3");
assert(/Chief Musician/.test(reading.english["Ps.19.1"]) && /The heavens declare/.test(reading.english["Ps.19.2"]), "Psalm 19: the heading is verse 1 and 'The heavens declare' is Hebrew verse 2");
assert(/prepared a great fish/.test(reading.english["Jonah.2.1"]) && /Jonah prayed/.test(reading.english["Jonah.2.2"]), "Jonah 2:1 is the great fish (English 1:17)");
assert(reading.passages.every((p) => p.verses.every((v) => reading.verses[v] && reading.english[v])), "every verse has its Hebrew and its English");
assert(/In the beginning, God created/.test(reading.english["Gen.1.1"]) && /serve Yahweh/.test(reading.english["Josh.24.15"]), "the English matches the verses");

console.log("\nWords you know");
const rows = getVocabRows();
const index = rv.buildVocabIndex(rows);
assert(index.size > 1000, "the vocabulary list is indexed by consonants");
const multi = rows.find((r) => String(r.Hebrew).split(/\s*[;,]\s*/).length > 1 && rv.consonants(r.Hebrew.split(/\s*[;,]\s*/)[1]) !== rv.consonants(r.Hebrew.split(/\s*[;,]\s*/)[0]));
const secondForm = rv.consonants(multi.Hebrew.split(/\s*[;,]\s*/)[1]);
assert(multi && index.get(secondForm) && index.get(secondForm).includes(multi), `every form of an entry is findable (the second form of "${multi.Hebrew}")`);
assert(index.get("הלך") && !index.has("ילך"), "the lexicon's יָלַךְ is read as הָלַךְ");
const refs = reading.passages[0].verses;
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
for (const p of reading.passages) {
  const x = rv.passageKnowledge(p.verses, reading.verses, index, allKeys);
  words += x.words;
  matched += x.known;
}
assert(matched / words > 0.8, `most counted words are found in the vocabulary list (${Math.round((matched / words) * 100)}%)`);

console.log("\nSelf-check");
const verseRef = reading.passages[0].verses[0];
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
const psXml = fs.readFileSync(new URL("../data-source/bible/Ps.xml", import.meta.url), "utf8");
const psWords = parseOsis(psXml).find((v) => v.ref === "Ps.1.1").words.map((w) => ({ t: w.text }));
assert(ra.analyzeVerse(psWords, { poetry: true, index: ai }).words.some((x) => x.pause), "a psalm verse finds its pauses");

console.log("\nThe Reading page");
navigateTo(document, "bible-reading");
await wait(700);
assert(content.querySelectorAll(".reading-book-select option").length === readingIndex.books.length, "each book is listed once");
assert(content.querySelectorAll(".reading-chapter-select option").length === readingIndex.books[0].works.length, "the chapters of the open book are listed");
assert(content.querySelectorAll(".reading-passages .choice-btn").length === reading.works[0].passages.length, "the sections of the open chapter are listed");
assert(content.querySelectorAll(".reading-know").length >= 7, "each section shows how much of it you know");
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
assert(readingIndex.books.every((b) => offlineDatasets(readingIndex).includes(b.dataset)), "...and the data file of every Reading book");

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
    }),
    match: async () => undefined,
    keys: async () => [...new Set([...store.keys()].map((k) => k.split("|")[0]))],
    delete: async (n) => { for (const k of [...store.keys()]) if (k.startsWith(n + "|")) store.delete(k); return true; },
  };
  class Resp { constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.ok = this.status < 400; } clone() { return new Resp(this.body, { status: this.status }); } }
  const sandbox = {
    self: { addEventListener: (t, f) => (listeners[t] = f), location: { origin: "https://app.test" }, skipWaiting() {}, clients: { claim() {} } },
    caches, Response: Resp, URL, Promise, console,
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

summary();
