import { getLetterSet, freshFilters, applyLetterFilters, isSharedForm } from "../letter-sets.js";
import { renderLetterFilters, resetSidebarKeepingScroll } from "../letter-sidebar.js";
import { wrapHebrewSpans, sampleN } from "../helpers.js";
import { recordStreakActivity, recordItemResult } from "../srs.js";
import {
  isFormAnswerCorrect,
  renderPrompt,
  renderAnswerInput,
  primaryAnswerText,
} from "../letter-answer-matching.js";

// Games for the Consonants or Vowels set: Survival Sprint, Beat the Clock,
// Memory Match, Lightning Round, and a Sort game. This is the Accents games
// page generalized — same five games, same scoring and high-score handling —
// with everything specific to one dataset coming from letter-sets.js.
// Returns { mount, unmount, getAllHighScores } for the page wrappers.
export function createGamesPage(setId) {
  const set = getLetterSet(setId);

  const HIGH_SCORE_KEY = `hebrewVerbApp:${set.pagePrefix}GameHighScores`;

  const GAMES = [
    {
      key: "sprint",
      title: "Survival Sprint",
      desc: "Answer correctly to keep going — three wrong answers and it's over. How far can you get?",
      minWords: 5,
    },
    {
      key: "clock",
      title: "Beat the Clock",
      desc: "60 seconds, as many correct answers as you can get. Build a streak for a score multiplier.",
      minWords: 5,
    },
    {
      key: "memory",
      title: "Memory Match",
      desc: set.memoryDesc,
      minWords: 6,
    },
    {
      key: "lightning",
      title: "Lightning Round",
      desc: "Multiple choice, fast — pick the right match before time runs out.",
      minWords: 5,
    },
    {
      key: "sort",
      title: set.sortTitle,
      desc: set.sortDesc,
      minWords: 5,
    },
  ];

  let state = null;
  let rerender = null;

  function freshState() {
    return {
      filters: freshFilters(set),
      screen: "menu", // "menu" | one of GAMES' keys
      timerId: null,
      sprint: null,
      clock: null,
      memory: null,
      lightning: null,
      sort: null,
    };
  }

  function mount({ content, sidebarExtra, navigate }) {
    state = freshState();
    rerender = () => render(content, sidebarExtra, navigate);
    rerender();
  }

  function unmount() {
    clearActiveTimer();
    state = null;
    rerender = null;
  }

  // ================= Timers =================

  function clearActiveTimer() {
    if (state && state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startCountdown({ seconds, displayId, onExpire }) {
    clearActiveTimer();
    let remaining = seconds;
    const el = document.getElementById(displayId);
    if (el) el.textContent = String(remaining);
    state.timerId = setInterval(() => {
      remaining -= 1;
      const liveEl = document.getElementById(displayId);
      if (liveEl) liveEl.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) {
        clearActiveTimer();
        onExpire();
      }
    }, 1000);
  }

  function startStopwatch({ displayId }) {
    clearActiveTimer();
    let elapsed = 0;
    const el = document.getElementById(displayId);
    if (el) el.textContent = "0:00";
    state.timerId = setInterval(() => {
      elapsed += 1;
      const liveEl = document.getElementById(displayId);
      if (liveEl) liveEl.textContent = formatTime(elapsed);
    }, 1000);
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // ================= High scores =================

  function loadHighScores() {
    try {
      const raw = localStorage.getItem(HIGH_SCORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveHighScores(scores) {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(scores));
    } catch (e) {
      /* ignore */
    }
  }

  function getHighScore(key) {
    return loadHighScores()[key] ?? null;
  }

  /** All recorded game high scores at once, keyed by game/direction (or
   * pair-count for Memory Match). Used by the Achievements page. */
  function getAllHighScores() {
    return loadHighScores();
  }

  function maybeSaveHighScore(key, value, higherIsBetter = true) {
    const scores = loadHighScores();
    const current = scores[key];
    const isBetter = current === undefined || (higherIsBetter ? value > current : value < current);
    if (isBetter) {
      scores[key] = value;
      saveHighScores(scores);
      return true;
    }
    return false;
  }

  // ================= Shared helpers =================

  function srsMode(promptWith) {
    return `${set.srsPrefix}-games-${promptWith}`;
  }

  /** For Lightning Round's multiple choice, "the other side" from
   * whatever's shown as the prompt: the letter/vowel itself when prompted
   * with the name, or the name when prompted with the letter/vowel. Matching
   * mark-to-mark would be trivially visual, so Lightning always asks for the
   * opposite representation. */
  function optionText(word, promptWith) {
    return promptWith === "names" ? word.Form || "" : set.lightningNameText(word);
  }

  function distinctBucketsIn(pool) {
    return new Set(pool.map((r) => set.sortBucket(r)));
  }

  function pickNextWord(pool, excludeKey) {
    if (pool.length === 1) return pool[0];
    let candidate;
    let guard = 0;
    do {
      candidate = pool[Math.floor(Math.random() * pool.length)];
      guard++;
    } while (excludeKey && set.rowKey(candidate) === excludeKey && guard < 20);
    return candidate;
  }

  function livesDisplay(lives, max) {
    return "♥".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, max - lives));
  }

  function backToMenuButton(container, label = "Back to Menu") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      clearActiveTimer();
      state.screen = "menu";
      rerender();
    });
    container.appendChild(btn);
    return btn;
  }

  // ================= Menu =================

  function gamePlayability(game, pool) {
    if (game.key === "sort") {
      if (pool.length < game.minWords) return `Needs at least ${game.minWords} ${set.plural}.`;
      if (distinctBucketsIn(pool).size < set.sortMinBuckets)
        return `Needs at least ${set.sortMinBuckets} different ${set.sortNoun}s among the filtered ${set.plural}.`;
      return null;
    }
    return pool.length >= game.minWords ? null : `Needs at least ${game.minWords} matching ${set.plural}.`;
  }

  function renderMenu(container, pool) {
    container.innerHTML = `
      <h1 class="page-title">${set.title} Games</h1>
      <div class="info-box">
        <b>Instructions</b><br>
        Use the ${set.filters.map((f) => f.label).join(" and ")} filter${set.filters.length > 1 ? "s" : ""} in the sidebar to choose which ${set.plural} are in play, then pick a game below.
      </div>
    `;

    const poolCaption = document.createElement("div");
    poolCaption.className = "caption";
    poolCaption.style.marginBottom = "14px";
    poolCaption.textContent = `${pool.length} ${pool.length === 1 ? set.singular : set.plural} match${pool.length === 1 ? "es" : ""} the current filters.`;
    container.appendChild(poolCaption);

    const grid = document.createElement("div");
    grid.className = "mode-cards";

    for (const game of GAMES) {
      const reason = gamePlayability(game, pool);

      const card = document.createElement("div");
      card.className = "mode-card";

      const top = document.createElement("div");
      const h2 = document.createElement("h2");
      h2.textContent = game.title;
      top.appendChild(h2);
      const p = document.createElement("p");
      p.textContent = game.desc;
      top.appendChild(p);

      const bestCaption = document.createElement("div");
      bestCaption.className = "caption";
      if (game.key === "memory") {
        const bests = [6, 8, 10, 12]
          .map((n) => [n, getHighScore(`memory-${n}`)])
          .filter(([, v]) => v !== null);
        bestCaption.textContent = bests.length
          ? "Best: " + bests.map(([n, v]) => `${n}-pair ${formatTime(v)}`).join(" · ")
          : "No score yet";
      } else if (game.key === "sort") {
        const best = getHighScore("sort");
        bestCaption.textContent = best !== null ? `Best: ${best}` : "No score yet";
      } else {
        const bestN = getHighScore(`${game.key}-names`);
        const bestS = getHighScore(`${game.key}-symbol`);
        const parts = [];
        if (bestN !== null) parts.push(`Name→${set.Singular} ${bestN}`);
        if (bestS !== null) parts.push(`${set.Singular}→${set.Singular} ${bestS}`);
        bestCaption.textContent = parts.length ? "Best: " + parts.join(" · ") : "No score yet";
      }
      top.appendChild(bestCaption);

      if (reason) {
        const warn = document.createElement("div");
        warn.className = "caption";
        warn.style.color = "var(--bad)";
        warn.style.marginTop = "4px";
        warn.textContent = reason;
        top.appendChild(warn);
      }

      card.appendChild(top);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-block";
      btn.textContent = "Play";
      btn.disabled = !!reason;
      btn.addEventListener("click", () => {
        // Always start a game from its setup screen, not from the summary of
        // the last run.
        state[game.key] = null;
        state.screen = game.key;
        rerender();
      });
      card.appendChild(btn);

      grid.appendChild(card);
    }

    container.appendChild(grid);
  }

  // ================= Survival Sprint =================

  function freshSprintState() {
    return {
      step: "setup", // "setup" | "playing" | "over"
      promptWith: "names",
      pool: [],
      lives: 3,
      maxLives: 3,
      score: 0,
      current: null,
      userState: { answer: "" },
      lastResult: null, // { correct, correctText } | null
      isNewHigh: false,
    };
  }

  function renderSprint(container, pool) {
    if (!state.sprint) state.sprint = freshSprintState();
    const s = state.sprint;

    if (s.step === "setup") {
      renderPromptSetup(container, {
        title: "Survival Sprint",
        desc: `Use the ${set.keyboardButtonLabel} to enter the matching ${set.singular} correctly to keep your run alive. Three wrong answers ends it.`,
        promptWith: s.promptWith,
        onPromptChange: (v) => {
          s.promptWith = v;
          rerender();
        },
        onStart: () => {
          s.pool = pool;
          s.lives = s.maxLives;
          s.score = 0;
          s.current = pickNextWord(pool, null);
          s.userState = { answer: "" };
          s.lastResult = null;
          s.step = "playing";
          rerender();
        },
      });
      return;
    }

    if (s.step === "over") {
      renderRunSummary(container, {
        title: "Run Over",
        lines: [`You got ${s.score} correct before running out of lives.`],
        isNewHigh: s.isNewHigh,
        onPlayAgain: () => {
          const promptWith = s.promptWith;
          state.sprint = freshSprintState();
          state.sprint.promptWith = promptWith;
          rerender();
        },
      });
      return;
    }

    // Playing
    const header = document.createElement("div");
    header.className = "button-row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const livesEl = document.createElement("div");
    livesEl.style.fontSize = "1.3rem";
    livesEl.style.color = "var(--bad)";
    livesEl.textContent = livesDisplay(s.lives, s.maxLives);

    const scoreEl = document.createElement("div");
    scoreEl.className = "caption";
    scoreEl.textContent = `Score: ${s.score}`;

    header.appendChild(livesEl);
    header.appendChild(scoreEl);
    container.appendChild(header);

    if (s.lastResult) {
      const resultCaption = document.createElement("div");
      resultCaption.className = "caption";
      resultCaption.style.marginTop = "6px";
      resultCaption.style.color = s.lastResult.correct ? "var(--good)" : "var(--bad)";
      resultCaption.innerHTML = s.lastResult.correct
        ? "Correct!"
        : `Not quite — correct answer: ${wrapHebrewSpans(s.lastResult.correctText)}`;
      container.appendChild(resultCaption);
    }

    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    renderPrompt(container, set, s.current, s.promptWith);

    const inputsWrap = document.createElement("div");
    inputsWrap.style.maxWidth = "500px";
    inputsWrap.style.margin = "0 auto";
    container.appendChild(inputsWrap);

    function submit() {
      const ok = isFormAnswerCorrect(s.current, s.userState.answer);
      recordItemResult(srsMode(s.promptWith), set.rowKey(s.current), ok);
      recordStreakActivity();

      if (ok) {
        s.score += 1;
        s.lastResult = { correct: true };
      } else {
        s.lives -= 1;
        s.lastResult = { correct: false, correctText: primaryAnswerText(s.current) };
      }

      if (s.lives <= 0) {
        s.isNewHigh = maybeSaveHighScore(`sprint-${s.promptWith}`, s.score, true);
        s.step = "over";
        rerender();
        return;
      }

      s.current = pickNextWord(s.pool, set.rowKey(s.current));
      s.userState = { answer: "" };
      rerender();
    }

    renderAnswerInput(inputsWrap, {
      set,
      row: s.current,
      userState: s.userState,
      checked: false,
      onEnter: submit,
      autofocus: true,
    });

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";
    const submitBtn = document.createElement("button");
    submitBtn.className = "btn";
    submitBtn.textContent = "Submit";
    submitBtn.addEventListener("click", submit);
    btnRow.appendChild(submitBtn);
    container.appendChild(btnRow);
  }

  // ================= Beat the Clock =================

  function freshClockState() {
    return {
      step: "setup",
      promptWith: "names",
      pool: [],
      seconds: 60,
      score: 0,
      combo: 0,
      current: null,
      userState: { answer: "" },
      lastResult: null,
      isNewHigh: false,
    };
  }

  function comboMultiplier(combo) {
    return Math.min(5, 1 + Math.floor(combo / 3));
  }

  function renderClock(container, pool) {
    if (!state.clock) state.clock = freshClockState();
    const c = state.clock;

    if (c.step === "setup") {
      renderPromptSetup(container, {
        title: "Beat the Clock",
        desc: "60 seconds on the clock. Answer correctly to score — a run of correct answers builds a multiplier.",
        promptWith: c.promptWith,
        onPromptChange: (v) => {
          c.promptWith = v;
          rerender();
        },
        onStart: () => {
          c.pool = pool;
          c.seconds = 60;
          c.score = 0;
          c.combo = 0;
          c.current = pickNextWord(pool, null);
          c.userState = { answer: "" };
          c.lastResult = null;
          c.step = "playing";
          rerender();
          startCountdown({
            seconds: 60,
            displayId: "letter-game-timer",
            onExpire: () => {
              c.isNewHigh = maybeSaveHighScore(`clock-${c.promptWith}`, c.score, true);
              c.step = "over";
              rerender();
            },
          });
        },
      });
      return;
    }

    if (c.step === "over") {
      renderRunSummary(container, {
        title: "Time's Up",
        lines: [`Final score: ${c.score}`],
        isNewHigh: c.isNewHigh,
        onPlayAgain: () => {
          const promptWith = c.promptWith;
          state.clock = freshClockState();
          state.clock.promptWith = promptWith;
          rerender();
        },
      });
      return;
    }

    const header = document.createElement("div");
    header.className = "button-row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const timerEl = document.createElement("div");
    timerEl.id = "letter-game-timer";
    timerEl.style.fontSize = "1.3rem";
    timerEl.style.fontFamily = "var(--font-mono)";
    timerEl.textContent = String(c.seconds);

    const scoreEl = document.createElement("div");
    scoreEl.className = "caption";
    scoreEl.textContent = `Score: ${c.score} · ×${comboMultiplier(c.combo)}`;

    header.appendChild(timerEl);
    header.appendChild(scoreEl);
    container.appendChild(header);

    if (c.lastResult) {
      const resultCaption = document.createElement("div");
      resultCaption.className = "caption";
      resultCaption.style.marginTop = "6px";
      resultCaption.style.color = c.lastResult.correct ? "var(--good)" : "var(--bad)";
      resultCaption.innerHTML = c.lastResult.correct
        ? `Correct! +${c.lastResult.points}`
        : `Not quite — correct answer: ${wrapHebrewSpans(c.lastResult.correctText)}`;
      container.appendChild(resultCaption);
    }

    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    renderPrompt(container, set, c.current, c.promptWith);

    const inputsWrap = document.createElement("div");
    inputsWrap.style.maxWidth = "500px";
    inputsWrap.style.margin = "0 auto";
    container.appendChild(inputsWrap);

    function submit() {
      const ok = isFormAnswerCorrect(c.current, c.userState.answer);
      recordItemResult(srsMode(c.promptWith), set.rowKey(c.current), ok);
      recordStreakActivity();

      if (ok) {
        const points = comboMultiplier(c.combo);
        c.score += points;
        c.combo += 1;
        c.lastResult = { correct: true, points };
      } else {
        c.combo = 0;
        c.lastResult = { correct: false, correctText: primaryAnswerText(c.current) };
      }

      c.current = pickNextWord(c.pool, set.rowKey(c.current));
      c.userState = { answer: "" };
      rerender();
    }

    renderAnswerInput(inputsWrap, {
      set,
      row: c.current,
      userState: c.userState,
      checked: false,
      onEnter: submit,
      autofocus: true,
    });

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";
    const submitBtn = document.createElement("button");
    submitBtn.className = "btn";
    submitBtn.textContent = "Submit";
    submitBtn.addEventListener("click", submit);
    btnRow.appendChild(submitBtn);
    container.appendChild(btnRow);
  }

  // ================= Lightning Round =================

  const LIGHTNING_QUESTION_SECONDS = 6;
  const LIGHTNING_TOTAL_QUESTIONS = 15;

  function freshLightningState() {
    return {
      step: "setup",
      promptWith: "names",
      questions: [],
      index: 0,
      score: 0,
      options: [],
      answered: false,
      selected: null,
      correctOption: null,
      isNewHigh: false,
    };
  }

  function buildLightningOptions(word, promptWith, pool) {
    const correctText = optionText(word, promptWith);
    // When the mark is the prompt, a vowel written exactly the same way
    // (qameṣ / qameṣ-ḥaṭuf) would also be a "right" answer, so it is never
    // offered as a wrong one.
    const distractPool = pool.filter((r) => r !== word && !(promptWith === "symbol" && r.Form === word.Form));
    const shuffledDistractors = sampleN(distractPool, distractPool.length, false);

    const seen = new Set([correctText.toLowerCase()]);
    const options = [correctText];
    for (const r of shuffledDistractors) {
      if (options.length >= 4) break;
      const text = optionText(r, promptWith);
      const norm = text.toLowerCase();
      if (!text || seen.has(norm)) continue;
      seen.add(norm);
      options.push(text);
    }
    return sampleN(options, options.length, false);
  }

  function renderLightning(container, pool) {
    if (!state.lightning) state.lightning = freshLightningState();
    const l = state.lightning;

    if (l.step === "setup") {
      renderPromptSetup(container, {
        title: "Lightning Round",
        desc: `Multiple choice, ${LIGHTNING_QUESTION_SECONDS} seconds per question. Pick the correct match before time runs out.`,
        promptWith: l.promptWith,
        onPromptChange: (v) => {
          l.promptWith = v;
          rerender();
        },
        onStart: () => {
          const n = Math.min(LIGHTNING_TOTAL_QUESTIONS, pool.length);
          l.questions = sampleN(pool, n, false);
          l.index = 0;
          l.score = 0;
          l.step = "playing";
          startLightningQuestion(pool);
        },
      });
      return;
    }

    if (l.step === "over") {
      const total = l.questions.length;
      const pct = total ? Math.round((l.score / total) * 100) : 0;
      renderRunSummary(container, {
        title: "Round Complete",
        lines: [`Score: ${l.score} / ${total} (${pct}%)`],
        isNewHigh: l.isNewHigh,
        onPlayAgain: () => {
          const promptWith = l.promptWith;
          state.lightning = freshLightningState();
          state.lightning.promptWith = promptWith;
          rerender();
        },
      });
      return;
    }

    // Playing
    const total = l.questions.length;
    const progress = document.createElement("div");
    progress.className = "progress-bar-outer";
    progress.innerHTML = `<div class="progress-bar-inner" style="width:${(l.index / total) * 100}%"></div>`;
    container.appendChild(progress);

    const header = document.createElement("div");
    header.className = "button-row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginTop = "8px";

    const timerEl = document.createElement("div");
    timerEl.id = "letter-game-timer";
    timerEl.style.fontSize = "1.3rem";
    timerEl.style.fontFamily = "var(--font-mono)";
    timerEl.textContent = String(LIGHTNING_QUESTION_SECONDS);

    const scoreEl = document.createElement("div");
    scoreEl.className = "caption";
    scoreEl.textContent = `Question ${l.index + 1} of ${total} · Score: ${l.score}`;

    header.appendChild(timerEl);
    header.appendChild(scoreEl);
    container.appendChild(header);

    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const word = l.questions[l.index];
    renderPrompt(container, set, word, l.promptWith, { showSharedNote: true });

    const optionsGrid = document.createElement("div");
    optionsGrid.className = "game-option-grid game-option-grid-2col";

    for (const opt of l.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn game-option-btn";
      btn.style.textAlign = "center";
      btn.style.direction = l.promptWith === "names" ? "rtl" : "ltr";
      if (l.promptWith === "names") {
        btn.setAttribute("lang", "he");
        btn.innerHTML = wrapHebrewSpans(opt);
      } else {
        btn.textContent = opt;
      }
      if (l.answered) {
        btn.disabled = true;
        if (opt === l.correctOption) btn.classList.add("game-choice-good");
        else if (opt === l.selected) btn.classList.add("game-choice-bad");
      }
      btn.addEventListener("click", () => selectLightningOption(pool, opt));
      optionsGrid.appendChild(btn);
    }
    container.appendChild(optionsGrid);
  }

  function startLightningQuestion(pool) {
    const l = state.lightning;
    const word = l.questions[l.index];
    l.options = buildLightningOptions(word, l.promptWith, pool);
    l.correctOption = optionText(word, l.promptWith);
    l.answered = false;
    l.selected = null;
    rerender();
    startCountdown({
      seconds: LIGHTNING_QUESTION_SECONDS,
      displayId: "letter-game-timer",
      onExpire: () => selectLightningOption(pool, null),
    });
  }

  function selectLightningOption(pool, chosen) {
    const l = state.lightning;
    if (l.answered) return;
    clearActiveTimer();

    const word = l.questions[l.index];
    const ok = chosen === l.correctOption;
    recordItemResult(srsMode(l.promptWith), set.rowKey(word), ok);
    recordStreakActivity();
    if (ok) l.score += 1;

    l.answered = true;
    l.selected = chosen;
    rerender();

    setTimeout(() => {
      l.index += 1;
      if (l.index >= l.questions.length) {
        l.isNewHigh = maybeSaveHighScore(`lightning-${l.promptWith}`, l.score, true);
        l.step = "over";
        rerender();
      } else {
        startLightningQuestion(pool);
      }
    }, 900);
  }

  // ================= Type Sort =================

  const SORT_WORD_SECONDS = 8;

  function freshSortState() {
    return {
      step: "setup",
      pool: [],
      lives: 3,
      maxLives: 3,
      score: 0,
      current: null,
      buckets: [],
      correctBucket: null,
      answered: false,
      selected: null,
      isNewHigh: false,
    };
  }

  function renderSort(container, pool) {
    if (!state.sort) state.sort = freshSortState();
    const so = state.sort;

    if (so.step === "setup") {
      const types = distinctBucketsIn(pool);

      container.innerHTML = `
        <h3>${set.sortTitle}</h3>
        <div class="info-box">
          <b>Instructions</b><br>
          ${set.sortDesc}<br>
          ${pool.length} ${pool.length === 1 ? set.singular : set.plural} across ${types.size} ${set.sortNoun}${types.size === 1 ? "" : "s"} ${pool.length === 1 ? "is" : "are"} in play.
        </div>
      `;
      const startBtn = document.createElement("button");
      startBtn.className = "btn btn-block";
      startBtn.textContent = "Start";
      startBtn.addEventListener("click", () => {
        so.pool = pool;
        so.lives = so.maxLives;
        so.score = 0;
        so.step = "playing";
        startSortWord(pool);
      });
      container.appendChild(startBtn);
      backToMenuButton(container).style.marginTop = "10px";
      return;
    }

    if (so.step === "over") {
      renderRunSummary(container, {
        title: "Run Over",
        lines: [`You sorted ${so.score} ${so.score === 1 ? set.singular : set.plural} correctly.`],
        isNewHigh: so.isNewHigh,
        onPlayAgain: () => {
          state.sort = freshSortState();
          rerender();
        },
      });
      return;
    }

    const header = document.createElement("div");
    header.className = "button-row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const timerEl = document.createElement("div");
    timerEl.id = "letter-game-timer";
    timerEl.style.fontSize = "1.3rem";
    timerEl.style.fontFamily = "var(--font-mono)";
    timerEl.textContent = String(SORT_WORD_SECONDS);

    const rightEl = document.createElement("div");
    rightEl.style.textAlign = "right";
    const livesEl = document.createElement("div");
    livesEl.style.fontSize = "1.1rem";
    livesEl.style.color = "var(--bad)";
    livesEl.textContent = livesDisplay(so.lives, so.maxLives);
    const scoreEl = document.createElement("div");
    scoreEl.className = "caption";
    scoreEl.textContent = `Score: ${so.score}`;
    rightEl.appendChild(livesEl);
    rightEl.appendChild(scoreEl);

    header.appendChild(timerEl);
    header.appendChild(rightEl);
    container.appendChild(header);

    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const wordDiv = document.createElement("div");
    wordDiv.className = "hebrew-display";
    wordDiv.innerHTML = `
      <div><span lang="he" dir="rtl">${so.current.Form || ""}</span></div>
      <div class="gloss-display" style="font-size:1.5rem; margin-top:8px;">${so.current.Name || ""}</div>
    `;
    container.appendChild(wordDiv);

    const bucketGrid = document.createElement("div");
    bucketGrid.className = "game-option-grid";

    for (const bucket of so.buckets) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn game-option-btn";
      btn.textContent = set.sortBucketLabel(bucket);
      if (so.answered) {
        btn.disabled = true;
        if (bucket === so.correctBucket) btn.classList.add("game-choice-good");
        else if (bucket === so.selected) btn.classList.add("game-choice-bad");
      }
      btn.addEventListener("click", () => selectSortBucket(pool, bucket));
      bucketGrid.appendChild(btn);
    }
    container.appendChild(bucketGrid);
  }

  function startSortWord(fullPool) {
    const so = state.sort;
    so.current = pickNextWord(so.pool, so.current ? set.rowKey(so.current) : null);

    const correctType = set.sortBucket(so.current);
    so.correctBucket = correctType;

    const otherTypes = [...distinctBucketsIn(fullPool)].filter((t) => t !== correctType);
    const shuffledOthers = sampleN(otherTypes, otherTypes.length, false).slice(0, 3);
    so.buckets = sampleN([correctType, ...shuffledOthers], 1 + shuffledOthers.length, false);
    so.answered = false;
    so.selected = null;

    rerender();
    startCountdown({
      seconds: SORT_WORD_SECONDS,
      displayId: "letter-game-timer",
      onExpire: () => selectSortBucket(fullPool, null),
    });
  }

  function selectSortBucket(fullPool, chosen) {
    const so = state.sort;
    if (so.answered) return;
    clearActiveTimer();

    const ok = chosen !== null && chosen === set.sortBucket(so.current);

    so.answered = true;
    so.selected = chosen;

    if (ok) {
      so.score += 1;
    } else {
      so.lives -= 1;
    }
    rerender();

    setTimeout(() => {
      if (so.lives <= 0) {
        so.isNewHigh = maybeSaveHighScore("sort", so.score, true);
        so.step = "over";
        rerender();
      } else {
        startSortWord(fullPool);
      }
    }, 900);
  }

  // ================= Memory Match =================

  const MEMORY_PAIR_OPTIONS = [6, 8, 10, 12];

  function freshMemoryState() {
    return {
      step: "setup",
      pairCount: 6,
      cards: [],
      flipped: [],
      matchedKeys: new Set(),
      moves: 0,
      busy: false,
      startedAt: null,
      elapsedAtEnd: null,
      isNewHigh: false,
    };
  }

  function buildMemoryCards(words) {
    const cards = [];
    for (const w of words) {
      const key = set.rowKey(w);
      cards.push({ id: key + "-heb", key, side: "hebrew", word: w });
      cards.push({ id: key + "-eng", key, side: "english", word: w });
    }
    return sampleN(cards, cards.length, false);
  }

  function renderMemory(container, pool) {
    if (!state.memory) state.memory = freshMemoryState();
    const m = state.memory;

    if (m.step === "setup") {
      const options = MEMORY_PAIR_OPTIONS.filter((n) => n <= pool.length);
      container.innerHTML = `
        <h3>Memory Match</h3>
        <div class="info-box">
          <b>Instructions</b><br>
          ${set.memoryDesc}
        </div>
      `;
      if (options.length === 0) {
        const warn = document.createElement("div");
        warn.className = "alert alert-warning";
        warn.textContent = `Not enough ${set.plural} match the current filters for Memory Match.`;
        container.appendChild(warn);
        backToMenuButton(container);
        return;
      }

      const label = document.createElement("div");
      label.className = "sidebar-label";
      label.style.marginBottom = "8px";
      label.textContent = "How many pairs?";
      container.appendChild(label);

      const group = document.createElement("div");
      group.className = "choice-group";
      for (const n of options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn" + (m.pairCount === n ? " selected" : "");
        btn.textContent = `${n} pairs`;
        btn.addEventListener("click", () => {
          m.pairCount = n;
          rerender();
        });
        group.appendChild(btn);
      }
      container.appendChild(group);

      const startBtn = document.createElement("button");
      startBtn.className = "btn btn-block";
      startBtn.style.marginTop = "16px";
      startBtn.textContent = "Start";
      startBtn.addEventListener("click", () => {
        const words = sampleN(pool, m.pairCount, false);
        m.cards = buildMemoryCards(words);
        m.flipped = [];
        m.matchedKeys = new Set();
        m.moves = 0;
        m.busy = false;
        m.startedAt = Date.now();
        m.step = "playing";
        rerender();
        startStopwatch({ displayId: "letter-game-timer" });
      });
      container.appendChild(startBtn);
      backToMenuButton(container).style.marginTop = "10px";
      return;
    }

    if (m.step === "over") {
      const seconds = m.elapsedAtEnd;
      renderRunSummary(container, {
        title: "All Matched!",
        lines: [`${m.moves} moves · ${formatTime(seconds)}`],
        isNewHigh: m.isNewHigh,
        onPlayAgain: () => {
          const pairCount = m.pairCount;
          state.memory = freshMemoryState();
          state.memory.pairCount = pairCount;
          rerender();
        },
      });
      return;
    }

    const header = document.createElement("div");
    header.className = "button-row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const timerEl = document.createElement("div");
    timerEl.id = "letter-game-timer";
    timerEl.style.fontSize = "1.2rem";
    timerEl.style.fontFamily = "var(--font-mono)";
    timerEl.textContent = "0:00";

    const movesEl = document.createElement("div");
    movesEl.className = "caption";
    movesEl.textContent = `Moves: ${m.moves} · ${m.matchedKeys.size} / ${m.pairCount} pairs`;

    header.appendChild(timerEl);
    header.appendChild(movesEl);
    container.appendChild(header);

    container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    const grid = document.createElement("div");
    grid.className = "memory-grid";
    grid.dataset.pairCount = String(m.pairCount);

    for (const card of m.cards) {
      const isMatched = m.matchedKeys.has(card.key);
      const isFlipped = isMatched || m.flipped.some((f) => f.id === card.id);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memory-card" + (isFlipped ? " memory-card-flipped" : "") + (isMatched ? " memory-card-matched" : "");
      btn.disabled = isMatched || m.busy;
      btn.setAttribute("aria-label", isFlipped ? "Card revealed" : "Flip card");

      const inner = document.createElement("div");
      inner.className = "memory-card-inner";

      const front = document.createElement("div");
      front.className = "memory-card-face memory-card-front";
      front.textContent = "?";

      const back = document.createElement("div");
      back.className = "memory-card-face memory-card-back";
      back.innerHTML =
        card.side === "hebrew"
          ? `<span class="memory-card-hebrew">${wrapHebrewSpans(card.word.Form || "")}</span>${
              set.id === "vowels" && isSharedForm(card.word, set.rows())
                ? `<span class="caption" style="display:block;">Class ${card.word.Class}</span>`
                : ""
            }`
          : set.memoryNameHtml(card.word);

      inner.appendChild(front);
      inner.appendChild(back);
      btn.appendChild(inner);

      btn.addEventListener("click", () => flipMemoryCard(card));
      grid.appendChild(btn);
    }
    container.appendChild(grid);
  }

  function flipMemoryCard(card) {
    const m = state.memory;
    if (m.busy) return;
    if (m.matchedKeys.has(card.key)) return;
    if (m.flipped.some((f) => f.id === card.id)) return;
    if (m.flipped.length >= 2) return;

    m.flipped.push(card);

    if (m.flipped.length === 2) {
      m.moves += 1;
      const [a, b] = m.flipped;
      if (a.key === b.key && a.side !== b.side) {
        m.matchedKeys.add(a.key);
        m.flipped = [];
        rerender();
        if (m.matchedKeys.size === m.pairCount) {
          clearActiveTimer();
          m.elapsedAtEnd = Math.round((Date.now() - m.startedAt) / 1000);
          m.isNewHigh = maybeSaveHighScore(`memory-${m.pairCount}`, m.elapsedAtEnd, false);
          m.step = "over";
          rerender();
        }
      } else {
        m.busy = true;
        rerender();
        setTimeout(() => {
          m.flipped = [];
          m.busy = false;
          rerender();
        }, 800);
      }
    } else {
      rerender();
    }
  }

  // ================= Shared game UI pieces =================

  function renderPromptSetup(container, { title, desc, promptWith, onPromptChange, onStart }) {
    container.innerHTML = `<h3>${title}</h3><div class="info-box">${desc}</div>`;

    const label = document.createElement("div");
    label.className = "sidebar-label";
    label.style.marginBottom = "8px";
    label.textContent = "Prompt with:";
    container.appendChild(label);

    const group = document.createElement("div");
    group.className = "choice-group";
    for (const [value, text] of [
      ["names", "Name"],
      ["symbol", set.Singular],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn" + (promptWith === value ? " selected" : "");
      btn.textContent = text;
      btn.addEventListener("click", () => onPromptChange(value));
      group.appendChild(btn);
    }
    container.appendChild(group);

    const startBtn = document.createElement("button");
    startBtn.className = "btn btn-block";
    startBtn.style.marginTop = "16px";
    startBtn.textContent = "Start";
    startBtn.addEventListener("click", onStart);
    container.appendChild(startBtn);

    backToMenuButton(container).style.marginTop = "10px";
  }

  function renderRunSummary(container, { title, lines, isNewHigh, onPlayAgain }) {
    container.innerHTML = `<h2>${title}</h2>`;

    const box = document.createElement("div");
    box.className = "info-box";
    box.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
    if (isNewHigh) {
      const newHigh = document.createElement("div");
      newHigh.style.color = "var(--accent-text)";
      newHigh.style.fontWeight = "600";
      newHigh.style.marginTop = "6px";
      newHigh.textContent = "New high score!";
      box.appendChild(newHigh);
    }
    container.appendChild(box);

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";
    const againBtn = document.createElement("button");
    againBtn.className = "btn";
    againBtn.textContent = "Play Again";
    againBtn.addEventListener("click", onPlayAgain);
    btnRow.appendChild(againBtn);
    container.appendChild(btnRow);

    backToMenuButton(btnRow);
  }


  // ================= Page shell =================

  function render(content, sidebarExtra, navigate) {
    resetSidebarKeepingScroll(sidebarExtra);
    content.innerHTML = "";

    const allRows = set.rows();

    if (!allRows.length) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = `No ${set.plural} data found.`;
      content.appendChild(div);
      return;
    }

    const onMenu = state.screen === "menu";

    // The filters only apply when starting a game, so they're shown on the menu.
    if (onMenu) {
      renderLetterFilters(sidebarExtra, { set, state, pageKey: `${set.pagePrefix}-games`, onChange: rerender });
    }

    const pool = applyLetterFilters(set, allRows, state.filters);

    const bodyWrap = document.createElement("div");
    content.appendChild(bodyWrap);

    switch (state.screen) {
      case "sprint":
        renderSprint(bodyWrap, pool);
        break;
      case "clock":
        renderClock(bodyWrap, pool);
        break;
      case "memory":
        renderMemory(bodyWrap, pool);
        break;
      case "lightning":
        renderLightning(bodyWrap, pool);
        break;
      case "sort":
        renderSort(bodyWrap, pool);
        break;
      default:
        renderMenu(bodyWrap, pool);
    }

    if (onMenu) {
      content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
      const homeBtn = document.createElement("button");
      homeBtn.className = "btn btn-secondary";
      homeBtn.textContent = "Return to Home Page";
      homeBtn.addEventListener("click", () => navigate("home"));
      content.appendChild(homeBtn);
    }
  }

  return { mount, unmount, getAllHighScores };

}
