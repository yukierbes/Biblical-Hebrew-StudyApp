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
import { bibleSrsMode, exampleKey } from "../bible-areas.js";

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
  state = { tab: "read", passage: 0, showAccents: getShowAccents(), tapped: {}, english: {}, notes: {}, mixed: null, alive: true };
  content.innerHTML = '<div class="loading">Loading the reading passages…</div>';
  try {
    data = await loadBibleData("bible-reading");
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(el("div", "alert alert-warning", "Could not load the reading passages. Please check your connection and try again."));
    return;
  }
  if (!state || !state.alive) return;
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
  sidebarExtra.appendChild(sec);

  content.innerHTML = "";
  content.appendChild(el("h1", "page-title", "Reading"));
  content.appendChild(
    el("p", "caption", `Read real verses, tap any word to see how it is built, and try your own translation before you look at the English. Source: ${esc(data.source.name)} (see Sources & Credits).`)
  );
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
  if (state.tab === "read") renderRead(body, again);
  else renderMixed(body, again);
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

function renderRead(body, rerender) {
  const picker = el("div", "choice-group reading-passages");
  data.passages.forEach((p, i) => {
    const b = el("button", "choice-btn" + (i === state.passage ? " selected" : ""), esc(p.title));
    b.type = "button";
    b.addEventListener("click", () => {
      state.passage = i;
      rerender();
    });
    picker.appendChild(b);
  });
  body.appendChild(picker);

  const passage = data.passages[state.passage] || data.passages[0];
  if (passage.note) body.appendChild(el("p", "caption", esc(passage.note)));
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
  card.appendChild(verse);
  if (tappedWi !== undefined && words[tappedWi]) card.appendChild(parsingPanel(words[tappedWi]));

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
  }
  return card;
}

/** What one word is made of: each piece with its label, the dictionary form, a rough meaning and (for verbs) the root. */
function parsingPanel(w) {
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
    const pick = verses[Math.floor(Math.random() * verses.length)];
    const questions = [];
    for (const p of pick.picks) {
      const config = getPracticeConfig(p.page);
      if (!config) continue;
      const pageData = await loadBibleData(config.dataset);
      questions.push(makeBibleQuestion(config, pageData, p.ex));
    }
    if (!state || !state.alive) return;
    state.mixed = { ref: pick.ref, questions, i: 0, results: [], picked: {}, graded: false };
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
