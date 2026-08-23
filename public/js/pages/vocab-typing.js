import { getVocabRows, getLessonOrder, getPosOrder } from "../vocab-data.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { wrapHebrewSpans, sampleN, downloadCSV, downloadXLSX } from "../helpers.js";
import { renderTable } from "../table.js";
import { recordAttempt } from "../history.js";
import { renderHistoryPanel } from "../history-ui.js";
import { recordStreakActivity, pickAdaptive, recordItemResult, getMasteryStats } from "../srs.js";
import { applyVocabFilters, getCategoryOptions, getCategoriesForRow } from "../vocab-overrides.js";
import { getRootOptions, applyRootFilter } from "../vocab-roots.js";
import { consumeDeepLink } from "../deep-link.js";
import {
  isAnswerCorrect,
  renderPrompt,
  renderAnswerInput,
  renderRevealedAnswer,
} from "../vocab-answer-matching.js";

let state = null;
let rerender = null;

function freshState() {
  return {
    filters: { Lesson: [], POS: [], Category: [], Root: [] },
    minFrequency: "",
    mode: "practice", // "practice" | "quiz"
    promptSide: "hebrew", // "hebrew" -> shown Hebrew, type English. "english" -> shown English, type Hebrew.
    practice: {
      word: null,
      userAnswer: "",
      checked: false,
      showAnswer: false,
      genWarning: false,
      hintLevel: 0, // 0 = no hint, 1 = Lesson shown, 2 = Lesson + POS shown
    },
    quiz: freshQuizState(),
  };
}

function freshQuizState() {
  return {
    step: "filters", // "filters" -> "length" -> "question" -> "summary"
    active: false,
    useFilters: true,
    lockedPool: null,
    pendingLength: null,
    questions: [],
    index: 0,
    results: [],
    userAnswers: { answer: "" },
    historyRecorded: false,
    isRetry: false,
    filterWarning: false,
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();
  rerender = () => render(content, sidebarExtra, navigate);

  const link = consumeDeepLink();
  if (link && link.type === "vocab-typing-focus") {
    if (link.direction === "hebrew" || link.direction === "english") state.promptSide = link.direction;
    if (link.mode === "quiz") state.mode = "quiz";
  }

  rerender();
}

export function unmount() {
  state = null;
  rerender = null;
}

// ================= Filtering (shared, override-aware — same as the
// other Vocabulary pages) =================

/** Stable identity for a vocab row (there's no explicit id column). */
function vocabKey(row) {
  return [row.Lesson, row.Hebrew, row.English].join("||");
}

// ================= Hints (Practice mode only) =================

/**
 * Practice-mode-only "Get Hint" button. First press reveals the Lesson,
 * second press additionally reveals the Part of Speech, third press
 * additionally reveals the Category — only when the word actually has
 * one, since many rows have a blank Category. Not used in Quiz mode,
 * which shows no extra info at all.
 */
function renderHintArea(container, word) {
  const p = state.practice;
  const categories = getCategoriesForRow(word);
  const hasCategory = categories.length > 0;
  const maxLevel = hasCategory ? 3 : 2;

  const hintWrap = document.createElement("div");
  hintWrap.style.textAlign = "center";
  hintWrap.style.marginBottom = "10px";

  const hintBtn = document.createElement("button");
  hintBtn.type = "button";
  hintBtn.className = "btn btn-outline btn-sm";
  hintBtn.textContent = p.hintLevel >= maxLevel ? "No More Hints" : "Get Hint";
  hintBtn.disabled = p.hintLevel >= maxLevel;
  hintBtn.addEventListener("click", () => {
    p.hintLevel = Math.min(maxLevel, p.hintLevel + 1);
    rerender();
  });
  hintWrap.appendChild(hintBtn);

  if (p.hintLevel >= 1) {
    const hintText = document.createElement("div");
    hintText.className = "caption";
    hintText.style.marginTop = "6px";
    const parts = [];
    if (word.Lesson) parts.push(`Lesson: ${word.Lesson}`);
    if (p.hintLevel >= 2 && word.POS) parts.push(`Part of Speech: ${word.POS}`);
    if (p.hintLevel >= 3 && hasCategory) parts.push(`Category: ${categories.join(", ")}`);
    hintText.textContent = parts.join(" · ");
    hintWrap.appendChild(hintText);
  }

  container.appendChild(hintWrap);
}

function colorCell(rawValue, isCorrect, hebrew) {
  if (rawValue === "NA") return `<span class="pill pill-warn">NA</span>`;
  const display = hebrew ? wrapHebrewSpans(rawValue) : rawValue;
  return `<span class="pill ${isCorrect ? "pill-good" : "pill-bad"}">${display}</span>`;
}

// ================= Practice mode =================

function srsMode() {
  return "vocab-typing-" + state.promptSide;
}

function renderPractice(container, pool) {
  const p = state.practice;
  const directionLabel = state.promptSide === "hebrew" ? "English" : "Hebrew";
  const stats = getMasteryStats(srsMode(), pool, vocabKey);

  container.innerHTML = `
    <h3>Vocabulary Typing Practice</h3>
    <div class="info-box">
      <b>Instructions</b><br>
      Click <i>Generate a Word</i> for a prompt, then type the ${directionLabel} for it.<br>
      Words you get right come back less often; words you miss come back sooner — <i>Generate a Word</i> adapts to what you're still learning.<br>
      Stuck? Click <i>Get Hint</i> to reveal the Lesson, then Part of Speech, then Category (if the word has one).<br>
      Hebrew answers: matching just one accepted spelling is fine — you don't need to enter every one.<br>
      English answers: list a few of the accepted words/phrases (comma-separated) — you don't need every synonym listed.<br>
      Click <i>Check Answer</i> for feedback and try again, or <i>Show Answer</i> to reveal it.
    </div>
  `;

  const statsCaption = document.createElement("div");
  statsCaption.className = "caption";
  statsCaption.style.marginBottom = "10px";
  statsCaption.textContent = `In this filtered set: ${stats.newCount} new · ${stats.learning} learning · ${stats.mastered} mastered (of ${stats.total})`;
  container.appendChild(statsCaption);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const genBtn = document.createElement("button");
  genBtn.className = "btn btn-block";
  genBtn.textContent = "Generate a Word";
  genBtn.addEventListener("click", () => {
    if (pool.length === 0) {
      p.genWarning = true;
      rerender();
      return;
    }
    p.genWarning = false;
    p.word = pickAdaptive(srsMode(), pool, vocabKey);
    p.showAnswer = false;
    p.userAnswer = "";
    p.checked = false;
    p.hintLevel = 0;
    rerender();
  });
  container.appendChild(genBtn);

  if (p.genWarning) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No vocabulary matches the selected filters.";
    container.appendChild(div);
  }

  if (!p.word) return;

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  renderPrompt(container, p.word, state.promptSide);
  renderHintArea(container, p.word);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  const userState = { answer: p.userAnswer };
  renderAnswerInput(inputsWrap, {
    direction: state.promptSide,
    word: p.word,
    userState,
    checked: p.checked,
  });
  container.appendChild(inputsWrap);

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const checkBtn = document.createElement("button");
  checkBtn.className = "btn";
  checkBtn.textContent = "Check Answer";
  checkBtn.addEventListener("click", () => {
    p.userAnswer = userState.answer;
    p.checked = true;
    const ok = isAnswerCorrect(state.promptSide, p.word, userState.answer);
    recordItemResult(srsMode(), vocabKey(p.word), ok);
    recordStreakActivity();
    rerender();
  });

  const showBtn = document.createElement("button");
  showBtn.className = "btn";
  showBtn.textContent = "Show Answer";
  showBtn.addEventListener("click", () => {
    p.userAnswer = userState.answer;
    p.showAnswer = true;
    rerender();
  });

  btnRow.appendChild(checkBtn);
  btnRow.appendChild(showBtn);
  container.appendChild(btnRow);

  if (p.showAnswer) {
    renderRevealedAnswer(container, p.word, state.promptSide);
  }
}

// ================= Quiz mode =================

function renderQuiz(container, allRows, poolFn) {
  const q = state.quiz;
  switch (q.step) {
    case "filters":
      renderQuizFilterStep(container, allRows, poolFn);
      break;
    case "length":
      renderQuizLengthStep(container);
      break;
    case "question":
      renderQuizQuestionStep(container);
      break;
    case "summary":
      renderQuizSummaryStep(container);
      break;
    default:
      q.step = "filters";
      rerender();
  }
}

function renderQuizFilterStep(container, allRows, poolFn) {
  const q = state.quiz;
  container.innerHTML = `<h3>Vocabulary Typing Quiz</h3><p>Do you want to use the current sidebar filters for this quiz?</p>`;

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const yesBtn = document.createElement("button");
  yesBtn.className = "btn";
  yesBtn.textContent = "Yes, use filters";
  yesBtn.addEventListener("click", () => startQuizFilters(allRows, poolFn, true));

  const noBtn = document.createElement("button");
  noBtn.className = "btn";
  noBtn.textContent = "No, use all vocabulary";
  noBtn.addEventListener("click", () => startQuizFilters(allRows, poolFn, false));

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  container.appendChild(btnRow);

  if (q.filterWarning) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No vocabulary matches the selected filters. Please adjust the filters before starting the quiz.";
    container.appendChild(div);
  }
}

function startQuizFilters(allRows, poolFn, useFilters) {
  const q = state.quiz;
  const working = useFilters ? poolFn() : allRows.slice();

  if (useFilters && working.length === 0) {
    q.filterWarning = true;
    rerender();
    return;
  }

  q.filterWarning = false;
  q.useFilters = useFilters;
  q.active = true;
  q.lockedPool = working;
  q.step = "length";
  rerender();
}

function renderQuizLengthStep(container) {
  const q = state.quiz;
  const max = q.lockedPool.length;
  const defaultN = Math.min(10, max);

  container.innerHTML = `<h3>How many questions?</h3>`;

  const input = document.createElement("input");
  input.type = "number";
  input.min = 1;
  input.max = max;
  input.value = q.pendingLength || defaultN;
  input.style.width = "120px";
  input.style.padding = "8px";
  input.addEventListener("input", () => {
    q.pendingLength = Math.max(1, Math.min(max, parseInt(input.value || "1", 10)));
  });
  container.appendChild(input);
  container.appendChild(document.createElement("br"));

  const startBtn = document.createElement("button");
  startBtn.className = "btn";
  startBtn.style.marginTop = "10px";
  startBtn.textContent = "Start Quiz";
  startBtn.addEventListener("click", () => {
    const n = q.pendingLength || defaultN;
    q.questions = sampleN(q.lockedPool, n, false);
    q.index = 0;
    q.results = [];
    q.userAnswers = { answer: "" };
    q.step = "question";
    rerender();
  });
  container.appendChild(startBtn);
}

function renderQuizQuestionStep(container) {
  const q = state.quiz;
  const total = q.questions.length;

  if (q.index >= total) {
    q.step = "summary";
    // Delegate directly rather than calling rerender() from inside an
    // active render pass (see parsing.js / construction.js for why).
    renderQuizSummaryStep(container);
    return;
  }

  const item = q.questions[q.index];

  const progress = document.createElement("div");
  progress.className = "progress-bar-outer";
  progress.innerHTML = `<div class="progress-bar-inner" style="width:${((q.index + 1) / total) * 100}%"></div>`;
  container.appendChild(progress);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = `Question ${q.index + 1} of ${total}`;
  container.appendChild(caption);

  renderPrompt(container, item, state.promptSide);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  renderAnswerInput(inputsWrap, {
    direction: state.promptSide,
    word: item,
    userState: q.userAnswers,
    checked: false, // no in-quiz feedback — everything is graded together at the end
  });
  container.appendChild(inputsWrap);

  const navRow = document.createElement("div");
  navRow.className = "button-row";

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn js-shortcut-next";
  nextBtn.textContent = "Next Question";
  nextBtn.addEventListener("click", () => {
    record(item, q.userAnswers.answer);
    q.index += 1;
    q.userAnswers = { answer: "" };
    rerender();
  });

  const endBtn = document.createElement("button");
  endBtn.className = "btn btn-secondary narrow";
  endBtn.textContent = "End Quiz";
  endBtn.addEventListener("click", () => {
    // Matches Construction/Parsing's End Quiz behavior: the current
    // question and all remaining ones are recorded as blank/unanswered.
    for (let i = q.index; i < total; i++) record(q.questions[i], "");
    q.index = total;
    q.step = "summary";
    rerender();
  });

  navRow.appendChild(nextBtn);
  navRow.appendChild(endBtn);
  container.appendChild(navRow);
}

function record(item, userAnswerValue) {
  const q = state.quiz;
  const userAnswer = (userAnswerValue || "").trim();
  const ok = isAnswerCorrect(state.promptSide, item, userAnswer);

  q.results.push({
    Lesson: item.Lesson ?? "",
    Hebrew: item.Hebrew ?? "",
    English: item.English ?? "",
    Prompt: state.promptSide === "hebrew" ? "Hebrew → English" : "English → Hebrew",
    "Your Answer": userAnswer || "NA",
    Correct: ok,
    Score: ok ? 1 : 0,
  });
  recordItemResult(srsMode(), vocabKey(item), ok);
  recordStreakActivity();
}

function renderQuizSummaryStep(container) {
  const q = state.quiz;

  container.innerHTML = `<h2>Quiz Summary</h2>`;

  const totalPoints = q.results.length;
  const earned = q.results.reduce((s, r) => s + r.Score, 0);
  const percent = totalPoints ? Math.round((earned / totalPoints) * 100) : 0;

  if (!q.historyRecorded) {
    recordAttempt("vocab-typing", {
      score: earned,
      total: totalPoints,
      percent,
      datasets: [state.promptSide === "hebrew" ? "Hebrew → English" : "English → Hebrew"],
      retry: q.isRetry,
    });
    q.historyRecorded = true;
  }

  const scoreEl = document.createElement("h3");
  scoreEl.textContent = `Score: ${earned} / ${totalPoints} (${percent}%)`;
  container.appendChild(scoreEl);
  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const columns = ["Lesson", "Hebrew", "English", "Prompt", "Your Answer", "Score"];
  const tableWrap = document.createElement("div");
  renderTable(tableWrap, q.results, {
    columns,
    cellRenderers: {
      Hebrew: (v) => wrapHebrewSpans(v),
      "Your Answer": (v, row) => colorCell(v, row.Correct, state.promptSide === "english"),
    },
  });
  container.appendChild(tableWrap);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const dlRow = document.createElement("div");
  dlRow.className = "button-row";

  const csvBtn = document.createElement("button");
  csvBtn.className = "btn";
  csvBtn.textContent = "Download CSV";
  csvBtn.addEventListener("click", () => downloadCSV(q.results, columns, "vocab_typing_quiz_results.csv"));

  const xlsxBtn = document.createElement("button");
  xlsxBtn.className = "btn";
  xlsxBtn.textContent = "Download Excel";
  xlsxBtn.addEventListener("click", () =>
    downloadXLSX(q.results, columns, "vocab_typing_quiz_results.xlsx", "Results")
  );

  dlRow.appendChild(csvBtn);
  dlRow.appendChild(xlsxBtn);
  container.appendChild(dlRow);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const missedIndices = q.results.map((r, i) => (r.Score < 1 ? i : -1)).filter((i) => i >= 0);

  if (missedIndices.length > 0) {
    const retryBtn = document.createElement("button");
    retryBtn.className = "btn btn-block";
    retryBtn.textContent = `Retry ${missedIndices.length} Missed Question${missedIndices.length > 1 ? "s" : ""}`;
    retryBtn.style.marginBottom = "10px";
    retryBtn.addEventListener("click", () => {
      const missedRows = missedIndices.map((i) => q.questions[i]);
      q.questions = missedRows;
      q.index = 0;
      q.results = [];
      q.userAnswers = { answer: "" };
      q.step = "question";
      q.historyRecorded = false;
      q.isRetry = true;
      rerender();
    });
    container.appendChild(retryBtn);
  }

  const againBtn = document.createElement("button");
  againBtn.className = "btn btn-block btn-secondary";
  againBtn.textContent = "Start a New Quiz";
  againBtn.addEventListener("click", () => {
    state.quiz = freshQuizState();
    rerender();
  });
  container.appendChild(againBtn);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
  renderHistoryPanel(container, "vocab-typing", { onClear: () => rerender() });
}

// ================= Page shell: mode/direction switches, sidebar, nav =================

function render(content, sidebarExtra, navigate) {
  // Preserve the sidebar's scroll position across a filter change — every
  // checkbox toggle calls this same render() to rebuild the whole panel
  // (so derived bits like "Select all"/"Clear all" and dependent option
  // lists stay in sync), which would otherwise reset scroll to the top
  // each time and make picking several boxes in a row from a scrolled-down
  // section (e.g. several lessons) annoying. rAF runs after this
  // function finishes rebuilding the DOM below, so the restore sticks.
  const __sidebarScrollTop = sidebarExtra.scrollTop;
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    sidebarExtra.scrollTop = __sidebarScrollTop;
  });
  content.innerHTML = "";

  const allRows = getVocabRows();
  const quizActive = state.quiz.active;

  if (!allRows.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No vocabulary data found.";
    content.appendChild(div);
    return;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `<h1 class="page-title">Vocabulary Typing</h1><hr class="hr"/>`;
  content.appendChild(wrap);

  // ---- Practice / Quiz mode switch ----
  const modeWrap = document.createElement("div");
  modeWrap.className = "radio-row";
  modeWrap.style.marginBottom = "14px";
  for (const m of ["Practice", "Quiz"]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "vocab-typing-mode";
    input.value = m;
    input.checked = state.mode === m.toLowerCase();
    input.disabled = quizActive && m === "Practice" && state.quiz.step !== "filters";
    input.addEventListener("change", () => {
      state.mode = m.toLowerCase();
      rerender();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + m));
    modeWrap.appendChild(label);
  }
  content.appendChild(modeWrap);

  // ---- Prompt direction switch ----
  const dirWrap = document.createElement("div");
  dirWrap.style.marginBottom = "16px";
  const dirLabel = document.createElement("div");
  dirLabel.className = "sidebar-label";
  dirLabel.style.marginBottom = "8px";
  dirLabel.textContent = "Prompt with:";
  dirWrap.appendChild(dirLabel);

  const dirGroup = document.createElement("div");
  dirGroup.className = "choice-group";
  const dirDisabled = quizActive && state.quiz.step !== "filters";
  for (const [value, label] of [
    ["hebrew", "Hebrew → type English"],
    ["english", "English → type Hebrew"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn" + (state.promptSide === value ? " selected" : "");
    btn.disabled = dirDisabled;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.promptSide = value;
      rerender();
    });
    dirGroup.appendChild(btn);
  }
  dirWrap.appendChild(dirGroup);
  content.appendChild(dirWrap);

  // ---- Sidebar filters (same as Vocabulary Review / Flashcards), hidden
  // during an active quiz — same as Verb Construction/Parsing locking
  // their filters once a quiz is underway. ----
  function pool() {
    return applyRootFilter(applyVocabFilters(allRows, state.filters, state.minFrequency), state.filters.Root);
  }

  if (!quizActive) {
    sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));

    const filterWrap = document.createElement("div");
    filterWrap.className = "sidebar-section";
    const filterTitle = document.createElement("h3");
    filterTitle.className = "sidebar-title";
    filterTitle.textContent = "Filters";
    filterWrap.appendChild(filterTitle);

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn btn-outline btn-block";
    resetBtn.textContent = "Reset Filters";
    resetBtn.style.marginBottom = "12px";
    resetBtn.addEventListener("click", () => {
      state.filters = { Lesson: [], POS: [], Category: [], Root: [] };
      state.minFrequency = "";
      rerender();
    });
    filterWrap.appendChild(resetBtn);

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "vocab-typing",
    getSnapshot: () => ({ filters: state.filters, minFrequency: state.minFrequency }),
    applySnapshot: (snap) => {
      state.filters = { Lesson: [], POS: [], Category: [], Root: [], ...snap.filters };
      state.minFrequency = snap.minFrequency || "";
      rerender();
    },
  });
  filterWrap.appendChild(presetDiv);


    const lessonDiv = document.createElement("div");
    lessonDiv.style.marginBottom = "14px";
    renderCheckboxList(lessonDiv, {
      label: "Lesson",
      options: getLessonOrder(),
      selected: state.filters.Lesson,
      onChange: (next) => {
        state.filters.Lesson = next;
        rerender();
      },
    });
    filterWrap.appendChild(lessonDiv);

    const posDiv = document.createElement("div");
    posDiv.style.marginBottom = "14px";
    renderCheckboxList(posDiv, {
      label: "Part of Speech",
      options: getPosOrder(),
      selected: state.filters.POS,
      onChange: (next) => {
        state.filters.POS = next;
        rerender();
      },
    });
    filterWrap.appendChild(posDiv);

    const categoryDiv = document.createElement("div");
    categoryDiv.style.marginBottom = "14px";
    renderCheckboxList(categoryDiv, {
      label: "Category",
      options: getCategoryOptions(),
      selected: state.filters.Category,
      onChange: (next) => {
        state.filters.Category = next;
        rerender();
      },
    });
    filterWrap.appendChild(categoryDiv);

    const rootDiv = document.createElement("div");
    rootDiv.style.marginBottom = "14px";
    renderCheckboxList(rootDiv, {
      label: "Root",
      options: getRootOptions(),
      selected: state.filters.Root,
      onChange: (next) => {
        state.filters.Root = next;
        rerender();
      },
    });
    filterWrap.appendChild(rootDiv);

    const freqDiv = document.createElement("div");
    const freqLabel = document.createElement("div");
    freqLabel.className = "sidebar-label";
    freqLabel.textContent = "Minimum Frequency";
    const freqInput = document.createElement("input");
    freqInput.type = "number";
    freqInput.min = "0";
    freqInput.placeholder = "e.g. 50";
    freqInput.value = state.minFrequency;
    freqInput.style.width = "100%";
    freqInput.style.padding = "6px 8px";
    freqInput.style.borderRadius = "var(--radius)";
    freqInput.style.border = "1px solid var(--hairline)";
    freqInput.addEventListener("input", () => {
      state.minFrequency = freqInput.value;
    });
    freqInput.addEventListener("change", () => {
      rerender();
    });
    freqDiv.appendChild(freqLabel);
    freqDiv.appendChild(freqInput);
    filterWrap.appendChild(freqDiv);

    sidebarExtra.appendChild(filterWrap);
  }

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const bodyWrap = document.createElement("div");
  content.appendChild(bodyWrap);

  if (state.mode === "quiz") {
    renderQuiz(bodyWrap, allRows, pool);
  } else {
    renderPractice(bodyWrap, pool());
  }

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => {
    state.quiz = freshQuizState();
    navigate("home");
  });
  content.appendChild(homeBtn);
}
