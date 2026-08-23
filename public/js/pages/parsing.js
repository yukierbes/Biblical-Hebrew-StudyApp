import { getAvailableDatasets, loadVerbData } from "../data.js";
import { applyFilters, orderedOptionsFromRows, GENERATOR_COLUMNS } from "../filters.js";
import { renderDatasetSelector, renderFilterSidebar } from "../widgets.js";
import { renderTable } from "../table.js";
import {
  getFilteredRows,
  groupByConjugation,
  sampleN,
  morphKey,
  downloadCSV,
  downloadXLSX,
  computeAmbiguityHints,
} from "../helpers.js";
import { MODE_ORDER, PERSON_OPTIONS_NA, GENDER_OPTIONS_NA, NUMBER_OPTIONS_NA } from "../constants.js";
import { recordAttempt } from "../history.js";
import { renderHistoryPanel } from "../history-ui.js";
import { pickAdaptive, recordItemResult, recordStreakActivity, getMasteryStats } from "../srs.js";

const PRACTICE_FIELDS = ["Binyan", "Mode", "Person", "Gender", "Number"]; // label === column
const QUIZ_FIELDS = ["Binyan", "Stem", "Person", "Gender", "Number"];
const QUIZ_FIELD_MAP = { Stem: "Mode" };

let state = null;
let rerender = null;

function freshState() {
  const available = getAvailableDatasets();
  return {
    datasets: { selected: available.length ? [available[0]] : [] },
    filters: Object.fromEntries(GENERATOR_COLUMNS.map((c) => [c, []])),
    mode: "practice", // "practice" | "quiz"
    practice: {
      inputMode: "Dropdown",
      row: null,
      checked: false,
      showAnswer: false,
      userAnswers: {},
      hintsRevealed: 0,
    },
    quiz: freshQuizState(),
  };
}

function freshQuizState() {
  return {
    step: "filters", // filters -> length -> input_mode -> question -> summary
    active: false,
    useFilters: true,
    lockedFilters: {},
    quizPool: null, // grouped rows available to sample from
    questions: [],
    index: 0,
    results: [],
    inputMode: "Dropdown",
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

function orderedOptions(col, df) {
  if (col === "Binyan") return orderedOptionsFromRows(df, "Binyan");
  if (col === "Mode") return MODE_ORDER;
  if (col === "Person") return PERSON_OPTIONS_NA;
  if (col === "Gender") return GENDER_OPTIONS_NA;
  if (col === "Number") return NUMBER_OPTIONS_NA;
  return [];
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
  wrap.innerHTML = `<h1 class="page-title">Verb Parsing</h1><hr class="hr"/>`;
  content.appendChild(wrap);

  if (!df.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "Select at least one dataset to begin.";
    content.appendChild(div);
    return;
  }

  // Mode radio
  const modeWrap = document.createElement("div");
  modeWrap.className = "radio-row";
  modeWrap.style.marginBottom = "14px";
  for (const m of ["Practice", "Quiz"]) {
    const id = `parsing-mode-${m}`;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "parsing-mode";
    input.id = id;
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
  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  // Filters sidebar (locked during quiz)
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

  const bodyWrap = document.createElement("div");
  content.appendChild(bodyWrap);

  if (state.mode === "quiz") {
    renderQuiz(bodyWrap, df, navigate);
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

// ================= Practice mode =================

/**
 * Renders the "this form is ambiguous" hint panel shared by Practice
 * and Quiz question steps. Hints are revealed one at a time on demand
 * (rather than all at once) so the learner still has to attempt an
 * answer, and only reaches for elimination clues if they get stuck —
 * that small bit of friction is what makes the hint useful for
 * retention rather than just handing over the answer.
 *
 * `hintState` is any object with a mutable `hintsRevealed` counter
 * (either the practice state `p`, or the current quiz question state).
 */
function renderHintPanel(container, hints, hintState, onReveal) {
  if (!hints || hints.length === 0) return;

  const panel = document.createElement("div");
  panel.className = "hint-panel";

  const badge = document.createElement("div");
  badge.className = "hint-badge";
  badge.textContent = "This exact form fits more than one parsing for many verbs.";
  panel.appendChild(badge);

  const revealed = hints.slice(0, hintState.hintsRevealed);
  if (revealed.length > 0) {
    const list = document.createElement("ul");
    list.className = "hint-list";
    for (const h of revealed) {
      const li = document.createElement("li");
      li.textContent = h.text;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }

  if (hintState.hintsRevealed < hints.length) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline btn-sm";
    btn.textContent = hintState.hintsRevealed === 0 ? "Show Hint" : "Show Another Hint";
    btn.addEventListener("click", () => {
      hintState.hintsRevealed += 1;
      onReveal();
    });
    panel.appendChild(btn);
  }

  container.appendChild(panel);
}

function renderPractice(container, df) {
  const p = state.practice;

  container.innerHTML = `
    <h3>Verb Parsing Practice</h3>
    <div class="info-box">
      <b>Instructions</b><br>
      Click <i>Generate a Verb</i> to generate a random conjugation. Then parse the features of the verb.<br>
      Click <i>Check Answer</i> for feedback or <i>Show Answer</i> to reveal the solution/s.
    </div>
    <hr class="hr"/>
  `;

  const working = applyFilters(df, state.filters);
  const grouped = groupByConjugation(working, working[0] && "Dataset" in working[0] ? ["Dataset"] : []);

  // Input mode radio
  const inputModeWrap = document.createElement("div");
  inputModeWrap.className = "radio-row";
  for (const m of ["Dropdown", "Typing", "Selection"]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "practice-input-mode";
    input.checked = p.inputMode === m;
    input.addEventListener("change", () => {
      p.inputMode = m;
      rerender();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + m));
    inputModeWrap.appendChild(label);
  }
  container.appendChild(inputModeWrap);
  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const stats = getMasteryStats("parsing", grouped, morphKey);
  if (stats.total > 0) {
    const statsCaption = document.createElement("div");
    statsCaption.className = "caption";
    statsCaption.style.textAlign = "center";
    statsCaption.textContent = `New: ${stats.newCount} · Learning: ${stats.learning} · Mastered: ${stats.mastered}`;
    container.appendChild(statsCaption);
  }

  const genBtn = document.createElement("button");
  genBtn.className = "btn btn-block";
  genBtn.textContent = "Generate Verb";
  genBtn.addEventListener("click", () => {
    if (grouped.length === 0) {
      p.genWarning = true;
      rerender();
      return;
    }
    p.genWarning = false;
    p.row = pickAdaptive("parsing", grouped, morphKey);
    p.checked = false;
    p.showAnswer = false;
    p.userAnswers = {};
    p.hintsRevealed = 0;
    rerender();
  });
  container.appendChild(genBtn);

  if (p.genWarning) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No verbs match the selected filters.";
    container.appendChild(div);
  }

  if (!p.row) {
    const info = document.createElement("div");
    info.className = "alert alert-info";
    info.textContent = "Click Generate Verb to begin.";
    container.appendChild(info);
    return;
  }

  const row = p.row;

  const heb = document.createElement("div");
  heb.className = "hebrew-display";
  heb.innerHTML = `<span lang="he" dir="rtl">${row.Conjugation}</span>`;
  container.appendChild(heb);

  const matchingRows = df.filter((r) => r.Conjugation === row.Conjugation);
  const ambiguityHints = computeAmbiguityHints(row, matchingRows);
  renderHintPanel(container, ambiguityHints, p, () => rerender());

  function headerColor(label) {
    if (!p.checked) return "";
    const user = p.userAnswers[label] || "";
    const validRaw = row[label];
    const valid = Array.isArray(validRaw) ? validRaw : [validRaw];
    const normalizedUser = user === "NA" ? "" : user;
    if (valid.includes(normalizedUser)) return "pill-good";
    if (user) return "pill-warn";
    return "";
  }

  for (const label of PRACTICE_FIELDS) {
    const fieldWrap = document.createElement("div");
    fieldWrap.className = "field-group";

    const lbl = document.createElement("div");
    lbl.className = "field-label " + headerColor(label);
    lbl.textContent = label;
    fieldWrap.appendChild(lbl);

    const opts = orderedOptions(label, df);
    const mode = p.inputMode;

    if (mode === "Dropdown") {
      const sel = document.createElement("select");
      const blankOpt = document.createElement("option");
      blankOpt.value = "";
      blankOpt.textContent = "";
      sel.appendChild(blankOpt);
      for (const o of opts) {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        if (p.userAnswers[label] === o) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => {
        p.userAnswers[label] = sel.value;
      });
      fieldWrap.appendChild(sel);
    } else if (mode === "Typing") {
      const input = document.createElement("input");
      input.type = "text";
      input.value = p.userAnswers[label] || "";
      input.addEventListener("input", () => {
        p.userAnswers[label] = input.value;
      });
      fieldWrap.appendChild(input);
    } else {
      const choiceGroup = document.createElement("div");
      choiceGroup.className = "choice-group";
      for (const o of opts) {
        const choiceBtn = document.createElement("button");
        choiceBtn.type = "button";
        choiceBtn.className = "choice-btn" + (p.userAnswers[label] === o ? " selected" : "");
        choiceBtn.textContent = o;
        choiceBtn.addEventListener("click", () => {
          p.userAnswers[label] = o;
          rerender();
        });
        choiceGroup.appendChild(choiceBtn);
      }
      fieldWrap.appendChild(choiceGroup);
    }

    container.appendChild(fieldWrap);
  }

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const checkBtn = document.createElement("button");
  checkBtn.className = "btn";
  checkBtn.textContent = "Check Answer";
  checkBtn.addEventListener("click", () => {
    p.checked = true;
    const allCorrect = PRACTICE_FIELDS.every((label) => {
      const user = p.userAnswers[label] || "";
      const validRaw = row[label];
      const valid = Array.isArray(validRaw) ? validRaw : [validRaw];
      const normalizedUser = user === "NA" ? "" : user;
      return valid.includes(normalizedUser);
    });
    recordItemResult("parsing", morphKey(row), allCorrect);
    recordStreakActivity();
    rerender();
  });

  const showBtn = document.createElement("button");
  showBtn.className = "btn";
  showBtn.textContent = "Show Answer";
  showBtn.addEventListener("click", () => {
    p.showAnswer = true;
    rerender();
  });

  btnRow.appendChild(checkBtn);
  btnRow.appendChild(showBtn);
  container.appendChild(btnRow);

  if (p.showAnswer) {
    const rowConjugation = Array.isArray(row.Conjugation) ? row.Conjugation : [row.Conjugation];
    const matching = df.filter((r) => rowConjugation.includes(r.Conjugation));
    const answerTableWrap = document.createElement("div");
    answerTableWrap.style.maxWidth = "700px";
    answerTableWrap.style.margin = "0 auto";
    renderTable(answerTableWrap, matching, { columns: PRACTICE_FIELDS });
    container.appendChild(answerTableWrap);
  }
}

// ================= Quiz mode =================

function renderQuiz(container, df, navigate) {
  const q = state.quiz;

  switch (q.step) {
    case "filters":
      renderQuizFilterStep(container, df);
      break;
    case "length":
      renderQuizLengthStep(container);
      break;
    case "input_mode":
      renderQuizInputModeStep(container);
      break;
    case "question":
      renderQuizQuestionStep(container, df, navigate);
      break;
    case "summary":
      renderQuizSummaryStep(container, navigate);
      break;
    default:
      q.step = "filters";
      rerender();
  }
}

function renderQuizFilterStep(container, df) {
  container.innerHTML = `<h3>Identification Quiz</h3><p>Do you want to use the current sidebar filters for this quiz?</p>`;

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

  const grouped = groupByConjugation(working, working[0] && "Dataset" in working[0] ? ["Dataset"] : []);
  q.quizPool = grouped;

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
  input.style.marginBottom = "14px";
  input.addEventListener("input", () => {
    q.pendingLength = Math.max(1, Math.min(max, parseInt(input.value || "1", 10)));
  });
  container.appendChild(input);
  container.appendChild(document.createElement("br"));

  const continueBtn = document.createElement("button");
  continueBtn.className = "btn";
  continueBtn.style.marginTop = "10px";
  continueBtn.textContent = "Continue";
  continueBtn.addEventListener("click", () => {
    const n = q.pendingLength || defaultN;
    q.questions = buildQuizQuestions(q.quizPool, n);
    q.index = 0;
    q.step = "input_mode";
    rerender();
  });
  container.appendChild(continueBtn);
}

function buildQuizQuestions(pool, n) {
  const hasDataset = pool[0] && "Dataset" in pool[0];
  if (!hasDataset) return sampleN(pool, n);

  const datasets = [...new Set(pool.map((r) => r.Dataset))];
  const perDataset = Math.max(1, Math.floor(n / datasets.length));

  let samples = [];
  const usedIndices = new Set();
  for (const ds of datasets) {
    const dsRows = pool.filter((r) => r.Dataset === ds);
    const k = Math.min(perDataset, dsRows.length);
    const picked = sampleN(dsRows, k, false);
    samples = samples.concat(picked);
  }

  if (samples.length < n) {
    const sampleSet = new Set(samples);
    const remaining = pool.filter((r) => !sampleSet.has(r));
    const extra = sampleN(remaining, Math.min(n - samples.length, remaining.length), false);
    samples = samples.concat(extra);
  }

  return sampleN(samples, Math.min(n, samples.length), false);
}

function renderQuizInputModeStep(container) {
  const q = state.quiz;
  container.innerHTML = `<h3>Answer Input Mode</h3>`;

  const radioRow = document.createElement("div");
  radioRow.className = "radio-row";
  for (const m of ["Dropdown", "Typing", "Selection"]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "quiz-input-mode";
    input.checked = q.inputMode === m;
    input.addEventListener("change", () => {
      q.inputMode = m;
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + m));
    radioRow.appendChild(label);
  }
  container.appendChild(radioRow);

  const startBtn = document.createElement("button");
  startBtn.className = "btn btn-block";
  startBtn.style.marginTop = "14px";
  startBtn.textContent = "Start Quiz";
  startBtn.addEventListener("click", () => {
    q.step = "question";
    rerender();
  });
  container.appendChild(startBtn);
}

function renderQuizQuestionStep(container, df, navigate) {
  const q = state.quiz;
  const total = q.questions.length;

  if (q.index >= total) {
    q.step = "summary";
    // Render the summary directly into this same container rather than
    // calling rerender() — we're still inside an active render() pass
    // (triggered by the "Next Question" click), and re-entering the top
    // level render() here would cause the outer call's trailing markup
    // (the hr + Return Home button) to be appended a second time once
    // this nested call returns.
    renderQuizSummaryStep(container, navigate);
    return;
  }

  const row = q.questions[q.index];

  const progress = document.createElement("div");
  progress.className = "progress-bar-outer";
  progress.innerHTML = `<div class="progress-bar-inner" style="width:${((q.index + 1) / total) * 100}%"></div>`;
  container.appendChild(progress);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = `Question ${q.index + 1} of ${total}`;
  container.appendChild(caption);

  const heb = document.createElement("div");
  heb.className = "hebrew-display";
  heb.innerHTML = `<span lang="he" dir="rtl">${row.Conjugation}</span>`;
  container.appendChild(heb);

  const matchingRows = df.filter((r) => r.Conjugation === row.Conjugation);
  const ambiguityHints = computeAmbiguityHints(row, matchingRows);
  q.currentHintState = q.currentHintState || { hintsRevealed: 0 };
  renderHintPanel(container, ambiguityHints, q.currentHintState, () => rerender());

  q.currentAnswers = q.currentAnswers || {};
  const userAnswers = q.currentAnswers;

  for (const field of QUIZ_FIELDS) {
    const col = QUIZ_FIELD_MAP[field] || field;

    const fieldWrap = document.createElement("div");
    fieldWrap.className = "field-group";

    const lbl = document.createElement("div");
    lbl.className = "field-label";
    lbl.textContent = field;
    fieldWrap.appendChild(lbl);

    const opts = orderedOptions(col, df);
    const mode = q.inputMode;

    if (mode === "Dropdown") {
      const sel = document.createElement("select");
      const blankOpt = document.createElement("option");
      blankOpt.value = "";
      sel.appendChild(blankOpt);
      for (const o of opts) {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        if (userAnswers[field] === o) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => (userAnswers[field] = sel.value));
      fieldWrap.appendChild(sel);
    } else if (mode === "Typing") {
      const input = document.createElement("input");
      input.type = "text";
      input.value = userAnswers[field] || "";
      input.addEventListener("input", () => (userAnswers[field] = input.value));
      fieldWrap.appendChild(input);
    } else {
      const choiceGroup = document.createElement("div");
      choiceGroup.className = "choice-group";
      for (const o of opts) {
        const choiceBtn = document.createElement("button");
        choiceBtn.type = "button";
        choiceBtn.className = "choice-btn" + (userAnswers[field] === o ? " selected" : "");
        choiceBtn.textContent = o;
        choiceBtn.addEventListener("click", () => {
          userAnswers[field] = o;
          rerender();
        });
        choiceGroup.appendChild(choiceBtn);
      }
      fieldWrap.appendChild(choiceGroup);
    }

    container.appendChild(fieldWrap);
  }

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn js-shortcut-next";
  nextBtn.textContent = "Next Question";
  nextBtn.addEventListener("click", () => {
    recordAnswer(row, userAnswers);
    q.index += 1;
    q.currentAnswers = {};
    q.currentHintState = { hintsRevealed: 0 };
    rerender();
  });

  const endBtn = document.createElement("button");
  endBtn.className = "btn btn-secondary narrow";
  endBtn.textContent = "End Quiz";
  endBtn.addEventListener("click", () => {
    for (let i = q.index; i < total; i++) {
      const na = Object.fromEntries(QUIZ_FIELDS.map((f) => [f, "NA"]));
      recordAnswer(q.questions[i], na);
    }
    q.step = "summary";
    rerender();
  });

  btnRow.appendChild(nextBtn);
  btnRow.appendChild(endBtn);
  container.appendChild(btnRow);
}

function recordAnswer(row, userAnswers) {
  const q = state.quiz;
  let score = 0;
  const result = {
    Question: q.results.length + 1,
    Conjugation: row.Conjugation,
  };

  for (const field of QUIZ_FIELDS) {
    const col = QUIZ_FIELD_MAP[field] || field;
    let valid = row[col];
    valid = Array.isArray(valid) ? valid : [valid];
    let user = userAnswers[field] || "";
    if (user === "NA") user = "";

    result[field] = valid.join(" / ");
    result[`Your ${field}`] = user !== "" ? user : "NA";

    if (valid.includes(user)) score += 1;
  }

  result.Score = score;
  q.results.push(result);
  recordItemResult("parsing", morphKey(row), score === QUIZ_FIELDS.length);
  recordStreakActivity();
}

function colorAnswer(user, validArr) {
  const normalizedUser = user === "NA" ? "" : user;
  if (!user) return "";
  if (validArr.includes(normalizedUser)) return `<span class="pill pill-good">${user}</span>`;
  return `<span class="pill pill-bad">${user}</span>`;
}

function renderQuizSummaryStep(container, navigate) {
  const q = state.quiz;

  container.innerHTML = `<h2>Quiz Summary</h2>`;

  const totalPoints = q.results.length * QUIZ_FIELDS.length;
  const earned = q.results.reduce((s, r) => s + r.Score, 0);
  const percent = totalPoints ? Math.round((earned / totalPoints) * 100) : 0;

  if (!q.historyRecorded) {
    recordAttempt("parsing", {
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

  const columns = ["Question", "Conjugation", ...QUIZ_FIELDS.flatMap((f) => [f, `Your ${f}`]), "Score"];

  const tableWrap = document.createElement("div");
  const cellRenderers = {};
  for (const f of QUIZ_FIELDS) {
    cellRenderers[`Your ${f}`] = (value, row) => colorAnswer(value, (row[f] || "").split(" / "));
  }
  renderTable(tableWrap, q.results, { columns, cellRenderers });
  container.appendChild(tableWrap);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const dlRow = document.createElement("div");
  dlRow.className = "button-row";

  const csvBtn = document.createElement("button");
  csvBtn.className = "btn";
  csvBtn.textContent = "Download CSV";
  csvBtn.addEventListener("click", () => downloadCSV(q.results, columns, "identification_quiz_results.csv"));

  const xlsxBtn = document.createElement("button");
  xlsxBtn.className = "btn";
  xlsxBtn.textContent = "Download Excel";
  xlsxBtn.addEventListener("click", () =>
    downloadXLSX(q.results, columns, "identification_quiz_results.xlsx", "Results")
  );

  dlRow.appendChild(csvBtn);
  dlRow.appendChild(xlsxBtn);
  container.appendChild(dlRow);

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const missedIndices = q.results.map((r, i) => (r.Score < QUIZ_FIELDS.length ? i : -1)).filter((i) => i >= 0);

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
      q.currentAnswers = {};
      q.currentHintState = { hintsRevealed: 0 };
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
  renderHistoryPanel(container, "parsing", { onClear: () => rerender() });
}
