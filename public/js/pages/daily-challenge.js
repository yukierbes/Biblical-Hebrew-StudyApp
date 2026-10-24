import { wrapHebrewSpans, computeAmbiguityHints } from "../helpers.js";
import { getLetterSet } from "../letter-sets.js";
import { consumeDeepLink } from "../deep-link.js";
import { renderPrompt as renderVocabPrompt, renderAnswerInput as renderVocabAnswerInput } from "../vocab-answer-matching.js";
import { renderAccentPrompt, renderAccentAnswerInput } from "../accent-answer-matching.js";
import { renderPrompt as renderLetterPrompt, renderAnswerInput as renderLetterAnswerInput } from "../letter-answer-matching.js";
import { renderNameInput } from "../name-matching.js";
import {
  PARSE_FIELDS,
  availableAreaIds,
  buildChallenge,
  prepareChallenge,
  buildDrill,
  getRow,
  grade,
  parseOptions,
  recordResult,
  verbSiblings,
} from "../daily-data.js";
import {
  LENGTHS,
  clearInProgress,
  getEntry,
  getStats,
  getYesterday,
  loadInProgress,
  loadLog,
  loadSettings,
  monthGrid,
  recordCompletion,
  saveInProgress,
  saveSettings,
  starsFor,
} from "../daily-history.js";
import { playCorrect, playFinish, playWrong } from "../daily-sound.js";

import { celebrate } from "../celebrate.js";
import { drawBibleQuestion } from "../bible-practice.js";
import { getShowAccents } from "../bible-text.js";
import { celebrationForPercent, resultMessage } from "../encourage.js";
// The Daily Challenge: a short round (5, 10 or 15 questions) that is personal to
// the learner, answered by tapping (typing is the optional Hard mode), with
// instant feedback after every question, a summary of every answer at the end,
// stars, a combo counter, a calendar of the days completed, and a saved place
// if you leave part-way. The same screens run Home's "Drill these".

const AREA_LABELS = {
  consonants: "Consonants",
  vowels: "Vowels",
  vocabulary: "Vocabulary",
  verbs: "Verbs",
  accents: "Accents",
  bible: "Bible in Context",
};
const LENGTH_HINT = { 5: "about 2 min", 10: "about 4 min", 15: "about 6 min" };

let state = null;
let rerender = null;
let keyHandler = null;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

function freshCurrent() {
  return { answer: null, typed: { answer: "" }, graded: null, hints: { hintsRevealed: 0 } };
}

function freshState() {
  const now = new Date();
  return {
    drill: null, // set by Home's "Drill these"
    step: "intro", // "intro" -> "question" -> "summary"
    settings: loadSettings(),
    questions: [],
    index: 0,
    results: [],
    combo: 0,
    bestCombo: 0,
    current: freshCurrent(),
    month: { y: now.getFullYear(), m: now.getMonth() },
    completion: null, // the day's entry, once this round is recorded
    recorded: false,
    yesterday: null,
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();
  rerender = () => render(content, sidebarExtra, navigate);
  const link = consumeDeepLink();
  if (link && link.type === "weak-drill" && Array.isArray(link.items) && link.items.length > 0) state.drill = link.items;

  keyHandler = (e) => onKey(e, navigate);
  document.addEventListener("keydown", keyHandler);
  rerender();
}

export function unmount() {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = null;
  state = null;
  rerender = null;
}

// ---------------------------------------------------------------------
// Keyboard: 1-4 pick an answer, Enter moves on
// ---------------------------------------------------------------------

function onKey(e, navigate) {
  if (!state || state.step !== "question" || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const q = state.questions[state.index];
  if (!q) return;
  if (/^[1-9]$/.test(e.key) && q.type === "mc" && !state.current.graded) {
    const i = Number(e.key) - 1;
    if (q.options[i] !== undefined) {
      e.preventDefault();
      answer(q, q.options[i]);
    }
  } else if (e.key === "Enter" && state.current.graded && tag !== "BUTTON") {
    e.preventDefault();
    next();
  }
}

// ---------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------

function render(content, sidebarExtra, navigate) {
  sidebarExtra.innerHTML = "";
  content.innerHTML = "";

  const wrap = el("div");
  wrap.innerHTML = `<h1 class="page-title">${state.drill ? "Weak-Spot Drill" : "Daily Challenge"}</h1><hr class="hr"/>`;
  content.appendChild(wrap);

  const body = el("div", "daily");
  content.appendChild(body);
  if (state.step === "intro") renderIntro(body, navigate);
  else if (state.step === "question") renderQuestion(body, navigate);
  else renderSummary(body, navigate);

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
  const homeBtn = el("button", "btn btn-secondary", "Return to Home Page");
  homeBtn.addEventListener("click", () => navigate("home"));
  content.appendChild(homeBtn);
}

// ---------------------------------------------------------------------
// Intro: settings, today's status, calendar
// ---------------------------------------------------------------------

function chipGroup(label, options, isSelected, onPick, { multi = false } = {}) {
  const wrap = el("div", "daily-setting");
  wrap.appendChild(el("div", "sidebar-label", label));
  const group = el("div", "choice-group");
  group.setAttribute("role", multi ? "group" : "radiogroup");
  group.setAttribute("aria-label", label);
  for (const [value, text, sub] of options) {
    const b = el("button", "choice-btn daily-chip" + (isSelected(value) ? " selected" : ""));
    b.type = "button";
    b.setAttribute(multi ? "aria-pressed" : "aria-checked", String(isSelected(value)));
    if (!multi) b.setAttribute("role", "radio");
    b.innerHTML = `${esc(text)}${sub ? `<span class="daily-chip-sub">${esc(sub)}</span>` : ""}`;
    b.addEventListener("click", () => onPick(value));
    group.appendChild(b);
  }
  wrap.appendChild(group);
  return wrap;
}

function toggleRow(label, description, checked, onChange) {
  const row = el("label", "daily-toggle");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  row.appendChild(cb);
  const text = el("span");
  text.innerHTML = `<b>${esc(label)}</b> <span class="caption">${esc(description)}</span>`;
  row.appendChild(text);
  return row;
}

function startRound(questions) {
  state.questions = questions;
  state.index = 0;
  state.results = [];
  state.combo = 0;
  state.bestCombo = 0;
  state.current = freshCurrent();
  state.completion = null;
  state.recorded = false;
  state.step = "question";
  rerender();
}

function renderIntro(container, navigate) {
  const S = state.settings;
  const persist = () => saveSettings(S);

  if (state.drill) {
    container.appendChild(
      Object.assign(el("div", "info-box"), {
        innerHTML: `<b>A short drill on the items you miss most</b><br>
          ${state.drill.length} item${state.drill.length === 1 ? "" : "s"} from your practice history. Answering here counts toward each item's own schedule, so getting them right moves them forward.`,
      })
    );
    container.appendChild(toggleRow("Hard mode", "type your answers instead of tapping", S.hard, (v) => { S.hard = v; persist(); }));
    container.appendChild(toggleRow("Sound", "soft tones for right and wrong answers", S.sound, (v) => { S.sound = v; persist(); }));
    const startDrill = el("button", "btn btn-block daily-start", "Start Drill");
    startDrill.addEventListener("click", () => {
      const questions = buildDrill(state.drill, S.hard);
      if (questions.length === 0) {
        container.appendChild(Object.assign(el("div", "alert alert-warning"), { textContent: "Those items are no longer available. Try the Daily Challenge instead." }));
        return;
      }
      startRound(questions);
    });
    container.appendChild(startDrill);
    return;
  }

  const log = loadLog();
  const today = new Date();
  const entry = getEntry(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`, log);
  const stats = getStats(today, log);

  // ---- Where you stand ----
  const status = el("div", "daily-status");
  if (entry) {
    status.innerHTML = `<div class="daily-status-main">✓ Today's challenge is done — ${entry.score}/${entry.total} <span class="daily-stars-inline" aria-label="${entry.stars} of 3 stars">${"★".repeat(entry.stars)}${"☆".repeat(3 - entry.stars)}</span></div>
      <div class="caption">Play another round any time for extra practice.</div>`;
  } else {
    status.innerHTML = `<div class="daily-status-main">Today's challenge is waiting</div>
      <div class="caption">A short round built from what you need most.</div>`;
  }
  const facts = [];
  if (stats.run > 0) facts.push(`🔥 ${stats.run}-day run`);
  if (stats.bestRun > 0) facts.push(`Best run ${stats.bestRun}`);
  facts.push(`${stats.days} ${stats.days === 1 ? "day" : "days"} completed`);
  status.appendChild(el("div", "caption daily-facts", facts.join(" · ")));
  container.appendChild(status);

  // ---- A round left half-finished ----
  const saved = loadInProgress(today);
  if (saved) {
    const card = el("div", "daily-resume");
    card.innerHTML = `<div><b>You have a round in progress</b><div class="caption">Question ${saved.index + 1} of ${saved.questions.length}</div></div>`;
    const buttons = el("div", "daily-resume-buttons");
    const resume = el("button", "btn", "Resume");
    resume.addEventListener("click", () => {
      state.settings = { ...state.settings, ...(saved.settings || {}) };
      state.questions = saved.questions;
      state.index = saved.index;
      state.results = saved.results || [];
      state.combo = saved.combo || 0;
      state.bestCombo = saved.bestCombo || 0;
      state.current = freshCurrent();
      state.step = "question";
      rerender();
    });
    const discard = el("button", "btn btn-outline", "Start over");
    discard.addEventListener("click", () => {
      clearInProgress();
      rerender();
    });
    buttons.append(resume, discard);
    card.appendChild(buttons);
    container.appendChild(card);
  }

  // ---- Settings ----
  const have = availableAreaIds();
  const settingsBox = el("div", "daily-settings");
  settingsBox.appendChild(
    chipGroup("Questions", LENGTHS.map((n) => [n, String(n), LENGTH_HINT[n]]), (v) => S.length === v, (v) => {
      S.length = v;
      persist();
      rerender();
    })
  );
  settingsBox.appendChild(
    chipGroup(
      "Include",
      have.map((id) => [id, AREA_LABELS[id]]),
      (v) => S.areas.includes(v),
      (v) => {
        const on = S.areas.includes(v);
        if (on && S.areas.filter((a) => have.includes(a)).length === 1) return; // keep at least one
        S.areas = on ? S.areas.filter((a) => a !== v) : [...S.areas, v];
        persist();
        rerender();
      },
      { multi: true }
    )
  );
  settingsBox.appendChild(
    toggleRow("Hard mode", "type your answers instead of tapping (verbs and Bible questions are always tap-to-select)", S.hard, (v) => {
      S.hard = v;
      persist();
    })
  );
  settingsBox.appendChild(toggleRow("Sound", "soft tones for right and wrong answers", S.sound, (v) => { S.sound = v; persist(); }));
  container.appendChild(settingsBox);

  const startBtn = el("button", "btn btn-block daily-start", entry ? "Play Another Round" : "Start Daily Challenge");
  startBtn.addEventListener("click", () => {
    clearInProgress();
    if (S.areas.includes("bible")) {
      // The Bible pages' data has to be fetched first.
      startBtn.disabled = true;
      startBtn.textContent = "Getting your questions…";
      prepareChallenge(S).then((settings) => {
        if (!state) return; // left the page meanwhile
        const qs = buildChallenge(settings);
        if (qs.length === 0) {
          startBtn.disabled = false;
          startBtn.textContent = "Start Daily Challenge";
          container.appendChild(Object.assign(el("div", "alert alert-warning"), { textContent: "Not enough study data to build a round right now." }));
          return;
        }
        startRound(qs);
      });
      return;
    }
    const questions = buildChallenge(S);
    if (questions.length === 0) {
      container.appendChild(Object.assign(el("div", "alert alert-warning"), { textContent: "Not enough study data to build a round right now." }));
      return;
    }
    startRound(questions);
  });
  container.appendChild(startBtn);

  container.appendChild(el("hr", "hr"));
  renderCalendar(container, log);
}

// ---- Calendar of completed days ----

function renderCalendar(container, log) {
  const { y, m } = state.month;
  const now = new Date();
  const box = el("div", "daily-calendar");
  const head = el("div", "daily-calendar-head");
  const prev = el("button", "btn btn-outline btn-sm", "‹");
  prev.type = "button";
  prev.setAttribute("aria-label", "Previous month");
  prev.addEventListener("click", () => {
    state.month = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
    rerender();
  });
  const nextBtn = el("button", "btn btn-outline btn-sm", "›");
  nextBtn.type = "button";
  nextBtn.setAttribute("aria-label", "Next month");
  nextBtn.disabled = y === now.getFullYear() && m === now.getMonth();
  nextBtn.addEventListener("click", () => {
    state.month = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 };
    rerender();
  });
  const title = el("h3", "", new Date(y, m, 1).toLocaleString(undefined, { month: "long", year: "numeric" }));
  head.append(prev, title, nextBtn);
  box.appendChild(head);

  const grid = el("div", "daily-calendar-grid");
  grid.setAttribute("role", "grid");
  for (const d of ["S", "M", "T", "W", "T", "F", "S"]) grid.appendChild(el("div", "daily-calendar-dow", d));
  for (const week of monthGrid(y, m, now, log)) {
    for (const cell of week) {
      if (!cell) {
        grid.appendChild(el("div", "daily-calendar-cell daily-calendar-empty"));
        continue;
      }
      const c = el("div", "daily-calendar-cell" + (cell.entry ? " done" : "") + (cell.isToday ? " today" : "") + (cell.isFuture ? " future" : ""));
      const label = cell.entry
        ? `${cell.date}: completed, ${cell.entry.score} of ${cell.entry.total}, ${cell.entry.stars} stars`
        : `${cell.date}${cell.isFuture ? "" : ": not completed"}`;
      c.setAttribute("aria-label", label);
      c.title = cell.entry ? `${cell.entry.score}/${cell.entry.total} · ${"★".repeat(cell.entry.stars)}` : "";
      c.innerHTML = `<span class="daily-calendar-day">${cell.day}</span>${cell.entry ? `<span class="daily-calendar-stars" aria-hidden="true">${"★".repeat(cell.entry.stars)}</span>` : ""}`;
      grid.appendChild(c);
    }
  }
  box.appendChild(grid);
  box.appendChild(el("div", "caption", "Each day you finish a challenge is filled in, with its stars."));
  container.appendChild(box);
}

// ---------------------------------------------------------------------
// A question
// ---------------------------------------------------------------------

function renderQuestion(container, navigate) {
  const total = state.questions.length;
  if (state.index >= total) {
    completeRound();
    state.step = "summary";
    return renderSummary(container, navigate);
  }
  const q = state.questions[state.index];
  const cur = state.current;

  // ---- Progress, combo, save & exit ----
  const bar = el("div", "daily-topbar");
  const progress = el("div", "progress-bar-outer");
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", String(total));
  progress.setAttribute("aria-valuenow", String(state.index));
  progress.innerHTML = `<div class="progress-bar-inner" style="width:${(state.index / total) * 100}%"></div>`;
  bar.appendChild(progress);
  const meta = el("div", "daily-meta");
  meta.appendChild(el("span", "caption", `Question ${state.index + 1} of ${total} · ${q.label}`));
  const right = el("span", "daily-meta-right");
  if (state.combo >= 2) right.appendChild(el("span", "daily-combo", `🔥 ${state.combo} in a row`));
  if (!state.drill) {
    const exit = el("button", "daily-link", "Save & exit");
    exit.type = "button";
    exit.addEventListener("click", () => navigate("home"));
    right.appendChild(exit);
  }
  meta.appendChild(right);
  bar.appendChild(meta);
  container.appendChild(bar);

  // ---- The prompt ----
  if (q.type === "match") renderMatchBody(container, q);
  else if (q.type === "bible") renderBibleBody(container, q);
  else {
    renderPromptFor(container, q);
    container.appendChild(el("hr", "hr"));
    if (q.type === "mc") renderMcOptions(container, q);
    else if (q.type === "typed") renderTypedInput(container, q);
    else renderParseInput(container, q);
  }

  // ---- Instant feedback ----
  if (cur.graded) renderFeedback(container, q);
}

// ---- A Bible in Context question: the verse with a word marked, and the page's answer boxes ----

function renderBibleBody(container, q) {
  const cur = state.current;
  const host = el("div", "daily-bible");
  const picked = cur.graded ? cur.answer || {} : (cur.picked ||= {});
  drawBibleQuestion(host, q.bq, {
    showAccents: getShowAccents(),
    picked,
    graded: !!cur.graded,
    onPick: (pi, id) => {
      picked[pi] = id;
      if (q.bq.parts.every((_, k) => picked[k] !== undefined)) answer(q, { ...picked });
    },
  });
  container.appendChild(host);
}

function renderPromptFor(container, q) {
  const row = getRow(q.areaId, q.key);
  if (!row) return container.appendChild(el("div", "alert alert-warning", "That item is no longer available."));
  if (q.type === "parse") {
    const d = el("div", "hebrew-display");
    d.innerHTML = `<span lang="he" dir="rtl">${esc(row.Conjugation)}</span>`;
    container.appendChild(d);
    return;
  }
  if (q.areaId === "vocabulary") return renderVocabPrompt(container, row, q.direction);
  if (q.areaId === "accents") return renderAccentPrompt(container, row, q.direction === "name" ? "names" : "symbol");
  renderLetterPrompt(container, getLetterSet(q.areaId), row, q.direction === "name" ? "names" : "symbol", { showSharedNote: q.type === "mc" });
}

// ---- Tap to answer ----

function renderMcOptions(container, q) {
  const cur = state.current;
  const group = el("div", "daily-options");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Answer choices. Press 1 to 4 to choose.");
  q.options.forEach((opt, i) => {
    const b = el("button", "daily-option");
    b.type = "button";
    const hebrew = /[\u0590-\u05FF]/.test(opt);
    // A single letter or vowel mark needs a much bigger size than a word to be easy to see.
    const glyph = hebrew && [...opt].length <= 4;
    b.innerHTML = `<span class="daily-option-num" aria-hidden="true">${i + 1}</span>
      <span class="daily-option-text${hebrew ? " daily-option-hebrew" : ""}${glyph ? " daily-option-glyph" : ""}">${wrapHebrewSpans(opt)}</span>
      <span class="daily-option-mark" aria-hidden="true"></span>`;
    if (cur.graded) {
      b.disabled = true;
      const isAnswer = opt === q.answer;
      const isMine = opt === cur.answer;
      if (isAnswer) {
        b.classList.add("is-correct");
        b.querySelector(".daily-option-mark").textContent = "✓";
        b.insertAdjacentHTML("beforeend", `<span class="sr-only"> Correct answer</span>`);
      } else if (isMine) {
        b.classList.add("is-wrong");
        b.querySelector(".daily-option-mark").textContent = "✗";
        b.insertAdjacentHTML("beforeend", `<span class="sr-only"> Your answer, incorrect</span>`);
      }
    } else {
      b.addEventListener("click", () => answer(q, opt));
    }
    group.appendChild(b);
  });
  container.appendChild(group);
}

// ---- Typed (Hard mode) ----

function renderTypedInput(container, q) {
  const cur = state.current;
  const row = getRow(q.areaId, q.key);
  const wrap = el("div", "daily-typed");
  const submit = () => {
    if (!cur.graded) answer(q, cur.typed.answer);
  };
  const opts = { userState: cur.typed, checked: false, onEnter: submit, autofocus: !cur.graded };
  if (q.areaId === "vocabulary") renderVocabAnswerInput(wrap, { direction: q.direction, word: row, ...opts });
  else if (q.direction === "form") renderNameInput(wrap, { label: "Name", ...opts });
  else if (q.areaId === "accents") renderAccentAnswerInput(wrap, { word: row, ...opts });
  else renderLetterAnswerInput(wrap, { set: getLetterSet(q.areaId), row, ...opts });
  container.appendChild(wrap);
  if (cur.graded) {
    wrap.querySelectorAll("input, button, select").forEach((x) => (x.disabled = true));
  } else {
    const row2 = el("div", "button-row");
    const check = el("button", "btn", "Check Answer");
    check.addEventListener("click", submit);
    row2.appendChild(check);
    container.appendChild(row2);
  }
}

// ---- Verb parsing: tap each part ----

function renderParseInput(container, q) {
  const cur = state.current;
  const row = getRow(q.areaId, q.key);
  const options = parseOptions();
  if (row && !cur.graded) {
    const hints = computeAmbiguityHints(row, verbSiblings(row));
    renderHintPanel(container, hints, cur.hints);
  }
  const answers = cur.answer || {};
  const best = cur.graded ? bestTuple(q, answers) : null;
  for (const field of PARSE_FIELDS) {
    const wrap = el("div", "field-group");
    const idx = PARSE_FIELDS.indexOf(field);
    let cls = "";
    if (best) {
      const mine = answers[field] === "NA" ? "" : answers[field] || "";
      cls = (best[idx] || "") === mine ? " pill-good" : " pill-warn";
    }
    wrap.appendChild(el("div", "field-label" + cls, field));
    const group = el("div", "choice-group");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", field);
    for (const o of options[field]) {
      const b = el("button", "choice-btn daily-parse-btn" + (answers[field] === o ? " selected" : ""), o);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(answers[field] === o));
      if (cur.graded) b.disabled = true;
      else
        b.addEventListener("click", () => {
          cur.answer = { ...(cur.answer || {}), [field]: o };
          rerender();
        });
      group.appendChild(b);
    }
    wrap.appendChild(group);
    container.appendChild(wrap);
  }
  if (!cur.graded) {
    const row2 = el("div", "button-row");
    const check = el("button", "btn", "Check Answer");
    check.addEventListener("click", () => answer(q, state.current.answer || {}));
    row2.appendChild(check);
    container.appendChild(row2);
  }
}

/** The correct parsing closest to what was chosen (to colour each part). */
function bestTuple(q, answers) {
  let best = q.tuples[0];
  let bestN = -1;
  for (const t of q.tuples) {
    const n = PARSE_FIELDS.reduce((c, f, i) => c + ((t[i] || "") === (answers[f] === "NA" ? "" : answers[f] || "") ? 1 : 0), 0);
    if (n > bestN) {
      bestN = n;
      best = t;
    }
  }
  return best;
}

function renderHintPanel(container, hints, hintState) {
  if (!hints || hints.length === 0) return;
  const panel = el("div", "hint-panel");
  panel.appendChild(el("div", "hint-badge", "This exact form fits more than one parsing for many verbs — any correct parsing counts."));
  const revealed = hints.slice(0, hintState.hintsRevealed);
  if (revealed.length) {
    const list = el("ul", "hint-list");
    for (const h of revealed) list.appendChild(el("li", "", h.text));
    panel.appendChild(list);
  }
  if (hintState.hintsRevealed < hints.length) {
    const btn = el("button", "btn btn-outline btn-sm", hintState.hintsRevealed === 0 ? "Show Hint" : "Show Another Hint");
    btn.type = "button";
    btn.addEventListener("click", () => {
      hintState.hintsRevealed += 1;
      rerender();
    });
    panel.appendChild(btn);
  }
  container.appendChild(panel);
}

// ---- Match to category ----

function renderMatchBody(container, q) {
  const cur = state.current;
  const chosen = cur.answer || {};
  const intro = el("div", "daily-match-intro");
  intro.innerHTML = `<div class="daily-match-title">Match each one to its category</div>
    <div class="caption">Tap a category for every item, then check.</div>`;
  container.appendChild(intro);

  const list = el("div", "daily-match-list");
  const result = cur.graded ? cur.graded.items : null;
  q.items.forEach((it) => {
    const row = el("div", "daily-match-row");
    const mine = result && result.find((r) => r.key === it.key);
    const itemEl = el("div", "daily-match-item");
    itemEl.innerHTML = `<span class="daily-match-glyph" lang="he" dir="rtl">${esc(it.glyph)}</span><span class="daily-match-text">${esc(it.text)}</span>${
      mine ? `<span class="daily-match-mark ${mine.ok ? "ok" : "bad"}" aria-hidden="true">${mine.ok ? "✓" : "✗"}</span><span class="sr-only">${mine.ok ? "Correct" : "Incorrect"}</span>` : ""
    }`;
    row.appendChild(itemEl);
    const group = el("div", "choice-group");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", `Category for ${it.text}`);
    for (const b of q.buckets) {
      const btn = el("button", "choice-btn daily-match-btn" + (chosen[it.key] === b ? " selected" : ""), b);
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", String(chosen[it.key] === b));
      if (cur.graded) {
        btn.disabled = true;
        if (b === it.bucket) btn.classList.add("is-correct");
        else if (chosen[it.key] === b) btn.classList.add("is-wrong");
      } else
        btn.addEventListener("click", () => {
          cur.answer = { ...(cur.answer || {}), [it.key]: b };
          rerender();
        });
      group.appendChild(btn);
    }
    row.appendChild(group);
    list.appendChild(row);
  });
  container.appendChild(list);

  if (!cur.graded) {
    const row2 = el("div", "button-row");
    const check = el("button", "btn", "Check Answers");
    const done = q.items.every((it) => chosen[it.key]);
    check.disabled = !done;
    check.addEventListener("click", () => answer(q, state.current.answer || {}));
    row2.appendChild(check);
    container.appendChild(row2);
  }
}

// ---- Feedback and moving on ----

function renderFeedback(container, q) {
  const g = state.current.graded;
  const box = el("div", "daily-feedback " + (g.correct ? "ok" : "bad"));
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  const head = el("div", "daily-feedback-head");
  head.innerHTML = `<span class="daily-feedback-icon" aria-hidden="true">${g.correct ? "✓" : "✗"}</span><strong>${
    g.correct ? (state.combo >= 3 ? `Correct! ${state.combo} in a row` : "Correct!") : "Not quite"
  }</strong>`;
  box.appendChild(head);
  if (!g.correct) {
    const line = el("div", "daily-feedback-answer");
    if (q.type === "match") {
      const wrong = g.items.filter((i) => !i.ok).map((i) => `${i.text} → ${i.bucket}`);
      line.innerHTML = `<span class="caption">Should be:</span> ${wrong.map(esc).join("; ")}`;
    } else {
      line.innerHTML = `<span class="caption">${q.type === "parse" ? "The parsing:" : "The answer:"}</span> ${wrapHebrewSpans(g.correctText)}`;
      if (q.type === "typed" || q.type === "mc") line.innerHTML += ``;
    }
    box.appendChild(line);
  } else if (q.type === "parse" && q.tuples.length > 1) {
    box.appendChild(Object.assign(el("div", "caption"), { textContent: `This form can also be: ${g.correctText}` }));
  }
  if (q.type === "bible") {
    const why = el("div", "daily-feedback-answer");
    why.innerHTML = q.bq.explainHtml;
    box.appendChild(why);
  }
  container.appendChild(box);

  const row = el("div", "button-row");
  const last = state.index === state.questions.length - 1;
  const nextBtn = el("button", "btn daily-next", last ? "See Results" : "Next Question");
  nextBtn.addEventListener("click", next);
  row.appendChild(nextBtn);
  container.appendChild(row);
  setTimeout(() => nextBtn.focus(), 0);
}

function answer(q, value) {
  if (!state || state.current.graded) return;
  const g = grade(q, value);
  state.current.answer = value;
  state.current.graded = g;
  recordResult(q, g);
  state.combo = g.correct ? state.combo + 1 : 0;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.results.push({
    type: q.type,
    label: q.label,
    prompt: q.promptText,
    correct: g.correct,
    yourText: g.yourText,
    correctText: g.correctText,
    items: g.items ? g.items.map((i) => ({ text: i.text, bucket: i.bucket, chosen: i.chosen, ok: i.ok })) : null,
  });
  if (state.settings.sound) (g.correct ? playCorrect : playWrong)();
  // The last answer completes the round on the spot (so leaving at the final
  // feedback screen can't lose the day); earlier answers save the place.
  if (state.index === state.questions.length - 1) {
    completeRound();
  } else if (!state.drill) {
    saveInProgress({
      settings: state.settings,
      questions: state.questions,
      index: state.index + 1,
      results: state.results,
      combo: state.combo,
      bestCombo: state.bestCombo,
    });
  }
  rerender();
}

function next() {
  if (!state || !state.current.graded) return;
  state.index += 1;
  state.current = freshCurrent();
  if (state.index >= state.questions.length) {
    completeRound();
    state.step = "summary";
    if (state.settings.sound) playFinish();
  }
  rerender();
}

/** The round is over: record the day (a real daily round, not a drill). Safe to call twice. */
function completeRound() {
  if (state.recorded) return;
  state.recorded = true;
  {
    // A good round (or drill) earns a flourish in the student's chosen style.
    const done = state.results.length;
    const right = state.results.filter((r) => r.correct).length;
    const kind = celebrationForPercent(done ? Math.round((right / done) * 100) : 0);
    if (kind) celebrate(kind);
  }
  if (state.drill) return;
  const score = state.results.filter((r) => r.correct).length;
  state.yesterday = getYesterday();
  state.completion = recordCompletion({ score, total: state.results.length, hard: state.settings.hard, length: state.questions.length });
  clearInProgress();
}

// ---------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------

function renderSummary(container, navigate) {
  const total = state.results.length;
  const score = state.results.filter((r) => r.correct).length;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const stars = starsFor(percent);

  const hero = el("div", "daily-hero");
  hero.innerHTML = `
    <div class="daily-stars" role="img" aria-label="${stars} of 3 stars">
      ${[1, 2, 3].map((n) => `<span class="daily-star ${n <= stars ? "on" : "off"}" style="--i:${n}">★</span>`).join("")}
    </div>
    <h2 class="daily-hero-title">${percent === 100 ? "Perfect round!" : percent >= 70 ? "Nice work!" : "Good effort — keep going!"}</h2>
    <div class="daily-hero-score">${score} / ${total} <span class="caption">(${percent}%)</span></div>
    <p class="encourage-line encourage-${resultMessage(percent, percent).tone}">${esc(resultMessage(percent, percent).text)}</p>
    <div class="daily-hero-chips">
      ${state.settings.hard ? `<span class="pill pill-warn">Hard mode</span>` : ""}
      ${state.bestCombo >= 2 ? `<span class="pill pill-good">🔥 Best streak: ${state.bestCombo} in a row</span>` : ""}
    </div>`;
  container.appendChild(hero);

  // ---- Compared with yesterday, and the run ----
  if (!state.drill) {
    const y = state.yesterday;
    const lines = [];
    if (y) {
      const diff = percent - y.percent;
      const arrow = diff > 0 ? `▲ up ${diff} points today` : diff < 0 ? `▼ down ${-diff} points today` : "the same score today";
      lines.push(`Yesterday: ${y.score}/${y.total} (${y.percent}%) — ${arrow}.`);
    } else {
      lines.push("This is your first challenge on record — come back tomorrow to see how you compare.");
    }
    const stats = getStats();
    if (stats.run >= 2) lines.push(`🔥 That's ${stats.run} days in a row.`);
    container.appendChild(Object.assign(el("div", "daily-compare"), { innerHTML: lines.map((l) => `<div>${esc(l)}</div>`).join("") }));
  }

  // ---- Every question, what you chose, and the right answer ----
  container.appendChild(el("h3", "", "Your answers"));
  const list = el("ol", "daily-review");
  state.results.forEach((r) => {
    const li = el("li", "daily-review-item " + (r.correct ? "ok" : "bad"));
    const head = `<div class="daily-review-head"><span class="daily-review-mark" aria-hidden="true">${r.correct ? "✓" : "✗"}</span>
      <span class="sr-only">${r.correct ? "Correct." : "Incorrect."}</span>
      <span class="caption">${esc(r.label)}</span></div>`;
    let body;
    if (r.items) {
      body = `<div class="daily-review-prompt">${esc(r.prompt)}</div><ul class="daily-review-matches">${r.items
        .map(
          (i) =>
            `<li class="${i.ok ? "ok" : "bad"}"><span aria-hidden="true">${i.ok ? "✓" : "✗"}</span> ${esc(i.text)} → ${
              i.ok ? `<b>${esc(i.bucket)}</b>` : `<s>${esc(i.chosen || "—")}</s> <b>${esc(i.bucket)}</b>`
            }</li>`
        )
        .join("")}</ul>`;
    } else {
      body = `<div class="daily-review-prompt">${wrapHebrewSpans(r.prompt || "")}</div>
        <div class="daily-review-answers">
          ${r.correct ? "" : `<div><span class="caption">You chose:</span> ${wrapHebrewSpans(r.yourText)}</div>`}
          <div><span class="caption">${r.correct ? "Answer:" : "Correct answer:"}</span> <b>${wrapHebrewSpans(r.correctText)}</b></div>
        </div>`;
    }
    li.innerHTML = head + body;
    list.appendChild(li);
  });
  container.appendChild(list);

  container.appendChild(el("hr", "hr"));
  const again = el("button", "btn btn-block", state.drill ? "Start a Daily Challenge" : "Play Another Round");
  again.addEventListener("click", () => {
    const keep = state.settings;
    state = freshState();
    state.settings = keep;
    rerender();
  });
  container.appendChild(again);

  if (!state.drill) {
    container.appendChild(el("hr", "hr"));
    renderCalendar(container, loadLog());
  }
}
