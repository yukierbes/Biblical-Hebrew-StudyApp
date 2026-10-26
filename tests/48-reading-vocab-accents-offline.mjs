import fs from "node:fs";
import vm from "node:vm";
import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { recordItemResult, getScheduleEntries } from "../public/js/srs.js";
import { getVocabRows } from "../public/js/vocab-data.js";
import { vocabRowKey } from "../public/js/vocab-overrides.js";
import * as rv from "../public/js/reading-vocab.js";
import * as ra from "../public/js/reading-accents.js";
import { offlineDatasets } from "../public/js/reading-offline.js";

const { document, localStorage } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const readJson = (name) => JSON.parse(fs.readFileSync(new URL(`../netlify/functions/data/${name}.json`, import.meta.url), "utf8"));
const reading = readJson("bible-reading");

console.log("More books");
const books = [...new Set(reading.passages.map((p) => p.book))];
assert(["Gen", "Exod", "Ruth", "Deut", "Ps", "Jonah"].every((b) => books.includes(b)), `Genesis, Exodus, Ruth, Deuteronomy, Psalms and Jonah are all there (${books.join(", ")})`);
assert(reading.passages.filter((p) => p.book === "Jonah").length >= 4 && reading.passages.filter((p) => p.book === "Exod").length >= 3, "Jonah and Exodus have several passages");
assert(reading.passages.some((p) => p.book === "Gen" && /37:|45:|50:/.test(p.title)), "and so does the Joseph story (Genesis 37 to 50)");
assert(reading.passages.every((p) => p.verses.every((v) => reading.verses[v] && reading.english[v])), "every verse has its Hebrew and its English");
assert(/prepared a great fish/.test(reading.english["Jonah.2.1"]), "Hebrew Jonah 2:1 carries the English verse that matches it (1:17)");

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
assert(ra.isPoetryBook("Ps") && !ra.isPoetryBook("Gen"), "Psalms use the poetry accents");
const psWords = reading.verses[reading.passages.find((p) => p.book === "Ps").verses[0]];
assert(ra.analyzeVerse(psWords, { poetry: true, index: ai }).words.some((x) => x.pause), "a psalm verse finds its pauses");

console.log("\nThe Reading page");
navigateTo(document, "bible-reading");
await wait(700);
const books2 = [...content.querySelectorAll(".reading-book-title")].map((h) => h.textContent);
assert(books2.join() === "Genesis,Exodus,Deuteronomy,Psalm,Ruth,Jonah", `passages are grouped by book (${books2.join()})`);
assert(content.querySelectorAll(".reading-passages .choice-btn").length === reading.passages.length, "every passage is listed once");
assert(content.querySelectorAll(".reading-know").length > 15, "each passage shows how much of it you know");
assert(/You know about \d+% of the words/.test(content.querySelector(".reading-knowledge").textContent), "the open passage says how much you know");
const easy = content.querySelector(".reading-sort input");
easy.checked = true;
easy.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
await wait(60);
const pcts = [...content.querySelectorAll(".reading-book")[0].querySelectorAll(".reading-know")].map((s) => parseInt(s.textContent, 10));
assert(pcts.every((p, i) => i === 0 || pcts[i - 1] >= p), "'Easiest first' orders each book by words known");
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
