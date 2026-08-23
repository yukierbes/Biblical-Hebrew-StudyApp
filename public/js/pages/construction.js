import { getAvailableDatasets, loadVerbData } from "../data.js";
import { applyFilters, GENERATOR_COLUMNS } from "../filters.js";
import { renderDatasetSelector, renderFilterSidebar } from "../widgets.js";
import { renderTable } from "../table.js";
import {
  getFilteredRows,
  isValidCombo,
  groupByConjugationList,
  sampleN,
  morphKey,
  downloadCSV,
  downloadXLSX,
  MORPH_COLUMNS,
  wrapHebrewSpans,
} from "../helpers.js";
import { recordAttempt } from "../history.js";
import { renderHistoryPanel } from "../history-ui.js";
import { openHebrewKeyboard } from "../hebrew-keyboard.js";
import { pickAdaptive, recordItemResult, recordStreakActivity, getMasteryStats } from "../srs.js";

const DISPLAY_COLUMNS = ["Binyan", "Mode", "Person", "Gender", "Number"];

let state = null;
let rerender = null;

function freshState() {
  const available = getAvailableDatasets();
  return {
    datasets: { selected: available.length ? [available[0]] : [] },
    filters: Object.fromEntries(GENERATOR_COLUMNS.map((c) => [c, []])),
    mode: "practice",
    practice: {
      verb: null,
      showAnswer: false,
      genWarning: false,
      userHebrew: "",
      userGloss: "",
      checked: false,
    },
    quiz: freshQuizState(),
  };
}

function freshQuizState() {
  return {
    step: "filters",
    active: false,
    useFilters: true,
    lockedFilters: {},
    quizPool: null,
    questions: [],
    index: 0,
    results: [],
    userAnswers: { hebrew: "", gloss: "" },
    historyRecorded: false,
    isRetry: false,
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
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    __scrollContainer.scrollTop = __sidebarScrollTop;
  });
  content.innerHTML = "";

  const available = getAvailableDatasets();
  const quizActive = state.quiz.active;

  if (!quizActive) {
    sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));
    renderDatasetSelector(sidebarExtra, {
      availableDatasets: available,
      state: state.datasets,
      onChange: () => {
        state.lockedDf = null;
        rerender();
      },
    });
  }

  const selected = state.datasets.selected;
  let df;
  if (quizActive) {
    df = state.lockedDf || [];
  } else {
    df = selected.length ? loadVerbData(selected) : [];
    state.lockedDf = df;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `<h1 class="page-title">Verb Construction</h1><hr class="hr"/>`;
  content.appendChild(wrap);

  if (!df.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "Select at least one dataset to begin.";
    content.appendChild(div);
    return;
  }

  const modeWrap = document.createElement("div");
  modeWrap.className = "radio-row";
  modeWrap.style.marginBottom = "14px";
  for (const m of ["Practice", "Quiz"]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "construction-mode";
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

  if (!quizActive) {
    const filterHolder = document.createElement("div");
    sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));
    sidebarExtra.appendChild(filterHolder);
    renderFilterSidebar(filterHolder, {
      rows: df,
      filtersState: state.filters,
      onChange: rerender,
    });
  }

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const bodyWrap = document.createElement("div");
  content.appendChild(bodyWrap);

  if (state.mode === "quiz") {
    renderQuiz(bodyWrap, df);
  } else {
    renderPractice(bodyWrap, df);
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

// ================= Shared: Hebrew/Gloss answer normalization =================

function normalizeHebrew(s) {
  return (s || "").normalize("NFC").trim();
}

function normalizeGloss(s) {
  return (s || "").trim().toLowerCase();
}

function isHebrewCorrect(userValue, validArray) {
  const norm = normalizeHebrew(userValue);
  if (!norm) return false;
  return (validArray || []).some((v) => normalizeHebrew(v) === norm);
}

function isGlossCorrect(userValue, validArray) {
  const norm = normalizeGloss(userValue);
  if (!norm) return false;
  return (validArray || []).some((v) => normalizeGloss(v) === norm);
}

/**
 * Renders the shared "type the Hebrew, type the gloss" answer inputs
 * used by both Practice and Quiz. `userState` is a plain object with
 * `hebrew`/`gloss` string fields, mutated in place as the person types.
 * When `checked` is true, each field's label is colored to show whether
 * it currently matches a valid answer.
 */
function renderAnswerInputs(container, { validConjugations, validGlosses, userState, checked }) {
  const hebField = document.createElement("div");
  hebField.className = "field-group";

  const hebCorrect = checked && isHebrewCorrect(userState.hebrew, validConjugations);
  const hebLabel = document.createElement("div");
  hebLabel.className = "field-label" + (checked ? (hebCorrect ? " pill-good" : " pill-warn") : "");
  hebLabel.textContent = "Hebrew";
  hebField.appendChild(hebLabel);

  const hebRow = document.createElement("div");
  hebRow.style.display = "flex";
  hebRow.style.gap = "8px";

  const hebInput = document.createElement("input");
  hebInput.type = "text";
  hebInput.setAttribute("dir", "rtl");
  hebInput.setAttribute("lang", "he");
  hebInput.className = "construction-hebrew-input";
  hebInput.style.fontFamily = "var(--font-hebrew)";
  hebInput.style.fontSize = "1.25rem";
  hebInput.value = userState.hebrew;
  hebInput.addEventListener("input", () => {
    userState.hebrew = hebInput.value;
  });

  const kbBtn = document.createElement("button");
  kbBtn.type = "button";
  kbBtn.className = "btn btn-outline btn-sm";
  kbBtn.style.flexShrink = "0";
  kbBtn.textContent = "Hebrew Keyboard";
  kbBtn.addEventListener("click", () => openHebrewKeyboard(hebInput));

  hebRow.appendChild(hebInput);
  hebRow.appendChild(kbBtn);
  hebField.appendChild(hebRow);
  container.appendChild(hebField);

  const glossField = document.createElement("div");
  glossField.className = "field-group";

  const glossCorrect = checked && isGlossCorrect(userState.gloss, validGlosses);
  const glossLabel = document.createElement("div");
  glossLabel.className = "field-label" + (checked ? (glossCorrect ? " pill-good" : " pill-warn") : "");
  glossLabel.textContent = "Gloss Translation";
  glossField.appendChild(glossLabel);

  const glossInput = document.createElement("input");
  glossInput.type = "text";
  glossInput.value = userState.gloss;
  glossInput.addEventListener("input", () => {
    userState.gloss = glossInput.value;
  });
  glossField.appendChild(glossInput);
  container.appendChild(glossField);
}

function renderRevealedForms(container, verb) {
  const forms = verb.Conjugation || [];
  const glosses = verb["Gloss Translation"] || [];
  forms.forEach((form, i) => {
    const gloss = glosses[i] || "";
    const div = document.createElement("div");
    div.className = "hebrew-display";
    div.innerHTML = `<span lang="he" dir="rtl">${form}</span><span class="gloss-display">${gloss}</span>`;
    container.appendChild(div);
  });
}

// ================= Practice mode =================

function buildDisplayTable(verb) {
  const data = {};
  for (const col of DISPLAY_COLUMNS) {
    const v = verb[col];
    if (v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "nan") {
      data[col] = v;
    }
  }
  if (verb.Dataset && String(verb.Dataset).trim()) data.Dataset = verb.Dataset;
  return [data];
}

function renderPractice(container, df) {
  const p = state.practice;

  container.innerHTML = `
    <h3>Verb Construction Practice</h3>
    <div class="info-box">
      <b>Instructions</b><br>
      Click <i>Generate a Verb</i> for a morphology prompt, then type the Hebrew conjugation and its
      gloss translation.<br>
      Click <i>Check Answer</i> for feedback, or <i>Show Answer</i> to reveal the correct form(s).
    </div>
    <hr class="hr"/>
  `;

  const valid = applyFilters(df.filter(isValidCombo), state.filters);
  const grouped = groupByConjugationList(valid, [...MORPH_COLUMNS, "Dataset"]);

  const stats = getMasteryStats("construction", grouped, morphKey);
  if (stats.total > 0) {
    const statsCaption = document.createElement("div");
    statsCaption.className = "caption";
    statsCaption.style.textAlign = "center";
    statsCaption.textContent = `New: ${stats.newCount} · Learning: ${stats.learning} · Mastered: ${stats.mastered}`;
    container.appendChild(statsCaption);
  }

  const genBtn = document.createElement("button");
  genBtn.className = "btn btn-block";
  genBtn.textContent = "Generate a Verb";
  genBtn.addEventListener("click", () => {
    if (grouped.length === 0) {
      p.genWarning = true;
      rerender();
      return;
    }

    p.genWarning = false;
    p.verb = pickAdaptive("construction", grouped, morphKey);
    p.showAnswer = false;
    p.userHebrew = "";
    p.userGloss = "";
    p.checked = false;
    rerender();
  });
  container.appendChild(genBtn);

  if (p.genWarning) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No verbs match the selected filters.";
    container.appendChild(div);
  }

  if (!p.verb) return;

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const tableWrap = document.createElement("div");
  tableWrap.style.maxWidth = "700px";
  tableWrap.style.margin = "0 auto";
  renderTable(tableWrap, buildDisplayTable(p.verb), {
    cellRenderers: { Dataset: (v) => wrapHebrewSpans(v) },
  });
  container.appendChild(tableWrap);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  const userState = { hebrew: p.userHebrew, gloss: p.userGloss };
  renderAnswerInputs(inputsWrap, {
    validConjugations: p.verb.Conjugation || [],
    validGlosses: p.verb["Gloss Translation"] || [],
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
    p.userHebrew = userState.hebrew;
    p.userGloss = userState.gloss;
    p.checked = true;
    const hebOk = isHebrewCorrect(userState.hebrew, p.verb.Conjugation || []);
    const globOk = isGlossCorrect(userState.gloss, p.verb["Gloss Translation"] || []);
    recordItemResult("construction", morphKey(p.verb), hebOk && globOk);
    recordStreakActivity();
    rerender();
  });

  const showBtn = document.createElement("button");
  showBtn.className = "btn";
  showBtn.textContent = "Show Answer";
  showBtn.addEventListener("click", () => {
    p.userHebrew = userState.hebrew;
    p.userGloss = userState.gloss;
    p.showAnswer = true;
    rerender();
  });

  btnRow.appendChild(checkBtn);
  btnRow.appendChild(showBtn);
  container.appendChild(btnRow);

  if (p.showAnswer) {
    renderRevealedForms(container, p.verb);
  }
}

// ================= Quiz mode =================

function renderQuiz(container, df) {
  const q = state.quiz;
  switch (q.step) {
    case "filters":
      renderQuizFilterStep(container, df);
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

function renderQuizFilterStep(container, df) {
  container.innerHTML = `<h3>Construction Quiz</h3><p>Do you want to use the current sidebar filters for this quiz?</p>`;

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const yesBtn = document.createElement("button");
  yesBtn.className = "btn";
  yesBtn.textContent = "Yes, use filters";
  yesBtn.addEventListener("click", () => startQuizFilters(df, true));

  const noBtn = document.createElement("button");
  noBtn.className = "btn";
  noBtn.textContent = "No, use all verbs";
  noBtn.addEventListener("click", () => startQuizFilters(df, false));

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  container.appendChild(btnRow);

  if (state.quiz.filterWarning) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No verbs match the selected filters. Please adjust the filters before starting the quiz.";
    container.appendChild(div);
  }
}

function startQuizFilters(df, useFilters) {
  const q = state.quiz;
  const lockedFilters = useFilters ? { ...state.filters } : {};
  const working = useFilters ? getFilteredRows(df, lockedFilters) : df.slice();

  if (useFilters && working.length === 0) {
    q.filterWarning = true;
    rerender();
    return;
  }

  q.filterWarning = false;
  q.useFilters = useFilters;
  q.lockedFilters = lockedFilters;
  q.active = true;
  state.lockedDf = df;
  q.step = "length";
  q.quizPool = groupByConjugationList(working, [...MORPH_COLUMNS, "Dataset"]);

  rerender();
}

function renderQuizLengthStep(container) {
  const q = state.quiz;
  const max = q.quizPool.length;
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
    q.questions = sampleN(q.quizPool, n, false);
    q.index = 0;
    q.results = [];
    q.userAnswers = { hebrew: "", gloss: "" };
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
    // See parsing.js for why this delegates directly instead of calling
    // rerender() from inside an active render pass.
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

  const rowData = {};
  for (const c of MORPH_COLUMNS) {
    if (item[c]) rowData[c] = item[c];
  }
  if (item.Dataset && String(item.Dataset).trim()) rowData.Dataset = item.Dataset;

  const tableWrap = document.createElement("div");
  tableWrap.style.maxWidth = "700px";
  tableWrap.style.margin = "0 auto";
  renderTable(tableWrap, [rowData], {
    cellRenderers: { Dataset: (v) => wrapHebrewSpans(v) },
  });
  container.appendChild(tableWrap);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  renderAnswerInputs(inputsWrap, {
    validConjugations: item.Conjugation || [],
    validGlosses: item["Gloss Translation"] || [],
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
    record(item, q.userAnswers);
    q.index += 1;
    q.userAnswers = { hebrew: "", gloss: "" };
    rerender();
  });

  const endBtn = document.createElement("button");
  endBtn.className = "btn btn-secondary narrow";
  endBtn.textContent = "End Quiz";
  endBtn.addEventListener("click", () => {
    // Matches Parsing's End Quiz behavior: the current question and all
    // remaining ones are recorded as blank/unanswered, discarding
    // whatever may have been typed but not submitted via Next Question.
    for (let i = q.index; i < total; i++) record(q.questions[i], { hebrew: "", gloss: "" });
    q.index = total;
    q.step = "summary";
    rerender();
  });

  navRow.appendChild(nextBtn);
  navRow.appendChild(endBtn);
  container.appendChild(navRow);
}

function record(item, userAnswers) {
  const q = state.quiz;
  const validHeb = item.Conjugation || [];
  const validGloss = item["Gloss Translation"] || [];
  const userHeb = (userAnswers.hebrew || "").trim();
  const userGloss = (userAnswers.gloss || "").trim();

  const hebOk = isHebrewCorrect(userHeb, validHeb);
  const glossOk = isGlossCorrect(userGloss, validGloss);

  const entry = {};
  for (const c of MORPH_COLUMNS) entry[c] = item[c] ?? "";
  entry.Dataset = item.Dataset ?? "";
  entry["Correct Hebrew"] = validHeb.join(" / ");
  entry["Your Hebrew"] = userHeb || "NA";
  entry["Correct Gloss"] = validGloss.join(" / ");
  entry["Your Gloss"] = userGloss || "NA";
  entry.HebrewCorrect = hebOk;
  entry.GlossCorrect = glossOk;
  entry.Score = (hebOk ? 1 : 0) + (glossOk ? 1 : 0);
  q.results.push(entry);
  recordItemResult("construction", morphKey(item), hebOk && glossOk);
  recordStreakActivity();
}

function colorCell(rawValue, isCorrect, hebrew) {
  if (rawValue === "NA") return `<span class="pill pill-warn">NA</span>`;
  const display = hebrew ? wrapHebrewSpans(rawValue) : rawValue;
  return `<span class="pill ${isCorrect ? "pill-good" : "pill-bad"}">${display}</span>`;
}

function renderQuizSummaryStep(container) {
  const q = state.quiz;

  container.innerHTML = `<h2>Quiz Summary</h2>`;

  const totalPoints = q.results.length * 2;
  const earned = q.results.reduce((s, r) => s + r.Score, 0);
  const percent = totalPoints ? Math.round((earned / totalPoints) * 100) : 0;

  if (!q.historyRecorded) {
    recordAttempt("construction", {
      score: earned,
      total: totalPoints,
      percent,
      datasets: state.datasets.selected,
      retry: q.isRetry,
    });
    q.historyRecorded = true;
  }

  const scoreEl = document.createElement("h3");
  scoreEl.textContent = `Score: ${earned} / ${totalPoints} (${percent}%)`;
  container.appendChild(scoreEl);
  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const columns = [
    ...MORPH_COLUMNS,
    "Dataset",
    "Correct Hebrew",
    "Your Hebrew",
    "Correct Gloss",
    "Your Gloss",
    "Score",
  ];
  const tableWrap = document.createElement("div");
  renderTable(tableWrap, q.results, {
    columns,
    cellRenderers: {
      Dataset: (v) => wrapHebrewSpans(v),
      "Correct Hebrew": (v) => wrapHebrewSpans(v),
      "Your Hebrew": (v, row) => colorCell(v, row.HebrewCorrect, true),
      "Your Gloss": (v, row) => colorCell(v, row.GlossCorrect, false),
    },
  });
  container.appendChild(tableWrap);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const dlRow = document.createElement("div");
  dlRow.className = "button-row";

  const csvBtn = document.createElement("button");
  csvBtn.className = "btn";
  csvBtn.textContent = "Download CSV";
  csvBtn.addEventListener("click", () => downloadCSV(q.results, columns, "construction_quiz_results.csv"));

  const xlsxBtn = document.createElement("button");
  xlsxBtn.className = "btn";
  xlsxBtn.textContent = "Download Excel";
  xlsxBtn.addEventListener("click", () =>
    downloadXLSX(q.results, columns, "construction_quiz_results.xlsx", "Results")
  );

  dlRow.appendChild(csvBtn);
  dlRow.appendChild(xlsxBtn);
  container.appendChild(dlRow);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const missedIndices = q.results.map((r, i) => (r.Score < 2 ? i : -1)).filter((i) => i >= 0);

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
      q.userAnswers = { hebrew: "", gloss: "" };
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
  renderHistoryPanel(container, "construction", { onClear: () => rerender() });
}
