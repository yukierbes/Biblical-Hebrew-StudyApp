import { getLetterSet, freshFilters, applyLetterFilters } from "../letter-sets.js";
import { selectFiltersMessage } from "../filter-state.js";
import { renderLetterFilters, resetSidebarKeepingScroll } from "../letter-sidebar.js";
import { sampleN, downloadCSV, downloadXLSX, wrapHebrewSpans } from "../helpers.js";
import { renderTable } from "../table.js";
import { recordAttempt } from "../history.js";
import { renderHistoryPanel } from "../history-ui.js";
import { recordStreakActivity, pickAdaptive, recordItemResult, getMasteryStats } from "../srs.js";
import { consumeDeepLink } from "../deep-link.js";
import {
  isFormAnswerCorrect,
  isNameCorrect,
  primaryNameText,
  renderPrompt,
  renderAnswerInput,
  renderRevealedAnswer,
} from "../letter-answer-matching.js";
import { renderNameInput, renderRevealedName } from "../name-matching.js";

/**
 * Typing for the Consonants or Vowels set, with Practice and Quiz modes.
 *   "names" — shown the name, type the letter/vowel (with the on-screen keyboard).
 *   "form"  — shown the letter/vowel, type its name. The name is checked
 *             leniently (see name-matching.js): "sere" is fine for ṣere.
 */
export function createTypingPage(setId) {
  const set = getLetterSet(setId);
  const pageKey = `${set.pagePrefix}-typing`;
  const HISTORY_MODE = `${set.pagePrefix}-typing`;
  let state = null;
  let rerender = null;

  function freshState() {
    return {
      filters: freshFilters(set),
      mode: "practice", // "practice" | "quiz"
      promptWith: "names",
      practice: {
        word: null,
        userAnswer: "",
        checked: false,
        showAnswer: false,
        genWarning: false,
        hintLevel: 0,
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

  function mount({ content, sidebarExtra, navigate }) {
    state = freshState();
    rerender = () => render(content, sidebarExtra, navigate);
    const link = consumeDeepLink();
    if (link && link.type === `${set.pagePrefix}-typing-focus`) {
      // "symbol" was the old keyboard-shortcut option; it is now the name option.
      if (link.promptWith === "names") state.promptWith = "names";
      else if (link.promptWith === "form" || link.promptWith === "symbol") state.promptWith = "form";
    }
    rerender();
  }

  function unmount() {
    state = null;
    rerender = null;
  }

  const isNameMode = () => state.promptWith === "form";
  const promptLabel = () => (isNameMode() ? `${set.Singular} → Name` : `Name → ${set.Singular}`);
  const srsMode = () => `${set.srsPrefix}-typing-${state.promptWith}`;
  const isCorrectFor = (row, answer) => (isNameMode() ? isNameCorrect(set, row, answer) : isFormAnswerCorrect(row, answer));

  // ================= Hints (Practice mode only) =================

  /** "Get Hint": each press reveals one more clue about the answer (the
   * Category for a consonant; the Class, then the Length, for a vowel). */
  function renderHintArea(container, word) {
    const p = state.practice;
    const hints = set.hints(word);

    const hintWrap = document.createElement("div");
    hintWrap.style.textAlign = "center";
    hintWrap.style.marginBottom = "10px";

    const hintBtn = document.createElement("button");
    hintBtn.type = "button";
    hintBtn.className = "btn btn-outline btn-sm";
    // A consonant with no Category (blank on purpose) has nothing to reveal.
    hintBtn.textContent = hints.length === 0 ? "No Hint Available" : p.hintLevel >= hints.length ? "No More Hints" : "Get Hint";
    hintBtn.disabled = p.hintLevel >= hints.length;
    hintBtn.addEventListener("click", () => {
      p.hintLevel = Math.min(hints.length, p.hintLevel + 1);
      rerender();
    });
    hintWrap.appendChild(hintBtn);

    if (p.hintLevel >= 1) {
      const hintText = document.createElement("div");
      hintText.className = "caption";
      hintText.style.marginTop = "6px";
      hintText.textContent = hints.slice(0, p.hintLevel).join(" · ");
      hintWrap.appendChild(hintText);
    }
    container.appendChild(hintWrap);
  }

  function colorCell(rawValue, isCorrect) {
    if (rawValue === "NA") return `<span class="pill pill-warn">NA</span>`;
    return `<span class="pill ${isCorrect ? "pill-good" : "pill-bad"}">${wrapHebrewSpans(rawValue)}</span>`;
  }

  // ================= Practice mode =================

  function renderPractice(container, pool) {
    const p = state.practice;
    const stats = getMasteryStats(srsMode(), pool, set.rowKey);
    const nameMode = isNameMode();
    const hintBits = set.id === "vowels" ? "the Class, then the Length" : "the Category (if it has one)";

    container.innerHTML = `
      <h3>${set.title} Typing Practice</h3>
      <div class="info-box">
        <b>Instructions</b><br>
        Click <i>Generate a ${set.Singular}</i> for a prompt.<br>
        ${
          nameMode
            ? `Type the name of the ${set.singular} shown. Marks aren't needed — for example <i>sere</i>, <i>sureq</i> and <i>sin</i> are all accepted.<br>`
            : `Use the <i>${set.keyboardButtonLabel}</i> to enter the matching ${set.singular}.${
                set.id === "vowels" ? " The circle (◌) shows where the vowel goes." : ""
              }<br>`
        }
        ${set.Singular === "Consonant" ? "Letters you get right come back less often; ones you miss come back sooner" : "Vowels you get right come back less often; ones you miss come back sooner"} — <i>Generate a ${set.Singular}</i> adapts to what you're still learning.<br>
        Stuck? Click <i>Get Hint</i> to reveal ${hintBits}.<br>
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
    genBtn.textContent = `Generate a ${set.Singular}`;
    genBtn.addEventListener("click", () => {
      if (pool.length === 0) {
        p.genWarning = true;
        rerender();
        return;
      }
      p.genWarning = false;
      p.word = pickAdaptive(srsMode(), pool, set.rowKey);
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
      div.textContent = selectFiltersMessage(state.filters, Object.fromEntries(set.filters.map((f) => [f.key, f.label])), `No ${set.plural} match the selected filters.`);
      container.appendChild(div);
    }

    if (!p.word) return;

    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
    renderPrompt(container, set, p.word, state.promptWith);
    renderHintArea(container, p.word);
    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const inputsWrap = document.createElement("div");
    inputsWrap.style.maxWidth = "500px";
    inputsWrap.style.margin = "0 auto";
    const userState = { answer: p.userAnswer };
    if (nameMode) {
      renderNameInput(inputsWrap, {
        label: "Name",
        userState,
        checked: p.checked,
        isCorrect: p.checked && isNameCorrect(set, p.word, userState.answer),
      });
    } else {
      renderAnswerInput(inputsWrap, { set, row: p.word, userState, checked: p.checked });
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
      recordItemResult(srsMode(), set.rowKey(p.word), ok);
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
      if (nameMode) renderRevealedName(container, primaryNameText(set, p.word));
      else renderRevealedAnswer(container, p.word);
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
    container.innerHTML = `<h3>${set.title} Typing Quiz</h3><p>Do you want to use the current sidebar filters for this quiz?</p>`;

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    const yesBtn = document.createElement("button");
    yesBtn.className = "btn";
    yesBtn.textContent = "Yes, use filters";
    yesBtn.addEventListener("click", () => startQuizFilters(allRows, poolFn, true));

    const noBtn = document.createElement("button");
    noBtn.className = "btn";
    noBtn.textContent = `No, use all ${set.plural}`;
    noBtn.addEventListener("click", () => startQuizFilters(allRows, poolFn, false));

    btnRow.appendChild(yesBtn);
    btnRow.appendChild(noBtn);
    container.appendChild(btnRow);

    if (q.filterWarning) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = selectFiltersMessage(state.filters, Object.fromEntries(set.filters.map((f) => [f.key, f.label])), `No ${set.plural} match the selected filters. Please adjust the filters before starting the quiz.`);
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
      renderQuizSummaryStep(container);
      return;
    }

    const item = q.questions[q.index];
    const nameMode = isNameMode();

    const progress = document.createElement("div");
    progress.className = "progress-bar-outer";
    progress.innerHTML = `<div class="progress-bar-inner" style="width:${((q.index + 1) / total) * 100}%"></div>`;
    container.appendChild(progress);

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = `Question ${q.index + 1} of ${total}`;
    container.appendChild(caption);

    renderPrompt(container, set, item, state.promptWith);
    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const inputsWrap = document.createElement("div");
    inputsWrap.style.maxWidth = "500px";
    inputsWrap.style.margin = "0 auto";
    if (nameMode) {
      // No in-quiz feedback — everything is graded together at the end.
      renderNameInput(inputsWrap, { label: "Name", userState: q.userAnswers, checked: false });
    } else {
      renderAnswerInput(inputsWrap, { set, row: item, userState: q.userAnswers, checked: false });
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
    const userAnswer = (userAnswerValue || "").trim();
    const ok = isCorrectFor(item, userAnswer);

    q.results.push({
      Name: item.Name ?? "",
      Form: item.Form ?? "",
      Prompt: promptLabel(),
      "Your Answer": userAnswer || "NA",
      Correct: ok,
      Score: ok ? 1 : 0,
    });
    recordItemResult(srsMode(), set.rowKey(item), ok);
    recordStreakActivity();
  }

  function renderQuizSummaryStep(container) {
    const q = state.quiz;
    container.innerHTML = `<h2>Quiz Summary</h2>`;

    const totalPoints = q.results.length;
    const earned = q.results.reduce((s, r) => s + r.Score, 0);
    const percent = totalPoints ? Math.round((earned / totalPoints) * 100) : 0;

    if (!q.historyRecorded) {
      recordAttempt(HISTORY_MODE, {
        score: earned,
        total: totalPoints,
        percent,
        datasets: [promptLabel()],
        retry: q.isRetry,
      });
      q.historyRecorded = true;
    }

    const scoreEl = document.createElement("h3");
    scoreEl.textContent = `Score: ${earned} / ${totalPoints} (${percent}%)`;
    container.appendChild(scoreEl);
    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const columns = ["Name", "Form", "Prompt", "Your Answer", "Score"];
    const tableWrap = document.createElement("div");
    renderTable(tableWrap, q.results, {
      columns,
      cellRenderers: {
        Form: (v) => `<span class="letter-form-cell" lang="he">${v}</span>`,
        "Your Answer": (v, row) => colorCell(v, row.Correct),
      },
    });
    container.appendChild(tableWrap);

    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const fileBase = `${set.pagePrefix}_typing_quiz_results`;
    const dlRow = document.createElement("div");
    dlRow.className = "button-row";
    const csvBtn = document.createElement("button");
    csvBtn.className = "btn";
    csvBtn.textContent = "Download CSV";
    csvBtn.addEventListener("click", () => downloadCSV(q.results, columns, `${fileBase}.csv`));
    const xlsxBtn = document.createElement("button");
    xlsxBtn.className = "btn";
    xlsxBtn.textContent = "Download Excel";
    xlsxBtn.addEventListener("click", () => downloadXLSX(q.results, columns, `${fileBase}.xlsx`, "Results"));
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
    renderHistoryPanel(container, HISTORY_MODE, { onClear: () => rerender() });
  }

  // ================= Page shell =================

  function render(content, sidebarExtra, navigate) {
    resetSidebarKeepingScroll(sidebarExtra);
    content.innerHTML = "";

    const allRows = set.rows();
    const quizActive = state.quiz.active;

    if (!allRows.length) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = `No ${set.plural} data found.`;
      content.appendChild(div);
      return;
    }

    const wrap = document.createElement("div");
    wrap.innerHTML = `<h1 class="page-title">${set.title} Typing</h1><hr class="hr"/>`;
    content.appendChild(wrap);

    // ---- Practice / Quiz mode switch ----
    const modeWrap = document.createElement("div");
    modeWrap.className = "radio-row";
    modeWrap.style.marginBottom = "14px";
    for (const m of ["Practice", "Quiz"]) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `${pageKey}-mode`;
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
      ["names", `Name → type the ${set.singular}`],
      ["form", `${set.Singular} → type the name`],
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

    const pool = () => applyLetterFilters(set, allRows, state.filters);

    // Sidebar filters are hidden during an active quiz.
    if (!quizActive) {
      renderLetterFilters(sidebarExtra, { set, state, pageKey, onChange: rerender });
    }

    content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const bodyWrap = document.createElement("div");
    content.appendChild(bodyWrap);

    const missingMsg = quizActive ? null : selectFiltersMessage(state.filters, Object.fromEntries(set.filters.map((f) => [f.key, f.label])), null);
    if (missingMsg) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = missingMsg;
      bodyWrap.appendChild(div);
    } else if (state.mode === "quiz") {
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

  return { mount, unmount };
}
