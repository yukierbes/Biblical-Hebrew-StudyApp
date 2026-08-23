import { getVocabRows } from "../vocab-data.js";
import { vocabRowKey } from "../vocab-overrides.js";
import { getAccentRows } from "../accent-data.js";
import { accentRowKey } from "../accent-filters.js";
import { sortByPriority, recordItemResult, recordStreakActivity } from "../srs.js";
import { sampleN, wrapHebrewSpans } from "../helpers.js";
import {
  isAnswerCorrect as isVocabAnswerCorrect,
  renderPrompt as renderVocabPrompt,
  renderAnswerInput as renderVocabAnswerInput,
  primaryAnswerText,
} from "../vocab-answer-matching.js";
import {
  isAccentAnswerCorrect,
  renderAccentPrompt,
  renderAccentAnswerInput,
  primaryAccentAnswerText,
} from "../accent-answer-matching.js";

const VOCAB_COUNT = 7;
const ACCENT_COUNT = 5;

let state = null;
let rerender = null;

/** Builds today's mixed question set: the most due/weak Vocabulary and
 * Accents words, interleaved. Each item's prompt direction is chosen
 * at random for variety — the underlying due-ness comes from a fixed
 * reference mode per dataset (vocab-typing-hebrew / accent-typing-names)
 * as a practical proxy, since a word can be "due" differently per
 * direction; answers are still recorded back to whichever direction
 * was actually shown, so real practice still feeds the right schedule. */
function buildQuestions() {
  const vocabRows = getVocabRows();
  const accentRows = getAccentRows();

  const vocabPicks = sortByPriority("vocab-typing-hebrew", vocabRows, vocabRowKey).slice(0, VOCAB_COUNT);
  const accentPicks = sortByPriority("accent-typing-names", accentRows, accentRowKey).slice(0, ACCENT_COUNT);

  const vocabQuestions = vocabPicks.map((row) => ({
    kind: "vocab",
    row,
    direction: Math.random() < 0.5 ? "hebrew" : "english",
  }));
  const accentQuestions = accentPicks.map((row) => ({
    kind: "accent",
    row,
    promptWith: Math.random() < 0.5 ? "names" : "symbol",
  }));

  return sampleN([...vocabQuestions, ...accentQuestions], vocabQuestions.length + accentQuestions.length, false);
}

function freshState() {
  return {
    step: "intro", // "intro" -> "question" -> "summary"
    questions: [],
    index: 0,
    results: [],
    userAnswer: { answer: "" },
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();
  rerender = () => render(content, sidebarExtra, navigate);
  rerender();
}

export function unmount() {
  state = null;
  rerender = null;
}

function srsModeFor(q) {
  return q.kind === "vocab" ? "vocab-typing-" + q.direction : "accent-typing-" + q.promptWith;
}

function isCorrectFor(q, answer) {
  return q.kind === "vocab" ? isVocabAnswerCorrect(q.direction, q.row, answer) : isAccentAnswerCorrect(q.row, answer);
}

function correctTextFor(q) {
  return q.kind === "vocab" ? primaryAnswerText(q.row, q.direction) : primaryAccentAnswerText(q.row);
}

function labelFor(q) {
  if (q.kind === "vocab") return q.direction === "hebrew" ? "Vocabulary: Hebrew → English" : "Vocabulary: English → Hebrew";
  return q.promptWith === "names" ? "Accents: Name → Symbol" : "Accents: Symbol → Symbol";
}

function render(content, sidebarExtra, navigate) {
  // Preserve the sidebar's scroll position across a filter change — every
  // checkbox toggle calls this same render() to rebuild the whole panel
  // (so derived bits like "Select all"/"Clear all" and dependent option
  // lists stay in sync), which would otherwise reset scroll to the top
  // each time and make picking several boxes in a row from a scrolled-down
  // section (e.g. several lessons) annoying. rAF runs after this
  // function finishes rebuilding the DOM below, so the restore sticks.
  // The panel that actually scrolls is the outer #sidebar element (see
  // css/style.css), not sidebarExtra itself — sidebarExtra is just one
  // inner section of it, alongside Navigation/Account/Progress/etc.
  const __scrollContainer = sidebarExtra.closest("#sidebar") || sidebarExtra;
  const __sidebarScrollTop = __scrollContainer.scrollTop;
  // Each individual checkbox list (Lesson/POS/Category/Root/etc., a
  // separately-scrollable box — see .checkbox-list in css/style.css) is
  // also torn down and rebuilt as a brand-new element by renderCheckboxList
  // every time any box anywhere changes, so it needs its own scroll
  // restored too, in addition to the outer panel above. Matched up by
  // position, since every page here renders its lists in the same fixed
  // order every time.
  const __checklistScrollTops = [...sidebarExtra.querySelectorAll(".checkbox-list")].map(
    (el) => el.scrollTop
  );
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    __scrollContainer.scrollTop = __sidebarScrollTop;
    const newLists = sidebarExtra.querySelectorAll(".checkbox-list");
    newLists.forEach((el, i) => {
      if (__checklistScrollTops[i] != null) el.scrollTop = __checklistScrollTops[i];
    });
  });
  content.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.innerHTML = `<h1 class="page-title">Daily Challenge</h1><hr class="hr"/>`;
  content.appendChild(wrap);

  const body = document.createElement("div");
  content.appendChild(body);

  if (state.step === "intro") renderIntro(body);
  else if (state.step === "question") renderQuestion(body);
  else renderSummary(body);

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => navigate("home"));
  content.appendChild(homeBtn);
}

function renderIntro(container) {
  const vocabRows = getVocabRows();
  const accentRows = getAccentRows();
  const hasContent = vocabRows.length > 0 || accentRows.length > 0;

  container.innerHTML = `
    <div class="info-box">
      <b>A quick mixed round</b><br>
      A short quiz pulling from whatever's due or weak across Vocabulary and Accents Typing right now —
      answering here counts toward each item's own schedule too, so it's not separate progress.
    </div>
  `;

  if (!hasContent) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No Vocabulary or Accents data available.";
    container.appendChild(div);
    return;
  }

  const startBtn = document.createElement("button");
  startBtn.className = "btn btn-block";
  startBtn.textContent = "Start Daily Challenge";
  startBtn.addEventListener("click", () => {
    const questions = buildQuestions();
    if (questions.length === 0) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = "Not enough Vocabulary or Accents data to build a round right now.";
      container.appendChild(div);
      return;
    }
    state.questions = questions;
    state.index = 0;
    state.results = [];
    state.userAnswer = { answer: "" };
    state.step = "question";
    rerender();
  });
  container.appendChild(startBtn);
}

function renderQuestion(container) {
  const total = state.questions.length;
  if (state.index >= total) {
    state.step = "summary";
    renderSummary(container);
    return;
  }
  const q = state.questions[state.index];

  const progress = document.createElement("div");
  progress.className = "progress-bar-outer";
  progress.innerHTML = `<div class="progress-bar-inner" style="width:${(state.index / total) * 100}%"></div>`;
  container.appendChild(progress);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = `Question ${state.index + 1} of ${total} · ${labelFor(q)}`;
  container.appendChild(caption);

  if (q.kind === "vocab") renderVocabPrompt(container, q.row, q.direction);
  else renderAccentPrompt(container, q.row, q.promptWith);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  if (q.kind === "vocab") {
    renderVocabAnswerInput(inputsWrap, {
      direction: q.direction,
      word: q.row,
      userState: state.userAnswer,
      checked: false,
      autofocus: true,
    });
  } else {
    renderAccentAnswerInput(inputsWrap, { word: q.row, userState: state.userAnswer, checked: false });
  }
  container.appendChild(inputsWrap);

  const navRow = document.createElement("div");
  navRow.className = "button-row";
  const nextBtn = document.createElement("button");
  nextBtn.className = "btn";
  nextBtn.textContent = state.index === total - 1 ? "Finish" : "Next Question";
  nextBtn.addEventListener("click", () => {
    const ok = isCorrectFor(q, state.userAnswer.answer);
    const key = q.kind === "vocab" ? vocabRowKey(q.row) : accentRowKey(q.row);
    recordItemResult(srsModeFor(q), key, ok);
    recordStreakActivity();
    state.results.push({
      Prompt: labelFor(q),
      Item: q.kind === "vocab" ? q.row.Hebrew : q.row.HebrewName,
      "Correct Answer": correctTextFor(q),
      "Your Answer": state.userAnswer.answer || "NA",
      Correct: ok,
    });
    state.index += 1;
    state.userAnswer = { answer: "" };
    rerender();
  });
  navRow.appendChild(nextBtn);
  container.appendChild(navRow);
}

function renderSummary(container) {
  const total = state.results.length;
  const correct = state.results.filter((r) => r.Correct).length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  container.innerHTML = `<h2>Nice work!</h2>`;
  const scoreEl = document.createElement("h3");
  scoreEl.textContent = `Score: ${correct} / ${total} (${percent}%)`;
  container.appendChild(scoreEl);
  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const list = document.createElement("div");
  for (const r of state.results) {
    const row = document.createElement("div");
    row.className = "caption";
    row.style.padding = "6px 0";
    row.style.borderBottom = "1px solid var(--hairline)";
    row.innerHTML = `
      <span class="pill ${r.Correct ? "pill-good" : "pill-bad"}">${r.Correct ? "✓" : "✗"}</span>
      ${r.Prompt} — ${wrapHebrewSpans(r.Item || "")} →
      ${r.Correct ? "" : `<b>${wrapHebrewSpans(r["Correct Answer"] || "")}</b> (you: ${escapeCaption(r["Your Answer"])})`}
    `;
    list.appendChild(row);
  }
  container.appendChild(list);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
  const againBtn = document.createElement("button");
  againBtn.className = "btn btn-block";
  againBtn.textContent = "Do Another Round";
  againBtn.addEventListener("click", () => {
    state = freshState();
    rerender();
  });
  container.appendChild(againBtn);
}

function escapeCaption(s) {
  return (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
