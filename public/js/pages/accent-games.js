import { getAccentRows, getTypeOrder, getGroupOrder } from "../accent-data.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { wrapHebrewSpans, sampleN } from "../helpers.js";
import { applyAccentFilters, accentRowKey } from "../accent-filters.js";
import { recordStreakActivity, recordItemResult } from "../srs.js";
import {
  isAccentAnswerCorrect,
  renderAccentPrompt,
  renderAccentAnswerInput,
  primaryAccentAnswerText,
} from "../accent-answer-matching.js";

const HIGH_SCORE_KEY = "hebrewVerbApp:accentGameHighScores";

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
    desc: "Flip cards to pair each accent's Hebrew name with its English name in as few moves as possible.",
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
    title: "Type Sort",
    desc: "Sort each accent into its correct Type before it gets away.",
    minWords: 5,
  },
];

let state = null;
let rerender = null;

function freshState() {
  return {
    filters: { Type: [], Group: [] },
    screen: "menu", // "menu" | one of GAMES' keys
    timerId: null,
    sprint: null,
    clock: null,
    memory: null,
    lightning: null,
    sort: null,
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();
  rerender = () => render(content, sidebarExtra, navigate);
  rerender();
}

export function unmount() {
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
export function getAllHighScores() {
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
  return "accent-games-" + promptWith;
}

/** For Lightning Round's multiple choice, "the other side" from
 * whatever's shown as the prompt: the Symbol when prompted with the
 * Names, or the English Name when prompted with the Symbol. Matching
 * symbol-to-symbol would be trivially visual, so Lightning always asks
 * for the opposite representation. */
function optionText(word, promptWith) {
  return promptWith === "names" ? word.Symbol || "" : word.EnglishName || "";
}

function distinctTypesIn(pool) {
  return new Set(pool.map((r) => r.Type));
}

function pickNextWord(pool, excludeKey) {
  if (pool.length === 1) return pool[0];
  let candidate;
  let guard = 0;
  do {
    candidate = pool[Math.floor(Math.random() * pool.length)];
    guard++;
  } while (excludeKey && accentRowKey(candidate) === excludeKey && guard < 20);
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
    if (pool.length < game.minWords) return `Needs at least ${game.minWords} accents.`;
    if (distinctTypesIn(pool).size < 2) return "Needs at least 2 different Types among the filtered accents.";
    return null;
  }
  return pool.length >= game.minWords ? null : `Needs at least ${game.minWords} matching accents.`;
}

function renderMenu(container, pool) {
  container.innerHTML = `
    <h1 class="page-title">Accents Games</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the Type and Group filters in the sidebar to choose which accents are in play, then pick a game below.
    </div>
  `;

  const poolCaption = document.createElement("div");
  poolCaption.className = "caption";
  poolCaption.style.marginBottom = "14px";
  poolCaption.textContent = `${pool.length} accent${pool.length === 1 ? "" : "s"} match the current filters.`;
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
      if (bestN !== null) parts.push(`Names→Symbol ${bestN}`);
      if (bestS !== null) parts.push(`Symbol→Symbol ${bestS}`);
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
      desc: "Use the Accent Keyboard to enter the matching accent correctly to keep your run alive. Three wrong answers ends it.",
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

  renderAccentPrompt(container, s.current, s.promptWith);

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  container.appendChild(inputsWrap);

  function submit() {
    const ok = isAccentAnswerCorrect(s.current, s.userState.answer);
    recordItemResult(srsMode(s.promptWith), accentRowKey(s.current), ok);
    recordStreakActivity();

    if (ok) {
      s.score += 1;
      s.lastResult = { correct: true };
    } else {
      s.lives -= 1;
      s.lastResult = { correct: false, correctText: primaryAccentAnswerText(s.current) };
    }

    if (s.lives <= 0) {
      s.isNewHigh = maybeSaveHighScore(`sprint-${s.promptWith}`, s.score, true);
      s.step = "over";
      rerender();
      return;
    }

    s.current = pickNextWord(s.pool, accentRowKey(s.current));
    s.userState = { answer: "" };
    rerender();
  }

  renderAccentAnswerInput(inputsWrap, {
    word: s.current,
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
          displayId: "accent-game-timer",
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
  timerEl.id = "accent-game-timer";
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

  renderAccentPrompt(container, c.current, c.promptWith);

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  container.appendChild(inputsWrap);

  function submit() {
    const ok = isAccentAnswerCorrect(c.current, c.userState.answer);
    recordItemResult(srsMode(c.promptWith), accentRowKey(c.current), ok);
    recordStreakActivity();

    if (ok) {
      const points = comboMultiplier(c.combo);
      c.score += points;
      c.combo += 1;
      c.lastResult = { correct: true, points };
    } else {
      c.combo = 0;
      c.lastResult = { correct: false, correctText: primaryAccentAnswerText(c.current) };
    }

    c.current = pickNextWord(c.pool, accentRowKey(c.current));
    c.userState = { answer: "" };
    rerender();
  }

  renderAccentAnswerInput(inputsWrap, {
    word: c.current,
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
  const distractPool = pool.filter((r) => r !== word);
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
  timerEl.id = "accent-game-timer";
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
  renderAccentPrompt(container, word, l.promptWith);

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
    displayId: "accent-game-timer",
    onExpire: () => selectLightningOption(pool, null),
  });
}

function selectLightningOption(pool, chosen) {
  const l = state.lightning;
  if (l.answered) return;
  clearActiveTimer();

  const word = l.questions[l.index];
  const ok = chosen === l.correctOption;
  recordItemResult(srsMode(l.promptWith), accentRowKey(word), ok);
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
    const types = distinctTypesIn(pool);

    container.innerHTML = `
      <h3>Type Sort</h3>
      <div class="info-box">
        <b>Instructions</b><br>
        An accent appears with its Type buckets — sort it into the right one before it gets away.<br>
        ${pool.length} accent${pool.length === 1 ? "" : "s"} across ${types.size} Types are in play.
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
      lines: [`You sorted ${so.score} accent${so.score === 1 ? "" : "s"} correctly.`],
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
  timerEl.id = "accent-game-timer";
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
    <div><span lang="he" dir="rtl">${so.current.Symbol || ""}</span></div>
    <div class="gloss-display" style="font-size:1.5rem; margin-top:8px;">${wrapHebrewSpans(so.current.HebrewName || "")} · ${so.current.EnglishName || ""}</div>
  `;
  container.appendChild(wordDiv);

  const bucketGrid = document.createElement("div");
  bucketGrid.className = "game-option-grid";

  for (const bucket of so.buckets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn game-option-btn";
    btn.textContent = bucket;
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
  so.current = pickNextWord(so.pool, so.current ? accentRowKey(so.current) : null);

  const correctType = so.current.Type;
  so.correctBucket = correctType;

  const otherTypes = [...distinctTypesIn(fullPool)].filter((t) => t !== correctType);
  const shuffledOthers = sampleN(otherTypes, otherTypes.length, false).slice(0, 3);
  so.buckets = sampleN([correctType, ...shuffledOthers], 1 + shuffledOthers.length, false);
  so.answered = false;
  so.selected = null;

  rerender();
  startCountdown({
    seconds: SORT_WORD_SECONDS,
    displayId: "accent-game-timer",
    onExpire: () => selectSortBucket(fullPool, null),
  });
}

function selectSortBucket(fullPool, chosen) {
  const so = state.sort;
  if (so.answered) return;
  clearActiveTimer();

  const ok = chosen !== null && chosen === so.current.Type;

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
    const key = accentRowKey(w);
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
        Flip two cards at a time to find each accent's Hebrew name ↔ English name pair. Fewer moves and less time is better.
      </div>
    `;
    if (options.length === 0) {
      const warn = document.createElement("div");
      warn.className = "alert alert-warning";
      warn.textContent = "Not enough accents match the current filters for Memory Match.";
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
      startStopwatch({ displayId: "accent-game-timer" });
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
  timerEl.id = "accent-game-timer";
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
        ? `<span class="memory-card-hebrew">${wrapHebrewSpans(card.word.HebrewName || "")}</span>`
        : `<span class="memory-card-english">${card.word.EnglishName || ""}</span>`;

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
    ["names", "Hebrew/English Name"],
    ["symbol", "Symbol"],
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

  const allRows = getAccentRows();

  if (!allRows.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No accents data found.";
    content.appendChild(div);
    return;
  }

  const onMenu = state.screen === "menu";

  if (onMenu) {
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
    pageKey: "accent-games",
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

  const pool = applyAccentFilters(allRows, state.filters);

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
