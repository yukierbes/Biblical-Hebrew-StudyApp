import { getAccentRows, getTypeOrder, getGroupOrder } from "../accent-data.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { sampleN, downloadCSV, downloadXLSX, wrapHebrewSpans } from "../helpers.js";
import { renderTable } from "../table.js";
import { recordAttempt } from "../history.js";
import { renderHistoryPanel } from "../history-ui.js";
import { recordStreakActivity, pickAdaptive, recordItemResult, getMasteryStats } from "../srs.js";
import { applyAccentFilters, accentRowKey } from "../accent-filters.js";
import { consumeDeepLink } from "../deep-link.js";
import {
  isAccentAnswerCorrect,
  isKeyboardAnswerCorrect,
  buildKeyboardOptions,
  renderAccentPrompt,
  renderAccentAnswerInput,
  renderKeyboardChoiceInput,
  renderRevealedAccentAnswer,
  renderRevealedKeyboardAnswer,
} from "../accent-answer-matching.js";

let state = null;
let rerender = null;

function freshState() {
  return {
    filters: { Type: [], Group: [] },
    mode: "practice", // "practice" | "quiz"
    // "names" -> shown Hebrew/English name, type the Symbol via the
    // Accent Keyboard. "symbol" -> shown the Symbol, select which SIL
    // keyboard shortcut (the Keyboard column) types it.
    promptWith: "names",
    practice: {
      word: null,
      userAnswer: "",
      symbolOptions: [], // "symbol" mode only — this word's multiple-choice options
      checked: false,
      showAnswer: false,
      genWarning: false,
      hintLevel: 0, // 0 = no hint, 1 = Type shown, 2 = Type + Group shown
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
    questionOptions: [], // "symbol" mode only — parallel to `questions`
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
  if (link && link.type === "accent-typing-focus") {
    if (link.promptWith === "names" || link.promptWith === "symbol") state.promptWith = link.promptWith;
  }

  rerender();
}

export function unmount() {
  state = null;
  rerender = null;
}

// ================= Hints (Practice mode only) =================

/**
 * Practice-mode-only "Get Hint" button. First press reveals the Type,
 * second press additionally reveals the Group — only when the accent
 * actually has one, since every Conjunctive row has a blank Group.
 */
function renderHintArea(container, word) {
  const p = state.practice;
  const hasGroup = !!word.Group;
  const maxLevel = hasGroup ? 2 : 1;

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
    if (word.Type) parts.push(`Type: ${word.Type}`);
    if (p.hintLevel >= 2 && hasGroup) parts.push(`Group: ${word.Group}`);
    hintText.textContent = parts.join(" · ");
    hintWrap.appendChild(hintText);
  }

  container.appendChild(hintWrap);
}

function colorCell(rawValue, isCorrect) {
  if (rawValue === "NA") return `<span class="pill pill-warn">NA</span>`;
  return `<span class="pill ${isCorrect ? "pill-good" : "pill-bad"}">${wrapHebrewSpans(rawValue)}</span>`;
}

function isSymbolMode() {
  return state.promptWith === "symbol";
}

/** Correctness check for whichever mode is active. */
function isCorrectFor(word, answer) {
  return isSymbolMode() ? isKeyboardAnswerCorrect(word, answer) : isAccentAnswerCorrect(word, answer);
}

// ================= Practice mode =================

function srsMode() {
  return "accent-typing-" + state.promptWith;
}

function renderPractice(container, pool) {
  const p = state.practice;
  const stats = getMasteryStats(srsMode(), pool, accentRowKey);
  const symbolMode = isSymbolMode();

  container.innerHTML = `
    <h3>Accents Typing Practice</h3>
    <div class="info-box">
      <b>Instructions</b><br>
      Click <i>Generate an Accent</i> for a prompt.<br>
      ${
        symbolMode
          ? "Pick the SIL keyboard shortcut that types the accent shown — this is how you'll actually enter it when typing Biblical Hebrew.<br>"
          : "Use the <i>Accent Keyboard</i> to enter the matching accent mark.<br>"
      }
      Accents you get right come back less often; ones you miss come back sooner — <i>Generate an Accent</i> adapts to what you're still learning.<br>
      Stuck? Click <i>Get Hint</i> to reveal the Type, then the Group (if the accent has one).<br>
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
  genBtn.textContent = "Generate an Accent";
  genBtn.addEventListener("click", () => {
    if (pool.length === 0) {
      p.genWarning = true;
      rerender();
      return;
    }
    p.genWarning = false;
    p.word = pickAdaptive(srsMode(), pool, accentRowKey);
    p.symbolOptions = symbolMode ? buildKeyboardOptions(p.word, pool) : [];
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
    div.textContent = "No accents match the selected filters.";
    container.appendChild(div);
  }

  if (!p.word) return;

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  renderAccentPrompt(container, p.word, state.promptWith);
  renderHintArea(container, p.word);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  const userState = { answer: p.userAnswer };
  if (symbolMode) {
    renderKeyboardChoiceInput(inputsWrap, {
      word: p.word,
      options: p.symbolOptions,
      userState,
      checked: p.checked,
      onSelect: () => {
        p.userAnswer = userState.answer;
        rerender();
      },
    });
  } else {
    renderAccentAnswerInput(inputsWrap, {
      word: p.word,
      userState,
      checked: p.checked,
    });
  }
  container.appendChild(inputsWrap);

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const checkBtn = document.createElement("button");
  checkBtn.className = "btn";
  checkBtn.textContent = "Check Answer";
  checkBtn.addEventListener("click", () => {
    p.userAnswer = userState.answer;
    p.checked = true;
    const ok = isCorrectFor(p.word, userState.answer);
    recordItemResult(srsMode(), accentRowKey(p.word), ok);
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
    if (symbolMode) renderRevealedKeyboardAnswer(container, p.word);
    else renderRevealedAccentAnswer(container, p.word);
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
  container.innerHTML = `<h3>Accents Typing Quiz</h3><p>Do you want to use the current sidebar filters for this quiz?</p>`;

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const yesBtn = document.createElement("button");
  yesBtn.className = "btn";
  yesBtn.textContent = "Yes, use filters";
  yesBtn.addEventListener("click", () => startQuizFilters(allRows, poolFn, true));

  const noBtn = document.createElement("button");
  noBtn.className = "btn";
  noBtn.textContent = "No, use all accents";
  noBtn.addEventListener("click", () => startQuizFilters(allRows, poolFn, false));

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  container.appendChild(btnRow);

  if (q.filterWarning) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No accents match the selected filters. Please adjust the filters before starting the quiz.";
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
    q.questionOptions = isSymbolMode() ? q.questions.map((item) => buildKeyboardOptions(item, q.lockedPool)) : [];
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
    renderQuizSummaryStep(container);
    return;
  }

  const item = q.questions[q.index];
  const symbolMode = isSymbolMode();

  const progress = document.createElement("div");
  progress.className = "progress-bar-outer";
  progress.innerHTML = `<div class="progress-bar-inner" style="width:${((q.index + 1) / total) * 100}%"></div>`;
  container.appendChild(progress);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = `Question ${q.index + 1} of ${total}`;
  container.appendChild(caption);

  renderAccentPrompt(container, item, state.promptWith);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  if (symbolMode) {
    renderKeyboardChoiceInput(inputsWrap, {
      word: item,
      options: q.questionOptions[q.index] || [],
      userState: q.userAnswers,
      checked: false, // no in-quiz feedback — everything is graded together at the end
      onSelect: () => rerender(),
    });
  } else {
    renderAccentAnswerInput(inputsWrap, {
      word: item,
      userState: q.userAnswers,
      checked: false,
    });
  }
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
  const symbolMode = isSymbolMode();
  const userAnswer = symbolMode ? userAnswerValue || "" : (userAnswerValue || "").trim();
  const ok = isCorrectFor(item, userAnswer);

  q.results.push({
    Type: item.Type ?? "",
    HebrewName: item.HebrewName ?? "",
    EnglishName: item.EnglishName ?? "",
    Prompt: symbolMode ? "Symbol → Keyboard" : "Names → Symbol",
    "Your Answer": userAnswer || "NA",
    Correct: ok,
    Score: ok ? 1 : 0,
  });
  recordItemResult(srsMode(), accentRowKey(item), ok);
  recordStreakActivity();
}

function renderQuizSummaryStep(container) {
  const q = state.quiz;

  container.innerHTML = `<h2>Quiz Summary</h2>`;

  const totalPoints = q.results.length;
  const earned = q.results.reduce((s, r) => s + r.Score, 0);
  const percent = totalPoints ? Math.round((earned / totalPoints) * 100) : 0;

  if (!q.historyRecorded) {
    recordAttempt("accent-typing", {
      score: earned,
      total: totalPoints,
      percent,
      datasets: [isSymbolMode() ? "Symbol → Keyboard" : "Names → Symbol"],
      retry: q.isRetry,
    });
    q.historyRecorded = true;
  }

  const scoreEl = document.createElement("h3");
  scoreEl.textContent = `Score: ${earned} / ${totalPoints} (${percent}%)`;
  container.appendChild(scoreEl);
  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const columns = ["Type", "HebrewName", "EnglishName", "Prompt", "Your Answer", "Score"];
  const tableWrap = document.createElement("div");
  renderTable(tableWrap, q.results, {
    columns,
    cellRenderers: {
      HebrewName: (v) => wrapHebrewSpans(v),
      "Your Answer": (v, row) => colorCell(v, row.Correct),
    },
  });
  container.appendChild(tableWrap);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const dlRow = document.createElement("div");
  dlRow.className = "button-row";

  const csvBtn = document.createElement("button");
  csvBtn.className = "btn";
  csvBtn.textContent = "Download CSV";
  csvBtn.addEventListener("click", () => downloadCSV(q.results, columns, "accent_typing_quiz_results.csv"));

  const xlsxBtn = document.createElement("button");
  xlsxBtn.className = "btn";
  xlsxBtn.textContent = "Download Excel";
  xlsxBtn.addEventListener("click", () =>
    downloadXLSX(q.results, columns, "accent_typing_quiz_results.xlsx", "Results")
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
      const missedOptions = missedIndices.map((i) => q.questionOptions[i]);
      q.questions = missedRows;
      q.questionOptions = missedOptions;
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
  renderHistoryPanel(container, "accent-typing", { onClear: () => rerender() });
}

// ================= Page shell: mode/direction switches, sidebar, nav =================

function render(content, sidebarExtra, navigate) {
  sidebarExtra.innerHTML = "";
  content.innerHTML = "";

  const allRows = getAccentRows();
  const quizActive = state.quiz.active;

  if (!allRows.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No accents data found.";
    content.appendChild(div);
    return;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `<h1 class="page-title">Accents Typing</h1><hr class="hr"/>`;
  content.appendChild(wrap);

  // ---- Practice / Quiz mode switch ----
  const modeWrap = document.createElement("div");
  modeWrap.className = "radio-row";
  modeWrap.style.marginBottom = "14px";
  for (const m of ["Practice", "Quiz"]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "accent-typing-mode";
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

  // ---- Prompt-with switch ----
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
    ["names", "Hebrew/English Name → type Symbol"],
    ["symbol", "Symbol → Select Keyboard Input"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn" + (state.promptWith === value ? " selected" : "");
    btn.disabled = dirDisabled;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.promptWith = value;
      rerender();
    });
    dirGroup.appendChild(btn);
  }
  dirWrap.appendChild(dirGroup);
  content.appendChild(dirWrap);

  // ---- Sidebar filters, hidden during an active quiz ----
  function pool() {
    return applyAccentFilters(allRows, state.filters);
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
      state.filters = { Type: [], Group: [] };
      rerender();
    });
    filterWrap.appendChild(resetBtn);

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "accent-typing",
    getSnapshot: () => ({ filters: state.filters }),
    applySnapshot: (snap) => {
      state.filters = { Type: [], Group: [], ...snap.filters };
      rerender();
    },
  });
  filterWrap.appendChild(presetDiv);


    const typeDiv = document.createElement("div");
    typeDiv.style.marginBottom = "14px";
    renderCheckboxList(typeDiv, {
      label: "Type",
      options: getTypeOrder(),
      selected: state.filters.Type,
      onChange: (next) => {
        state.filters.Type = next;
        rerender();
      },
    });
    filterWrap.appendChild(typeDiv);

    const groupDiv = document.createElement("div");
    groupDiv.style.marginBottom = "14px";
    renderCheckboxList(groupDiv, {
      label: "Group",
      options: getGroupOrder(),
      selected: state.filters.Group,
      onChange: (next) => {
        state.filters.Group = next;
        rerender();
      },
    });
    filterWrap.appendChild(groupDiv);

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
