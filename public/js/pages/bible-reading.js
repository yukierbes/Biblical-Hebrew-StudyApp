// Reading: real verses to read, with tap-any-word parsing, your own translation, tap-to-reveal English and a
// "mark as read" streak — plus a Mixed review that asks about the article, the preposition, the vav, the verb and
// more, all in one verse.
//
// The words, their parsing and the English come from the "bible-reading" dataset (built by
// scripts/build-reading.mjs from reading-passages.csv). The mixed questions are the same questions the practice
// pages ask: an index (bible-mixed) says which examples share a verse, and each page's own data and configuration
// draw the question and its answer boxes.

import { loadBibleData } from "../bible-data.js";
import { buildVerse, prettyRef, getShowAccents, setShowAccents, hebrewHtml, stripAccents } from "../bible-text.js";
import { getPracticeConfig, makeBibleQuestion, drawBibleQuestion, noteBibleAnswer } from "../bible-practice.js";
import { markVerseRead, unmarkVerseRead, getReadLog, getReadingStats } from "../bible-insights.js";
import { recordStreakActivity, recordItemResult } from "../srs.js";
import { bibleSrsMode, exampleKey, pickAdaptiveVerse, describeNeed } from "../bible-areas.js";
import { createConfidenceAsk } from "../confidence.js";
import { saveResumePoint } from "../resume.js";
import { buildVocabIndex, startedVocabKeys, passageKnowledge, describeWord, setWordCheck, getSelfCheck, getMissedWords, verseCheckSummary } from "../reading-vocab.js";
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

const TABS = [
  ["read", "Read & translate"],
  ["mixed", "Mixed review"],
];

let state = null;
let data = null;
let mixedIndex = null;

export async function mount({ content, sidebarExtra }) {
  state = { mixedMode: "need", lastMixedRef: null, showDivisions: localStorage.getItem("hebrewApp.readingDivisions") === "1", sortEasy: false, vocabIndex: null, accentIndex: null, started: new Set(), tab: "read", passage: 0, showAccents: getShowAccents(), tapped: {}, english: {}, notes: {}, mixed: null, alive: true };
  content.innerHTML = '<div class="loading">Loading the reading passages…</div>';
  try {
    data = await loadBibleData("bible-reading");
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(el("div", "alert alert-warning", "Could not load the reading passages. Please check your connection and try again."));
    return;
  }
  if (!state || !state.alive) return;
  // Vocabulary (for "words you know") and accents (for the divisions overlay): helpful, but Reading works without them.
  await Promise.allSettled([loadVocabData(), loadAccentData()]);
  if (!state || !state.alive) return;
  state.vocabIndex = buildVocabIndex();
  state.accentIndex = getAccentRows().length ? buildAccentIndex(getAccentRows()) : null;
  const link = consumeDeepLink();
  if (link && link.type === "resume" && link.page === "bible-reading" && link.detail) {
    if (["read", "mixed"].includes(link.detail.tab)) state.tab = link.detail.tab;
    if (Number.isInteger(link.detail.passage) && data.passages[link.detail.passage]) state.passage = link.detail.passage;
  }
  render(content, sidebarExtra);
}

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
  content.appendChild(
    el("p", "caption", `Read real verses, tap any word to see how it is built, and try your own translation before you look at the English. Source: ${esc(data.source.name)} (see Sources & Credits).`)
  );
  content.appendChild(readingStatsBar());
  content.appendChild(offlineBar());

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
  if (state.tab === "read") renderRead(body, again);
  else renderMixed(body, again);
  const where = state.tab === "read" ? `Read & translate · ${(data.passages[state.passage] || {}).title || ""}` : "Mixed review";
  saveResumePoint("bible-reading", { tab: state.tab, passage: state.passage }, where);
}

function readingStatsBar() {
  const s = getReadingStats();
  const bits = [];
  bits.push(s.streak > 0 ? `🕯️ ${s.streak}-day reading streak` : "No reading streak yet — mark a verse as read to start one");
  if (s.today > 0) bits.push(`${s.today} ${s.today === 1 ? "verse" : "verses"} read today`);
  bits.push(`${s.verses} different ${s.verses === 1 ? "verse" : "verses"} read in all`);
  return el("div", "info-box reading-stats", esc(bits.join(" · ")));
}

// ---------------------------------------------------------------------------------------------
// Read & translate
// ---------------------------------------------------------------------------------------------

const BOOK_ORDER = ["Gen", "Exod", "Deut", "Ps", "Ruth", "Jonah"];

function knowledgeOf(p) {
  if (!state.vocabIndex || state.vocabIndex.size === 0) return null;
  return passageKnowledge(p.verses, data.verses, state.vocabIndex, state.started);
}

function renderRead(body, rerender) {
  // Passages grouped by book, each with how much of it you already know.
  const sortRow = el("div", "reading-sort");
  const easy = el("label", "bible-check");
  const easyCb = document.createElement("input");
  easyCb.type = "checkbox";
  easyCb.checked = state.sortEasy;
  easyCb.addEventListener("change", () => {
    state.sortEasy = easyCb.checked;
    rerender();
  });
  easy.appendChild(easyCb);
  easy.appendChild(document.createTextNode(" Easiest first (most words you know)"));
  sortRow.appendChild(easy);
  body.appendChild(sortRow);

  const books = [...new Set(data.passages.map((p) => p.book))].sort((x, y) => (BOOK_ORDER.indexOf(x) + 99) % 99 - (BOOK_ORDER.indexOf(y) + 99) % 99);
  const picker = el("div", "reading-passages");
  for (const book of books) {
    let items = data.passages.map((p, i) => ({ p, i })).filter((x) => x.p.book === book);
    const know = new Map(items.map((x) => [x.i, knowledgeOf(x.p)]));
    if (state.sortEasy) items = items.slice().sort((x, y) => (know.get(y.i)?.pct ?? -1) - (know.get(x.i)?.pct ?? -1));
    const group = el("div", "reading-book");
    group.appendChild(el("h3", "reading-book-title", esc(items[0].p.bookName)));
    const row = el("div", "choice-group");
    for (const { p, i } of items) {
      const k = know.get(i);
      const b = el("button", "choice-btn" + (i === state.passage ? " selected" : ""), `<span class="reading-passage-title">${esc(p.title)}</span>${k && k.pct !== null ? ` <span class="reading-know reading-know-${k.pct >= 80 ? "high" : k.pct >= 50 ? "mid" : "low"}">${k.pct}%</span>` : ""}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(i === state.passage));
      if (k && k.pct !== null) b.setAttribute("aria-label", `${p.title}. You know about ${k.pct} percent of its words.`);
      b.addEventListener("click", () => {
        state.passage = i;
        rerender();
      });
      row.appendChild(b);
    }
    group.appendChild(row);
    picker.appendChild(group);
  }
  body.appendChild(picker);
  body.appendChild(el("p", "caption", "The percentage is an estimate of how much of each passage you already know. A word counts as known once you have started learning it in Vocabulary (any flashcard, typing or games practice). Names are not counted."));

  const passage = data.passages[state.passage] || data.passages[0];
  if (passage.note) body.appendChild(el("p", "caption", esc(passage.note)));
  body.appendChild(knowledgePanel(passage));
  body.appendChild(el("p", "caption", "Tap a word to see its parts. Try translating the verse yourself first, then tap “Show English” to check."));

  const log = getReadLog();
  for (const ref of passage.verses) body.appendChild(verseCard(ref, log, rerender));

  const unread = passage.verses.filter((r) => !log.verses[r]);
  const row = el("div", "button-row");
  if (unread.length) {
    const all = el("button", "btn btn-outline", `Mark the whole passage as read (${unread.length} ${unread.length === 1 ? "verse" : "verses"})`);
    all.type = "button";
    all.addEventListener("click", () => {
      for (const r of unread) markVerseRead(r);
      recordStreakActivity();
      rerender();
    });
    row.appendChild(all);
  } else {
    row.appendChild(el("div", "bible-feedback is-correct", "You have marked every verse of this passage as read."));
  }
  body.appendChild(row);
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
  return box;
}

/** The "Save for offline" bar. */
function offlineBar() {
  const wrap = el("div", "info-box reading-offline");
  const saved = getOfflineSaved();
  const text = el("span", "reading-offline-text");
  const status = el("span", "caption reading-offline-status");
  status.setAttribute("role", "status");
  const when = saved ? new Date(saved.when).toLocaleDateString() : "";
  text.textContent = isOffline()
    ? "You are offline. Reading works from the copy saved on this device."
    : saved
      ? `Saved for offline reading on ${when}.`
      : "Going somewhere without a connection? Save Reading to this device first.";
  const btn = el("button", "btn btn-sm btn-outline", saved ? "Update the saved copy" : "Save for offline reading");
  btn.type = "button";
  btn.disabled = isOffline();
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const r = await saveReadingForOffline((done, total) => {
      status.textContent = ` Saving… ${done} of ${total}`;
    });
    status.textContent = r.ok ? " Saved. Reading will work without a connection on this device." : ` Some parts could not be saved (${r.failed.length}). Check your connection and try again.`;
    btn.disabled = false;
  });
  wrap.append(text, document.createTextNode(" "), btn, status);
  return wrap;
}

function verseCard(ref, log, rerender) {
  const words = data.verses[ref];
  const card = el("div", "bible-guide-card reading-verse");
  card.dataset.ref = ref;
  const head = el("div", "reading-verse-head");
  head.appendChild(el("strong", "", esc(prettyRef(ref))));
  if (log.verses[ref]) head.appendChild(el("span", "pill pill-good", "Read"));
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
  const read = el("button", "btn btn-sm" + (log.verses[ref] ? " btn-outline" : ""), log.verses[ref] ? "Unmark as read" : "Mark as read");
  read.type = "button";
  read.addEventListener("click", () => {
    if (log.verses[ref]) unmarkVerseRead(ref);
    else {
      markVerseRead(ref);
      recordStreakActivity();
    }
    rerender();
  });
  buttons.appendChild(read);
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
    const t = words[wi].t.split("/").join("");
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
  words.forEach((w, wi) => {
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

/** What one word is made of: each piece with its label, the dictionary form, a rough meaning and (for verbs) the root. */
function parsingPanel(w, accent = null) {
  const box = el("div", "reading-parse");
  const strip = (s) => (state.showAccents ? s : stripAccents(s));
  box.appendChild(el("div", "reading-parse-word", `<span lang="he" dir="rtl" class="bible-inline">${esc(strip(w.t.split("/").join("")))}</span>`));
  const table = el("table", "bible-summary reading-parse-table");
  for (const [piece, labelText] of w.parts || []) {
    const tr = el("tr");
    tr.appendChild(el("td", "", `<span lang="he" dir="rtl" class="bible-inline">${esc(strip(piece))}</span>`));
    tr.appendChild(el("td", "", esc(labelText)));
    table.appendChild(tr);
  }
  box.appendChild(table);
  const facts = [];
  if (w.root) facts.push(`<b>Root:</b> <span lang="he" dir="rtl" class="bible-inline">${esc(w.root)}</span>`);
  if (w.lem) facts.push(`<b>Dictionary form:</b> <span lang="he" dir="rtl" class="bible-inline">${esc(w.lem)}</span>`);
  if (w.gl) facts.push(`<b>Rough meaning:</b> ${esc(w.gl)}`);
  if (accent && accent.accents.length) {
    facts.push(`<b>Accent:</b> ${accent.accents.map((a) => `${esc(a.name)} (${a.disjunctive ? `disjunctive, ${groupLabel(a.group)}` : "conjunctive"})`).join(", ")}`);
  }
  if (facts.length) box.appendChild(el("p", "reading-parse-facts", facts.join("<br>")));
  box.appendChild(el("p", "caption", "The rough meaning is the old Strong’s dictionary sense, a starting point rather than a translation."));
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
