// Reading: real verses to read, with tap-any-word parsing, your own translation, tap-to-reveal English and a
// "mark as read" streak — plus a Mixed review that asks about the article, the preposition, the vav, the verb and
// more, all in one verse.
//
// Every chapter of the books on offer can be read. The small "bible-reading" index lists the books and how many verses
// each chapter has; one chapter's words, their parsing and its English come from that chapter's own file ("rd-gen-1",
// "rd-ps-23" ...), loaded when it is opened and the next one fetched quietly in the background (all built by
// scripts/build-reading.mjs). A chapter is read in sections of about 8 to 12 verses, named by plain references
// ("Genesis 1:1–9"), and a whole section is marked as read at once. The mixed questions are the same questions the practice
// pages ask: an index (bible-mixed) says which examples share a verse, and each page's own data and configuration
// draw the question and its answer boxes.

import { loadBibleData, setDatasetVersion } from "../bible-data.js";
import { expandChapter, parseRef, chapterDatasetName, plainRef } from "../reading-data.js";
import { buildVerse, prettyRef, getShowAccents, setShowAccents, hebrewHtml, stripAccents } from "../bible-text.js";
import { getPracticeConfig, makeBibleQuestion, drawBibleQuestion, noteBibleAnswer } from "../bible-practice.js";
import { markVersesRead, unmarkVersesRead, getChapterRead, getBookReadCounts, getReadingStats } from "../bible-insights.js";
import { recordStreakActivity, recordItemResult } from "../srs.js";
import { bibleSrsMode, exampleKey, pickAdaptiveVerse, describeNeed } from "../bible-areas.js";
import { createConfidenceAsk } from "../confidence.js";
import { saveResumePoint } from "../resume.js";
import { buildVocabIndex, startedVocabKeys, passageKnowledge, describeWord, selfCheckWords, setWordCheck, getSelfCheck, getMissedWords, verseCheckSummary } from "../reading-vocab.js";
import { vocabRowKey } from "../vocab-overrides.js";
import { buildAccentIndex, analyzeVerse, isPoetryBook, groupLabel } from "../reading-accents.js";
import { loadVocabData } from "../vocab-data.js";
import { loadAccentData, getAccentRows } from "../accent-data.js";
import { saveReadingForOffline, getOfflineSaved, isOffline } from "../reading-offline.js";
import { consumeDeepLink } from "../deep-link.js";

const el = (tag, className, html) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** The text of a word as it is READ: for a ketiv/qere pair the qere (the word a person is learning), else the word itself. */
function readText(w) {
  if (!w.kq) return w.t.split("/").join("");
  let out = "";
  for (const q of w.kq.words) out += q.m ? q.t : (out && !out.endsWith("\u05be") ? " " : "") + q.t.split("/").join("");
  return out;
}

const TABS = [
  ["read", "Read & translate"],
  ["mixed", "Mixed review"],
];

let state = null;
let data = null;
let mixedIndex = null;

export async function mount({ content, sidebarExtra }) {
  state = { mixedMode: "need", lastMixedRef: null, showDivisions: localStorage.getItem("hebrewApp.readingDivisions") === "1", sortEasy: false, vocabIndex: null, accentIndex: null, started: new Set(), tab: "read", loc: { book: "", chapter: 1, section: 0 }, showAccents: getShowAccents(), tapped: {}, english: {}, notes: {}, mixed: null, loadError: "", alive: true };
  content.innerHTML = '<div class="loading">Loading the reading passages…</div>';
  try {
    data = await loadBibleData("bible-reading");
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(el("div", "alert alert-warning", "Could not load the reading passages. Please check your connection and try again."));
    return;
  }
  if (!state || !state.alive) return;
  // The index holds no Hebrew: each chapter's verses are added to these as the chapters are opened.
  setDatasetVersion("rd-", data.version);
  data.verses = data.verses || {};
  data.english = data.english || {};
  data.chapters = data.chapters || {};
  state.loc.book = data.books[0].id;
  // Vocabulary (for "words you know") and accents (for the divisions overlay): helpful, but Reading works without them.
  await Promise.allSettled([loadVocabData(), loadAccentData()]);
  if (!state || !state.alive) return;
  state.vocabIndex = buildVocabIndex();
  state.accentIndex = getAccentRows().length ? buildAccentIndex(getAccentRows()) : null;
  const link = consumeDeepLink();
  let want = null;
  if (link && link.type === "resume" && link.page === "bible-reading" && link.detail) {
    if (["read", "mixed"].includes(link.detail.tab)) state.tab = link.detail.tab;
    if (link.detail.passage) want = parseRef(link.detail.passage);
  }
  if (want && bookOfId(want.book) && want.chapter >= 1 && want.chapter <= bookOfId(want.book).chapters.length) state.loc = { book: want.book, chapter: want.chapter, section: 0 };
  try {
    const ch = await ensureChapter(state.loc.book, state.loc.chapter);
    if (want && want.verse) state.loc.section = Math.max(0, ch.sections.findIndex((x) => want.verse >= x.from && want.verse <= x.to));
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(el("div", "alert alert-warning", "Could not load this chapter. Please check your connection and try again."));
    return;
  }
  if (!state || !state.alive) return;
  render(content, sidebarExtra);
}

/** Loads one chapter (once), adds its verses and English to `data`, and returns it (see reading-data.js). */
async function ensureChapter(bookId, chapter) {
  const key = `${bookId}.${chapter}`;
  if (data.chapters[key]) return data.chapters[key];
  const raw = await loadBibleData(chapterDatasetName(bookId, chapter));
  const ch = expandChapter(raw);
  Object.assign(data.verses, ch.verses);
  Object.assign(data.english, ch.english);
  data.chapters[key] = ch;
  return ch;
}

/** Where "next" leads from a place: the next section, else the first of the next chapter, else the first of the next book. */
function stepFrom(loc, delta) {
  const book = bookOfId(loc.book);
  const ch = data.chapters[`${loc.book}.${loc.chapter}`];
  const sections = ch ? ch.sections.length : 1;
  if (delta > 0) {
    if (loc.section + 1 < sections) return { book: loc.book, chapter: loc.chapter, section: loc.section + 1 };
    if (loc.chapter < book.chapters.length) return { book: loc.book, chapter: loc.chapter + 1, section: 0 };
    const at = data.books.findIndex((b) => b.id === loc.book);
    return at < data.books.length - 1 ? { book: data.books[at + 1].id, chapter: 1, section: 0 } : null;
  }
  if (loc.section > 0) return { book: loc.book, chapter: loc.chapter, section: loc.section - 1 };
  if (loc.chapter > 1) return { book: loc.book, chapter: loc.chapter - 1, section: -1 }; // -1: the last section, once its chapter is loaded
  const at = data.books.findIndex((b) => b.id === loc.book);
  return at > 0 ? { book: data.books[at - 1].id, chapter: data.books[at - 1].chapters.length, section: -1 } : null;
}

/** Opens a place (a section of a chapter), loading its chapter first if need be. */
async function goTo(loc, rerender) {
  try {
    const ch = await ensureChapter(loc.book, loc.chapter);
    state.loadError = "";
    let section = loc.section === -1 ? ch.sections.length - 1 : Math.min(loc.section, ch.sections.length - 1);
    if (loc.section === -2) {
      // -2: pick up where you left off, at the first section with a verse not yet read
      const read = getChapterRead(loc.book, loc.chapter);
      const at = ch.sections.findIndex((sec) => sec.verses.some((r) => !read[parseRef(r).verse]));
      section = at < 0 ? 0 : at;
    }
    if (!state || !state.alive) return;
    state.loc = { book: loc.book, chapter: loc.chapter, section };
  } catch (e) {
    if (state) state.loadError = `Could not load ${bookOfId(loc.book).title} ${loc.chapter}. Please check your connection and try again.`;
    if (state && state.alive) rerender();
    return;
  }
  rerender();
}

/** The section being read, shaped the way the rest of the page expects: { id, book, chapter, title, verses, from, to }. */
function currentPassage() {
  const { book, chapter, section } = state.loc;
  const bk = bookOfId(book);
  const sec = data.chapters[`${book}.${chapter}`].sections[section];
  return { id: sec.verses[0], book, chapter, from: sec.from, to: sec.to, title: plainRef(bk.name, chapter, sec.from, sec.to), verses: sec.verses };
}

const bookOfId = (id) => data.books.find((b) => b.id === id);

export function unmount() {
  if (state) state.alive = false;
  state = null;
}

function render(content, sidebarExtra) {
  const again = () => render(content, sidebarExtra);
  sidebarExtra.innerHTML = "";
  sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));
  const sec = el("div", "sidebar-section");
  sec.appendChild(el("h3", "sidebar-title", "Display"));
  const label = el("label", "bible-check");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = state.showAccents;
  cb.addEventListener("change", () => {
    state.showAccents = cb.checked;
    setShowAccents(cb.checked);
    again();
  });
  label.appendChild(cb);
  label.appendChild(document.createTextNode(" Show accent marks"));
  sec.appendChild(label);
  sec.appendChild(el("p", "caption", "Hide the accent marks to read the way many printed texts do. Nothing else about the text changes."));
  const divLabel = el("label", "bible-check");
  const divCb = document.createElement("input");
  divCb.type = "checkbox";
  divCb.checked = state.showDivisions && !!state.accentIndex;
  divCb.disabled = !state.accentIndex;
  divCb.addEventListener("change", () => {
    state.showDivisions = divCb.checked;
    try {
      localStorage.setItem("hebrewApp.readingDivisions", divCb.checked ? "1" : "0");
    } catch (e) {
      /* not critical */
    }
    again();
  });
  divLabel.appendChild(divCb);
  divLabel.appendChild(document.createTextNode(" Show accent divisions"));
  sec.appendChild(divLabel);
  sec.appendChild(
    el(
      "p",
      "caption",
      state.accentIndex
        ? "Marks where the accents pause a verse. A number under a word says how strong the pause is (1 is the strongest, 4 the weakest), and the main division of the verse is outlined."
        : "The accent data could not be loaded, so the divisions are not available."
    )
  );
  sidebarExtra.appendChild(sec);
  state.started = startedVocabKeys();

  content.innerHTML = "";
  content.appendChild(el("h1", "page-title", "Reading"));
  content.appendChild(el("p", "caption", "Read real verses, tap any word to see how it is built, and try your own translation before you look at the English."));
  content.appendChild(readingStatsBar());

  const tabs = el("div", "choice-group bible-tabs");
  for (const [id, text] of TABS) {
    const b = el("button", "choice-btn" + (state.tab === id ? " selected" : ""), esc(text));
    b.type = "button";
    b.addEventListener("click", () => {
      state.tab = id;
      again();
    });
    tabs.appendChild(b);
  }
  content.appendChild(tabs);

  const body = el("div", "bible-body");
  content.appendChild(body);
  if (state.tab === "read") renderRead(body, again, (loc) => goTo(loc, again));
  else renderMixed(body, again);

  // quiet things at the bottom of the page: offline use and where the text comes from
  const more = el("details", "reading-more");
  more.appendChild(el("summary", "", "Reading offline"));
  more.appendChild(offlineBar());
  content.appendChild(more);
  content.appendChild(el("p", "caption reading-source", `Hebrew text and tagging: ${esc(data.source.name)}. English: ${esc(data.source.english)}. See Sources & Credits.`));

  const cur = currentPassage();
  const where = state.tab === "read" ? `Read & translate · ${cur.title}` : "Mixed review";
  saveResumePoint("bible-reading", { tab: state.tab, passage: cur.id }, where);
  // quietly fetch the chapter after this one (or the first of the next book), so turning the page is instant
  const here = bookOfId(state.loc.book);
  const after = state.loc.chapter < here.chapters.length ? { book: here.id, chapter: state.loc.chapter + 1 } : (() => { const at = data.books.findIndex((b) => b.id === here.id); return at < data.books.length - 1 ? { book: data.books[at + 1].id, chapter: 1 } : null; })();
  if (after) ensureChapter(after.book, after.chapter).catch(() => {});
}

function readingStatsBar() {
  const s = getReadingStats();
  const bits = [];
  bits.push(s.streak > 0 ? `🕯️ ${s.streak}-day reading streak` : "No reading streak yet — mark a passage as read to start one");
  if (s.today > 0) bits.push(`${s.today} ${s.today === 1 ? "verse" : "verses"} read today`);
  bits.push(`${s.verses} different ${s.verses === 1 ? "verse" : "verses"} read in all`);
  return el("div", "info-box reading-stats", esc(bits.join(" · ")));
}

// ---------------------------------------------------------------------------------------------
// Read & translate
// ---------------------------------------------------------------------------------------------

function knowledgeOf(p) {
  if (!state.vocabIndex || state.vocabIndex.size === 0) return null;
  return passageKnowledge(p.verses, data.verses, state.vocabIndex, state.started);
}

/** A labelled drop-down: options are [value, text]. */
function selectField(label, cls, options, selected, onChange) {
  const wrap = el("label", "reading-pick");
  wrap.appendChild(el("span", "reading-pick-label", esc(label)));
  const sel = el("select", `reading-select ${cls}`);
  for (const [value, text] of options) {
    const o = el("option", "", esc(text));
    o.value = value;
    if (value === selected) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

/** What a chapter is called in the Chapter menu: "Chapter 2", "Psalm 23". */
const chapterLabel = (bk, n) => (bk.id === "Ps" ? `Psalm ${n}` : `Chapter ${n}`);

function renderRead(body, rerender, go) {
  const loc = state.loc;
  const book = bookOfId(loc.book);
  const ch = data.chapters[`${loc.book}.${loc.chapter}`];
  const counts = Object.fromEntries(data.books.map((b) => [b.id, getBookReadCounts(b.id)]));
  const isChapterDone = (b, n) => (counts[b.id][n] || 0) >= b.chapters[n - 1];
  const isBookDone = (b) => b.chapters.every((_, i) => isChapterDone(b, i + 1));
  const readSet = getChapterRead(book.id, loc.chapter); // { verseNumber: date }
  const isRead = (ref) => !!readSet[parseRef(ref).verse];

  if (state.loadError) body.appendChild(el("div", "alert alert-warning", esc(state.loadError)));

  // Step 1: the book. Step 2: the chapter. Step 3: the section (a few verses) to read now.
  const picker = el("div", "reading-picker");
  picker.appendChild(
    selectField("Book", "reading-book-select", data.books.map((b) => [b.id, b.title + (isBookDone(b) ? " ✓" : "")]), book.id, (id) => {
      const b = bookOfId(id);
      const first = b.chapters.findIndex((_, i) => !isChapterDone(b, i + 1));
      go({ book: id, chapter: first < 0 ? 1 : first + 1, section: -2 });
    })
  );
  picker.appendChild(
    selectField("Chapter", "reading-chapter-select", book.chapters.map((_, i) => [String(i + 1), chapterLabel(book, i + 1) + (isChapterDone(book, i + 1) ? " ✓" : "")]), String(loc.chapter), (n) => {
      go({ book: book.id, chapter: Number(n), section: -2 });
    })
  );
  body.appendChild(picker);
  if (ch.headings) {
    body.appendChild(el("p", "caption reading-note", "<b>Hebrew verse numbers.</b> In the Hebrew Bible a psalm’s heading is counted as its first verse (sometimes its first two), so the Hebrew verse numbers here are higher than the English ones. The English shown with each verse is the English for that Hebrew verse."));
  }

  const sectionsOf = ch.sections.map((sec, i) => ({ i, p: { id: sec.verses[0], title: plainRef(book.name, loc.chapter, sec.from, sec.to), verses: sec.verses } }));
  const know = new Map(sectionsOf.map((x) => [x.i, knowledgeOf(x.p)]));
  let shownSections = sectionsOf;
  if (state.sortEasy) shownSections = sectionsOf.slice().sort((x, y) => (know.get(y.i)?.pct ?? -1) - (know.get(x.i)?.pct ?? -1));
  const group = el("div", "reading-passages");
  const readCount = Object.keys(readSet).length;
  group.appendChild(el("h2", "reading-book-title", `${esc(book.name)} ${loc.chapter} <span class="caption">${sectionsOf.length} ${sectionsOf.length === 1 ? "section" : "sections"} · ${readCount} of ${ch.count} verses read</span>`));
  const sectionRow = el("div", "choice-group reading-section-list");
  for (const { p, i } of shownSections) {
    const k = know.get(i);
    const complete = p.verses.every(isRead);
    const b = el("button", "choice-btn reading-section-btn" + (i === loc.section ? " selected" : ""), `${complete ? '<span class="reading-section-done" aria-hidden="true">✓ </span>' : ""}<span class="reading-passage-title">${esc(p.title)}</span>${k && k.pct !== null ? ` <span class="reading-know reading-know-${k.pct >= 80 ? "high" : k.pct >= 50 ? "mid" : "low"}">${k.pct}%</span>` : ""}`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(i === loc.section));
    b.setAttribute("aria-label", `${p.title}${complete ? ", all read" : ""}${k && k.pct !== null ? `. You know about ${k.pct} percent of its words.` : ""}`);
    b.addEventListener("click", () => go({ book: book.id, chapter: loc.chapter, section: i }));
    sectionRow.appendChild(b);
  }
  group.appendChild(sectionRow);
  if (sectionsOf.length > 1) {
    const easy = el("label", "bible-check reading-sort");
    const easyCb = document.createElement("input");
    easyCb.type = "checkbox";
    easyCb.checked = state.sortEasy;
    easyCb.addEventListener("change", () => {
      state.sortEasy = easyCb.checked;
      rerender();
    });
    easy.appendChild(easyCb);
    easy.appendChild(document.createTextNode(" Easiest sections first (most words you know)"));
    group.appendChild(easy);
  }
  body.appendChild(group);

  const passage = currentPassage();
  body.appendChild(knowledgePanel(passage));
  body.appendChild(el("p", "caption", "Tap a word to see its parts. Try translating the verse yourself first, then tap “Show English” to check."));

  for (const ref of passage.verses) body.appendChild(verseCard(ref, isRead(ref), rerender));

  // One button for the whole passage: reading is marked a passage at a time.
  const unread = passage.verses.filter((r) => !isRead(r));
  const row = el("div", "button-row");
  if (unread.length) {
    const all = el("button", "btn btn-outline", `Mark this passage as read (${unread.length} ${unread.length === 1 ? "verse" : "verses"})`);
    all.type = "button";
    all.addEventListener("click", () => {
      markVersesRead(unread);
      recordStreakActivity();
      rerender();
    });
    row.appendChild(all);
  } else {
    row.appendChild(el("div", "bible-feedback is-correct", "You have marked this whole passage as read."));
    const undo = el("button", "btn btn-sm btn-outline", "Unmark this passage");
    undo.type = "button";
    undo.addEventListener("click", () => {
      unmarkVersesRead(passage.verses);
      rerender();
    });
    row.appendChild(undo);
  }
  body.appendChild(row);

  // Moving on: the section before and after (after the last section of a chapter comes the next chapter, then the next book).
  const prev = stepFrom(loc, -1);
  const next = stepFrom(loc, 1);
  const labelFor = (t) => {
    const bk = bookOfId(t.book);
    const c = data.chapters[`${t.book}.${t.chapter}`];
    if (c && t.section !== -2) {
      const sec = c.sections[t.section < 0 ? c.sections.length - 1 : t.section];
      return plainRef(bk.name, t.chapter, sec.from, sec.to);
    }
    return `${bk.name} ${t.chapter}`;
  };
  const nav = el("div", "button-row reading-section-nav");
  const mk = (text, target) => {
    const b = el("button", "btn btn-outline", esc(text));
    b.type = "button";
    b.addEventListener("click", async () => {
      await go(target);
      const top = document.querySelector(".reading-picker"); // back to the choosers, so the new section starts at the top
      if (top && top.scrollIntoView) top.scrollIntoView({ block: "start" });
    });
    return b;
  };
  if (prev) nav.appendChild(mk(`← Previous: ${labelFor(prev)}`, prev));
  if (next) nav.appendChild(mk(`Next: ${labelFor(next)} →`, next));
  else nav.appendChild(el("p", "caption", `That is the end of ${book.title}.`));
  body.appendChild(nav);
}

/** "You know about 82% of the words in this passage", and the words that are not known yet. */
function knowledgePanel(passage) {
  const k = knowledgeOf(passage);
  const box = el("div", "info-box reading-knowledge");
  if (!k || k.pct === null) {
    box.textContent = "The vocabulary list is not available, so the share of words you know cannot be worked out.";
    return box;
  }
  box.innerHTML = `<b>You know about ${k.pct}% of the words in this passage</b> (${k.known} of ${k.words} counted words).
    ${k.notStarted ? `${k.notStarted} more ${k.notStarted === 1 ? "is" : "are"} in your vocabulary list but not started. ` : ""}${k.notInList ? `${k.notInList} ${k.notInList === 1 ? "is" : "are"} not in the vocabulary list. ` : ""}${k.names ? `${k.names} ${k.names === 1 ? "name is" : "names are"} not counted.` : ""}`;
  if (k.unknown.length) {
    const det = el("details", "reading-unknown");
    det.appendChild(el("summary", "", `Words not known yet (${k.unknown.length})`));
    const list = el("ul", "reading-unknown-list");
    const seen = new Set();
    for (const u of k.unknown) {
      if (seen.has(u.lem)) continue;
      seen.add(u.lem);
      list.appendChild(el("li", "", `<span lang="he" dir="rtl" class="bible-inline">${esc(u.lem)}</span> ${esc(u.gl)} <span class="caption">· ${u.inList ? "in your vocabulary list, not started" : "not in the vocabulary list"}</span>`));
    }
    det.appendChild(list);
    box.appendChild(det);
  }
  const how = el("details", "reading-unknown");
  how.appendChild(el("summary", "", "How is this worked out?"));
  how.appendChild(el("p", "caption", "The percentage is an estimate of how much of a section you already know. A word counts as known once you have started learning it in Vocabulary (any flashcard, typing or games practice). Names are not counted."));
  box.appendChild(how);
  return box;
}

/** The "Save for offline" bar. */
function offlineBar() {
  const wrap = el("div", "info-box reading-offline");
  const saved = getOfflineSaved();
  const savedBooks = (saved && saved.books) || {};
  const text = el("span", "reading-offline-text");
  const status = el("span", "caption reading-offline-status");
  status.setAttribute("role", "status");
  const names = data.books.filter((b) => savedBooks[b.id]).map((b) => `${b.title}${savedBooks[b.id].version !== data.version ? " (needs updating)" : ""}`);
  text.textContent = isOffline()
    ? "You are offline. Reading works from what was saved on this device."
    : names.length
      ? `Saved for offline reading: ${names.join(", ")}.`
      : "Going somewhere without a connection? Save a book to this device first.";
  // A book is saved at a time (a whole Bible is a lot for a phone); the size is what is downloaded, before the phone compresses it.
  const pick = document.createElement("select");
  pick.className = "reading-offline-book";
  pick.setAttribute("aria-label", "Book to save for offline reading");
  const mb = (b) => (b.kb < 1024 ? `${b.kb} KB` : `${(b.kb / 1024).toFixed(1)} MB`);
  for (const b of data.books) {
    const o = document.createElement("option");
    o.value = b.id;
    o.textContent = `${b.title} (${mb(b)})${savedBooks[b.id] ? " ✓" : ""}`;
    pick.appendChild(o);
  }
  pick.value = state.loc.book;
  const label = () => (savedBooks[pick.value] ? "Update the saved copy" : "Save this book");
  const btn = el("button", "btn btn-sm btn-outline", label());
  pick.addEventListener("change", () => {
    btn.textContent = label();
  });
  btn.type = "button";
  btn.disabled = isOffline();
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const book = bookOfId(pick.value);
    const r = await saveReadingForOffline(
      (done, total) => {
        status.textContent = ` Saving ${book.title}… ${done} of ${total}`;
      },
      { bookId: book.id }
    );
    status.textContent = r.ok ? ` Saved ${book.title}. It will work without a connection on this device.` : ` Some parts could not be saved (${r.failed.length}). Check your connection and try again.`;
    btn.disabled = false;
  });
  wrap.append(text, document.createTextNode(" "), pick, document.createTextNode(" "), btn, status);
  return wrap;
}

function verseCard(ref, isRead, rerender) {
  const words = data.verses[ref];
  const card = el("div", "bible-guide-card reading-verse");
  card.dataset.ref = ref;
  const head = el("div", "reading-verse-head");
  head.appendChild(el("strong", "", esc(prettyRef(ref))));
  if (isRead) head.appendChild(el("span", "pill pill-good", "Read"));
  card.appendChild(head);

  const tappedWi = state.tapped[ref];
  const verse = buildVerse(words, {
    showAccents: state.showAccents,
    onWord: (wi) => {
      state.tapped[ref] = state.tapped[ref] === wi ? undefined : wi;
      rerender();
    },
  });
  if (tappedWi !== undefined) {
    const node = verse.querySelector(`[data-wi="${tappedWi}"]`);
    if (node) node.classList.add("is-picked");
  }
  // The accents of this verse (read from the marks; the text is not changed).
  const analysis = state.accentIndex ? analyzeVerse(words, { poetry: isPoetryBook(ref.split(".")[0]), index: state.accentIndex }) : null;
  if (analysis && state.showDivisions) {
    for (const aw of analysis.words) {
      if (!aw.pause) continue;
      const node = verse.querySelector(`[data-wi="${aw.wi}"]`);
      if (!node) continue;
      node.classList.add("accent-pause", `accent-g${aw.pause.group}`);
      node.dataset.accentLabel = String(aw.pause.group);
      node.title = `${aw.pause.name}: a disjunctive accent, ${groupLabel(aw.pause.group)}`;
      if (analysis.main && analysis.main.wi === aw.wi) node.classList.add("accent-main");
    }
  }
  card.appendChild(verse);
  if (analysis && state.showDivisions) card.appendChild(divisionsNote(words, analysis));
  if (tappedWi !== undefined && words[tappedWi]) card.appendChild(parsingPanel(words[tappedWi], analysis ? analysis.words[tappedWi] : null));

  // your own translation (kept only while you are on this page)
  const note = el("textarea", "reading-translation");
  note.rows = 2;
  note.placeholder = "Your translation (optional)";
  note.value = state.notes[ref] || "";
  note.setAttribute("aria-label", `Your translation of ${prettyRef(ref)}`);
  note.addEventListener("input", () => {
    state.notes[ref] = note.value;
  });
  card.appendChild(note);

  const buttons = el("div", "button-row");
  const show = el("button", "btn btn-sm btn-outline", state.english[ref] ? "Hide English" : "Show English");
  show.type = "button";
  show.addEventListener("click", () => {
    state.english[ref] = !state.english[ref];
    rerender();
  });
  buttons.appendChild(show);
  card.appendChild(buttons);

  if (state.english[ref]) {
    const en = data.english[ref];
    card.appendChild(el("div", "bible-feedback reading-english", en ? esc(en) : "No English text is available for this verse."));
    if (en) card.appendChild(el("p", "caption", `${esc(data.source.english)}. Tap the Hebrew words above to see how the Hebrew builds the sentence.`));
    if (en) card.appendChild(selfCheck(ref, words));
  }
  return card;
}

/** One line (and a list) saying where the accents divide the verse, in words, so it does not rely on seeing the markings. */
function divisionsNote(words, analysis) {
  const box = el("div", "reading-divisions");
  const wordText = (wi) => {
    const t = readText(words[wi]); // a ketiv/qere pair carries the accents of the qere
    return state.showAccents ? t : stripAccents(t);
  };
  const hebrew = (wi) => `<span lang="he" dir="rtl" class="bible-inline">${esc(wordText(wi))}</span>`;
  const pauses = analysis.words.filter((w) => w.pause);
  if (analysis.main) {
    box.appendChild(
      el("p", "caption", `<b>Main division:</b> the verse divides after ${hebrew(analysis.main.wi)}, which carries the ${esc(analysis.main.accent.name)} (${groupLabel(analysis.main.accent.group)}).`)
    );
  } else {
    box.appendChild(el("p", "caption", "This verse has no division other than its last word."));
  }
  if (pauses.length) {
    const list = el("p", "caption reading-pause-list", `<b>Pauses, in reading order:</b> ` + pauses.map((w) => `${hebrew(w.wi)} ${esc(w.pause.name)} (${w.pause.group})`).join(" · "));
    box.appendChild(list);
  }
  return box;
}

/** After the English: mark each word "Got it" or "Missed it". Misses go to your vocabulary review. */
function selfCheck(ref, words) {
  const box = el("div", "reading-selfcheck");
  box.appendChild(el("h4", "reading-selfcheck-title", "How did you do?"));
  box.appendChild(el("p", "caption", "Mark each word you could translate before looking, or not. A word you miss that is in your vocabulary list is sent to your review; “Got it” changes nothing in your review."));
  const saved = getSelfCheck()[ref] || {};
  const summary = el("p", "caption reading-selfcheck-summary");
  summary.setAttribute("role", "status");
  const refreshSummary = () => {
    const s = verseCheckSummary(ref);
    summary.textContent = s.got + s.missed ? `${s.got} got it · ${s.missed} missed` : "";
  };
  const index = state.vocabIndex || new Map();
  const list = el("ul", "reading-selfcheck-list");
  const rows = [];
  selfCheckWords(words).forEach(({ w, wi }) => {
    const d = describeWord(w, index);
    if (d.kind !== "word") return;
    const li = el("li", "reading-selfcheck-row");
    const word = el("span", "reading-selfcheck-word", `<span lang="he" dir="rtl" class="bible-inline">${esc(state.showAccents ? w.t.split("/").join("") : stripAccents(w.t.split("/").join("")))}</span>${w.gl ? ` <span class="caption">${esc(w.gl)}</span>` : ""}`);
    const msg = el("span", "caption reading-selfcheck-msg");
    msg.setAttribute("role", "status");
    const group = el("span", "reading-selfcheck-buttons");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", `Did you know the word ${w.gl || w.lem || ""}?`);
    const mk = (text, got) => {
      const b = el("button", "btn btn-sm btn-outline", text);
      b.type = "button";
      b.setAttribute("aria-pressed", String(saved[wi] === (got ? 1 : 0)));
      if (saved[wi] === (got ? 1 : 0)) b.classList.add("is-picked");
      b.addEventListener("click", () => {
        const r = setWordCheck(ref, wi, w, got, index);
        saved[wi] = got ? 1 : 0;
        for (const x of group.children) {
          const on = x === b;
          x.classList.toggle("is-picked", on);
          x.setAttribute("aria-pressed", String(on));
        }
        msg.textContent = got ? "" : r.sentToReview ? " Sent to your vocabulary review." : r.notInList ? " Not in the vocabulary list; saved in your missed words." : "";
        refreshSummary();
      });
      return b;
    };
    group.append(mk("Got it", true), mk("Missed it", false));
    li.append(word, group, msg);
    list.appendChild(li);
    rows.push({ wi, w });
  });
  box.appendChild(list);
  if (rows.length) {
    const rest = el("button", "btn btn-sm btn-outline", "Mark the words I have not marked as “Got it”");
    rest.type = "button";
    rest.addEventListener("click", () => {
      rows.forEach(({ wi, w }, n) => {
        if (saved[wi] === undefined) list.children[n].querySelector("button").click();
      });
    });
    box.appendChild(rest);
  }
  box.appendChild(summary);
  refreshSummary();
  const missed = Object.keys(getMissedWords()).length;
  if (missed) box.appendChild(el("p", "caption", `${missed} missed ${missed === 1 ? "word" : "words"} so far ${missed === 1 ? "is" : "are"} not in your vocabulary list.`));
  return box;
}

const heb = (text) => `<span lang="he" dir="rtl" class="bible-inline">${esc(text)}</span>`;

/**
 * What the app's own vocabulary list says about a word, shown first so what is learned is what is read: the English
 * from the list, its lesson, how often it occurs, its part of speech, and whether it has been started. The older
 * dictionary meaning goes beneath it (see wordBody).
 */
function vocabBlock(w) {
  if (w.a) return el("p", "reading-aramaic", "<b>Aramaic.</b> This word is Aramaic, so it is not in the Hebrew vocabulary list.");
  if (!w.lem || !state.vocabIndex || state.vocabIndex.size === 0) return null;
  const d = describeWord(w, state.vocabIndex);
  if (d.kind === "name") return el("p", "reading-vocab-none", "A name: names are not in the vocabulary list.");
  const box = el("div", "reading-vocab");
  if (!d.rows.length) {
    box.appendChild(el("p", "reading-vocab-none", "<b>Your vocabulary:</b> this word is not in the vocabulary list yet."));
    return box;
  }
  const r = d.rows[0];
  const started = state.started.has(vocabRowKey(r));
  const freq = Number(r.Frequency);
  box.appendChild(
    el(
      "p",
      "reading-vocab-main",
      `<b>Your vocabulary:</b> ${esc(r.English)}<br><span class="caption">Lesson ${esc(r.Lesson)} · occurs ${Number.isFinite(freq) ? freq.toLocaleString("en-US") : esc(r.Frequency)} times · ${esc(r.POS)}${r.Category ? ` · ${esc(r.Category)}` : ""} · ${started ? "started" : "not started yet"}</span>`
    )
  );
  if (d.rows.length > 1) {
    box.appendChild(el("p", "caption", `Also in your list with this spelling: ${d.rows.slice(1).map((x) => `${heb(x.Hebrew)} ${esc(x.English)} (lesson ${esc(x.Lesson)})`).join("; ")}`));
  }
  return box;
}

/** The body of one word's panel: its vocabulary entry, the other meaning beneath it, its pieces, root, dictionary form and accent. */
function wordBody(box, w, accent = null) {
  const strip = (s) => (state.showAccents ? s : stripAccents(s));
  const vocab = vocabBlock(w);
  if (vocab) box.appendChild(vocab);
  if (w.gl) box.appendChild(el("p", "reading-gloss", `<b>${vocab && vocab.classList.contains("reading-vocab") ? "Other meaning" : "Rough meaning"}:</b> ${esc(w.gl)} <span class="caption">(the old Strong’s dictionary sense, a starting point rather than a translation)</span>`));
  const table = el("table", "bible-summary reading-parse-table");
  for (const [piece, labelText] of w.parts || []) {
    const tr = el("tr");
    tr.appendChild(el("td", "", heb(strip(piece))));
    tr.appendChild(el("td", "", esc(labelText)));
    table.appendChild(tr);
  }
  box.appendChild(table);
  const facts = [];
  if (w.root) facts.push(`<b>Root:</b> ${heb(w.root)}`);
  if (w.lem) facts.push(`<b>Dictionary form:</b> ${heb(w.lem)}`);
  if (accent && accent.accents.length) {
    facts.push(`<b>Accent:</b> ${accent.accents.map((a) => `${esc(a.name)} (${a.disjunctive ? `disjunctive, ${groupLabel(a.group)}` : "conjunctive"})`).join(", ")}`);
  }
  if (facts.length) box.appendChild(el("p", "reading-parse-facts", facts.join("<br>")));
}

/** What one word is made of (see wordBody). A ketiv/qere pair gets its own panel (kqPanel). */
function parsingPanel(w, accent = null) {
  if (w.kq) return kqPanel(w, accent);
  const box = el("div", "reading-parse");
  const strip = (s) => (state.showAccents ? s : stripAccents(s));
  box.appendChild(el("div", "reading-parse-word", heb(strip(w.t.split("/").join("")))));
  wordBody(box, w, accent);
  return box;
}

/**
 * A ketiv/qere pair. The verse shows only the consonants that are WRITTEN (the ketiv); here the word that is READ (the
 * qere) is shown with its vowels and parsed. A pair can also be a word read but not written (a gap in the text), a
 * word written but not read, or a qere of two or more words.
 */
function kqPanel(w, accent = null) {
  const box = el("div", "reading-parse reading-kq");
  const strip = (s) => (state.showAccents ? s : stripAccents(s));
  const qere = w.kq.words.filter((q) => !q.m && !q.s);
  if (w.kq.gap) {
    box.appendChild(el("p", "reading-kq-note", `<b>Ketiv/Qere.</b> This word is <b>read but not written</b> in the text. It is read: ${heb(strip(readText(w)))}`));
  } else if (!qere.length) {
    box.appendChild(el("div", "reading-parse-word", heb(w.t)));
    box.appendChild(el("p", "reading-kq-note", "<b>Ketiv/Qere.</b> This word is <b>written but not read</b> aloud: the tradition gives no word to read in its place."));
  } else {
    box.appendChild(el("div", "reading-parse-word", heb(w.t)));
    box.appendChild(el("p", "reading-kq-note", `<b>Ketiv/Qere.</b> What is written (ketiv): ${heb(w.t)}<br>What is read (qere): ${heb(strip(readText(w)))}${qere.length > 1 ? ` <span class="caption">(${qere.length} words)</span>` : ""}`));
  }
  qere.forEach((q, n) => {
    const part = el("div", "reading-kq-word");
    part.appendChild(el("div", "reading-parse-word", `<span class="caption">Read:</span> ${heb(strip(q.t.split("/").join("")))}`));
    wordBody(part, q, n === qere.length - 1 ? accent : null);
    box.appendChild(part);
  });
  return box;
}

// ---------------------------------------------------------------------------------------------
// Mixed review: one verse, several kinds of question
// ---------------------------------------------------------------------------------------------

async function loadMixed() {
  if (!mixedIndex) mixedIndex = (await loadBibleData("bible-mixed")).verses;
  return mixedIndex;
}

/** Starts a verse: loads the data of each page it asks about and draws its questions. */
async function startMixed(body, rerender) {
  body.innerHTML = '<div class="loading">Choosing a verse…</div>';
  try {
    const verses = await loadMixed();
    // "What I need" favours verses whose questions are due for review or weak; "Random" ignores your history.
    let pick;
    let need = null;
    if (state.mixedMode === "random") {
      pick = verses[Math.floor(Math.random() * verses.length)];
    } else {
      const chosen = pickAdaptiveVerse(verses, { avoid: state.lastMixedRef });
      pick = chosen.verse;
      need = describeNeed(chosen);
    }
    state.lastMixedRef = pick.ref;
    const questions = [];
    for (const p of pick.picks) {
      const config = getPracticeConfig(p.page);
      if (!config) continue;
      const pageData = await loadBibleData(config.dataset);
      questions.push(makeBibleQuestion(config, pageData, p.ex));
    }
    if (!state || !state.alive) return;
    state.mixed = { ref: pick.ref, questions, i: 0, results: [], picked: {}, graded: false, need };
  } catch (e) {
    if (!state || !state.alive) return;
    body.innerHTML = "";
    body.appendChild(el("div", "alert alert-warning", "Could not load a mixed-review verse. Please try again."));
    return;
  }
  rerender();
}

function renderMixed(body, rerender) {
  const m = state.mixed;
  if (!m) {
    body.appendChild(
      el("p", "", "One verse, several questions: the same kinds of question as the practice pages — the article, a prefixed preposition, the vav, the verb, a noun and more — but all in the same verse, the way they meet you when you read.")
    );
    const modes = el("div", "choice-group reading-mixed-mode");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "How the verse is chosen");
    for (const [id, text] of [
      ["need", "What I need (due and weak first)"],
      ["random", "Random"],
    ]) {
      const b = el("button", "choice-btn" + (state.mixedMode === id ? " selected" : ""), esc(text));
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.mixedMode === id));
      b.addEventListener("click", () => {
        state.mixedMode = id;
        rerender();
      });
      modes.appendChild(b);
    }
    body.appendChild(el("p", "caption", "Choose the verse by:"));
    body.appendChild(modes);
    body.appendChild(
      el(
        "p",
        "caption",
        state.mixedMode === "need"
          ? "Verses whose questions are due for review, or that you often miss, come up first. Your answers here count toward the same review schedule as the practice pages."
          : "Any verse, whatever your history."
      )
    );
    const start = el("button", "btn", "Start a verse");
    start.type = "button";
    start.addEventListener("click", () => startMixed(body, rerender));
    body.appendChild(start);
    return;
  }
  if (m.i >= m.questions.length) return renderMixedSummary(body, m, rerender);

  const bq = m.questions[m.i];
  const config = getPracticeConfig(bq.page);
  body.appendChild(el("div", "caption", `Question ${m.i + 1} of ${m.questions.length} · ${esc(config ? config.title : "")}`));
  if (m.need && m.i === 0) body.appendChild(el("p", "caption reading-mixed-why", `Chosen for you: ${esc(m.need)}.`));
  const bar = el("div", "progress-bar-outer");
  bar.appendChild(Object.assign(el("div", "progress-bar-inner"), {}));
  bar.firstChild.style.width = `${(m.i / m.questions.length) * 100}%`;
  body.appendChild(bar);

  const host = el("div", "bible-question");
  const feedback = el("div", "bible-feedback");
  const next = el("button", "btn", m.i === m.questions.length - 1 ? "See results" : "Next question");
  next.type = "button";
  next.hidden = !m.graded;
  next.addEventListener("click", () => {
    m.i += 1;
    m.picked = {};
    m.graded = false;
    rerender();
  });

  const draw = () => {
    host.innerHTML = "";
    drawBibleQuestion(host, bq, {
      showAccents: state.showAccents,
      picked: m.picked,
      graded: m.graded,
      onPick: (pi, id) => {
        m.picked[pi] = id;
        if (bq.parts.every((_, k) => m.picked[k] !== undefined)) grade();
      },
    });
  };
  function grade() {
    const right = bq.parts.every((p, k) => m.picked[k] === p.answer);
    m.graded = true;
    m.results[m.i] = { right, page: bq.page };
    recordStreakActivity();
    recordItemResult(bibleSrsMode(bq.page), bq.key, right);
    try {
      const cfg = getPracticeConfig(bq.page);
      const pageData = { verses: { [bq.ex.ref]: bq.words }, examples: [] };
      if (cfg) noteBibleAnswer(cfg, pageData, bq.ex, bq.parts, m.picked);
    } catch (e) {
      /* the extra notes never interrupt a question */
    }
    draw();
    feedback.className = "bible-feedback " + (right ? "is-correct" : "is-wrong");
    feedback.innerHTML = `<strong>${right ? "Correct. " : "Not quite. "}</strong>${bq.explainHtml}`;
    if (right) {
      const ask = createConfidenceAsk(bibleSrsMode(bq.page), bq.key);
      if (ask) feedback.appendChild(ask);
    }
    next.hidden = false;
  }
  draw();
  if (m.graded) {
    // coming back to a graded question after a redraw (for example toggling the accent marks)
    const right = m.results[m.i] && m.results[m.i].right;
    feedback.className = "bible-feedback " + (right ? "is-correct" : "is-wrong");
    feedback.innerHTML = `<strong>${right ? "Correct. " : "Not quite. "}</strong>${bq.explainHtml}`;
  }
  body.appendChild(host);
  body.appendChild(feedback);
  body.appendChild(next);
}

function renderMixedSummary(body, m, rerender) {
  const right = m.results.filter((r) => r && r.right).length;
  body.appendChild(el("h2", "", `${prettyRef(m.ref)}: ${right} of ${m.questions.length} correct`));
  const words = m.questions[0].words;
  body.appendChild(buildVerse(words, { showAccents: state.showAccents }));
  const list = el("ul", "bible-credit-list");
  m.questions.forEach((bq, i) => {
    const cfg = getPracticeConfig(bq.page);
    const r = m.results[i];
    const word = bq.words[bq.ex.wi];
    list.appendChild(
      el("li", "", `${r && r.right ? "✓" : "✗"} ${esc(cfg ? cfg.title : bq.page)}: <span lang="he" dir="rtl" class="bible-inline">${esc(word.t.split("/").join(""))}</span>`)
    );
  });
  body.appendChild(list);
  const row = el("div", "button-row");
  const again = el("button", "btn", "Another verse");
  again.type = "button";
  again.addEventListener("click", () => {
    state.mixed = null;
    startMixed(body, rerender);
  });
  row.appendChild(again);
  const done = el("button", "btn btn-outline", "Back to reading");
  done.type = "button";
  done.addEventListener("click", () => {
    state.mixed = null;
    state.tab = "read";
    rerender();
  });
  row.appendChild(done);
  body.appendChild(row);
}
