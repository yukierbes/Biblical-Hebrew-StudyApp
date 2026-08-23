import { getVocabRows, getLessonOrder, getPosOrder } from "../vocab-data.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { wrapHebrewSpans, sampleN } from "../helpers.js";
import { applyVocabFilters, getCategoryOptions, getCategoriesForRow, vocabRowKey } from "../vocab-overrides.js";
import { getRootOptions, applyRootFilter } from "../vocab-roots.js";
import { recordStreakActivity, recordItemResult } from "../srs.js";
import { isAnswerCorrect, primaryAnswerText, renderAnswerInput } from "../vocab-answer-matching.js";

const HIGH_SCORE_KEY = "hebrewVerbApp:vocabGameHighScores";

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
    desc: "Flip cards to pair each Hebrew word with its English meaning in as few moves as possible.",
    minWords: 6,
  },
  {
    key: "lightning",
    title: "Lightning Round",
    desc: "Multiple choice, fast — pick the right translation before time runs out.",
    minWords: 5,
  },
  {
    key: "sort",
    title: "Category Sort",
    desc: "Sort words into their correct category before they get away.",
    minWords: 5,
  },
];

let state = null;
let rerender = null;

function freshState() {
  return {
    filters: { Lesson: [], POS: [], Category: [], Root: [] },
    minFrequency: "",
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
// One timer is ever active at a time. The interval always looks up its
// display element fresh via getElementById on every tick, rather than
// closing over a node captured once — full re-renders (e.g. after
// answering a question) tear down and rebuild the DOM, which would
// otherwise leave the interval updating a detached, invisible element.

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
 * pair-count for Memory Match) — e.g. { "sprint-hebrew": 12,
 * "memory-6": 34 }. Used by the Achievements page. */
export function getAllHighScores() {
  return loadHighScores();
}

/** Records `value` as the new best for `key` if it beats the current
 * one. `higherIsBetter` is false for time-based scores (Memory Match),
 * where a lower number is the win. Returns true if it's a new best. */
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

function srsMode(direction) {
  return "vocab-games-" + direction;
}

function categorizedPool(pool) {
  return pool.filter((r) => getCategoriesForRow(r).length > 0);
}

function distinctCategoriesIn(pool) {
  const set = new Set();
  for (const r of pool) for (const c of getCategoriesForRow(r)) set.add(c);
  return set;
}

function pickNextWord(pool, excludeKey) {
  if (pool.length === 1) return pool[0];
  let candidate;
  let guard = 0;
  do {
    candidate = pool[Math.floor(Math.random() * pool.length)];
    guard++;
  } while (excludeKey && vocabRowKey(candidate) === excludeKey && guard < 20);
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
    const catPool = categorizedPool(pool);
    const cats = distinctCategoriesIn(pool);
    if (catPool.length < game.minWords) return `Needs at least ${game.minWords} categorized words.`;
    if (cats.size < 2) return "Needs at least 2 different categories among the filtered words.";
    return null;
  }
  return pool.length >= game.minWords ? null : `Needs at least ${game.minWords} matching words.`;
}

function renderMenu(container, pool) {
  container.innerHTML = `
    <h1 class="page-title">Vocabulary Games</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the filters in the sidebar to choose which words are in play, then pick a game below.
    </div>
  `;

  const poolCaption = document.createElement("div");
  poolCaption.className = "caption";
  poolCaption.style.marginBottom = "14px";
  poolCaption.textContent = `${pool.length} word${pool.length === 1 ? "" : "s"} match the current filters.`;
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
      const bestH = getHighScore(`${game.key}-hebrew`);
      const bestE = getHighScore(`${game.key}-english`);
      const parts = [];
      if (bestH !== null) parts.push(`Hebrew→English ${bestH}`);
      if (bestE !== null) parts.push(`English→Hebrew ${bestE}`);
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
    direction: "hebrew",
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
    renderDirectionSetup(container, {
      title: "Survival Sprint",
      desc: "Type the translation correctly to keep your run alive. Three wrong answers ends it.",
      direction: s.direction,
      onDirectionChange: (d) => {
        s.direction = d;
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
        const direction = s.direction;
        state.sprint = freshSprintState();
        state.sprint.direction = direction;
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
    resultCaption.textContent = s.lastResult.correct
      ? "Correct!"
      : `Not quite — correct answer: ${s.lastResult.correctText}`;
    container.appendChild(resultCaption);
  }

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  renderGamePrompt(container, s.current, s.direction);

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  container.appendChild(inputsWrap);

  function submit() {
    const ok = isAnswerCorrect(s.direction, s.current, s.userState.answer);
    recordItemResult(srsMode(s.direction), vocabRowKey(s.current), ok);
    recordStreakActivity();

    if (ok) {
      s.score += 1;
      s.lastResult = { correct: true };
    } else {
      s.lives -= 1;
      s.lastResult = { correct: false, correctText: primaryAnswerText(s.current, s.direction) };
    }

    if (s.lives <= 0) {
      s.isNewHigh = maybeSaveHighScore(`sprint-${s.direction}`, s.score, true);
      s.step = "over";
      rerender();
      return;
    }

    s.current = pickNextWord(s.pool, vocabRowKey(s.current));
    s.userState = { answer: "" };
    rerender();
  }

  renderAnswerInput(inputsWrap, {
    direction: s.direction,
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
    direction: "hebrew",
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
    renderDirectionSetup(container, {
      title: "Beat the Clock",
      desc: "60 seconds on the clock. Answer correctly to score — a run of correct answers builds a multiplier.",
      direction: c.direction,
      onDirectionChange: (d) => {
        c.direction = d;
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
          displayId: "vocab-game-timer",
          onExpire: () => {
            c.isNewHigh = maybeSaveHighScore(`clock-${c.direction}`, c.score, true);
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
        const direction = c.direction;
        state.clock = freshClockState();
        state.clock.direction = direction;
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
  timerEl.id = "vocab-game-timer";
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
    resultCaption.textContent = c.lastResult.correct
      ? `Correct! +${c.lastResult.points}`
      : `Not quite — correct answer: ${c.lastResult.correctText}`;
    container.appendChild(resultCaption);
  }

  container.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  renderGamePrompt(container, c.current, c.direction);

  const inputsWrap = document.createElement("div");
  inputsWrap.style.maxWidth = "500px";
  inputsWrap.style.margin = "0 auto";
  container.appendChild(inputsWrap);

  function submit() {
    const ok = isAnswerCorrect(c.direction, c.current, c.userState.answer);
    recordItemResult(srsMode(c.direction), vocabRowKey(c.current), ok);
    recordStreakActivity();

    if (ok) {
      const points = comboMultiplier(c.combo);
      c.score += points;
      c.combo += 1;
      c.lastResult = { correct: true, points };
    } else {
      c.combo = 0;
      c.lastResult = { correct: false, correctText: primaryAnswerText(c.current, c.direction) };
    }

    c.current = pickNextWord(c.pool, vocabRowKey(c.current));
    c.userState = { answer: "" };
    rerender();
  }

  renderAnswerInput(inputsWrap, {
    direction: c.direction,
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
    direction: "hebrew",
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

function buildLightningOptions(word, direction, pool) {
  const correctText = primaryAnswerText(word, direction);
  const distractPool = pool.filter((r) => r !== word);
  const shuffledDistractors = sampleN(distractPool, distractPool.length, false);

  const seen = new Set([correctText.toLowerCase()]);
  const options = [correctText];
  for (const r of shuffledDistractors) {
    if (options.length >= 4) break;
    const text = primaryAnswerText(r, direction);
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
    renderDirectionSetup(container, {
      title: "Lightning Round",
      desc: `Multiple choice, ${LIGHTNING_QUESTION_SECONDS} seconds per question. Pick the correct translation before time runs out.`,
      direction: l.direction,
      onDirectionChange: (d) => {
        l.direction = d;
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
        const direction = l.direction;
        state.lightning = freshLightningState();
        state.lightning.direction = direction;
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
  timerEl.id = "vocab-game-timer";
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
  renderGamePrompt(container, word, l.direction);

  const optionsGrid = document.createElement("div");
  optionsGrid.className = "game-option-grid game-option-grid-2col";

  for (const opt of l.options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn game-option-btn";
    btn.style.textAlign = "center";
    btn.style.direction = l.direction === "hebrew" ? "ltr" : "rtl";
    if (l.direction === "hebrew") {
      btn.textContent = opt;
    } else {
      btn.innerHTML = wrapHebrewSpans(opt);
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
  l.options = buildLightningOptions(word, l.direction, pool);
  l.correctOption = primaryAnswerText(word, l.direction);
  l.answered = false;
  l.selected = null;
  rerender();
  startCountdown({
    seconds: LIGHTNING_QUESTION_SECONDS,
    displayId: "vocab-game-timer",
    onExpire: () => selectLightningOption(pool, null),
  });
}

function selectLightningOption(pool, chosen) {
  const l = state.lightning;
  if (l.answered) return;
  clearActiveTimer();

  const word = l.questions[l.index];
  const ok = chosen === l.correctOption;
  recordItemResult(srsMode(l.direction), vocabRowKey(word), ok);
  recordStreakActivity();
  if (ok) l.score += 1;

  l.answered = true;
  l.selected = chosen;
  rerender();

  setTimeout(() => {
    l.index += 1;
    if (l.index >= l.questions.length) {
      l.isNewHigh = maybeSaveHighScore(`lightning-${l.direction}`, l.score, true);
      l.step = "over";
      rerender();
    } else {
      startLightningQuestion(pool);
    }
  }, 900);
}

// ================= Category Sort =================

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
    const catPool = categorizedPool(pool);
    const allCats = [...distinctCategoriesIn(pool)];

    container.innerHTML = `
      <h3>Category Sort</h3>
      <div class="info-box">
        <b>Instructions</b><br>
        A word appears with its category buckets — sort it into the right one before it gets away.<br>
        ${catPool.length} categorized word${catPool.length === 1 ? "" : "s"} across ${allCats.length} categories are in play.
      </div>
    `;
    const startBtn = document.createElement("button");
    startBtn.className = "btn btn-block";
    startBtn.textContent = "Start";
    startBtn.addEventListener("click", () => {
      so.pool = catPool;
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
      lines: [`You sorted ${so.score} word${so.score === 1 ? "" : "s"} correctly.`],
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
  timerEl.id = "vocab-game-timer";
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
    <div>${wrapHebrewSpans(so.current.Hebrew || "")}</div>
    <div class="gloss-display" style="font-size:1.5rem; margin-top:8px;">${wrapHebrewSpans(so.current.English || "")}</div>
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
  so.current = pickNextWord(so.pool, so.current ? vocabRowKey(so.current) : null);

  const wordCats = getCategoriesForRow(so.current);
  const correctCat = wordCats[Math.floor(Math.random() * wordCats.length)];
  so.correctBucket = correctCat;

  const otherCats = [...distinctCategoriesIn(fullPool)].filter((c) => !wordCats.includes(c));
  const shuffledOthers = sampleN(otherCats, otherCats.length, false).slice(0, 3);
  so.buckets = sampleN([correctCat, ...shuffledOthers], 1 + shuffledOthers.length, false);
  so.answered = false;
  so.selected = null;

  rerender();
  startCountdown({
    seconds: SORT_WORD_SECONDS,
    displayId: "vocab-game-timer",
    onExpire: () => selectSortBucket(fullPool, null),
  });
}

function selectSortBucket(fullPool, chosen) {
  const so = state.sort;
  if (so.answered) return;
  clearActiveTimer();

  const wordCats = getCategoriesForRow(so.current);
  const ok = chosen !== null && wordCats.includes(chosen);

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
    const key = vocabRowKey(w);
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
        Flip two cards at a time to find each Hebrew↔English pair. Fewer moves and less time is better.
      </div>
    `;
    if (options.length === 0) {
      const warn = document.createElement("div");
      warn.className = "alert alert-warning";
      warn.textContent = "Not enough words match the current filters for Memory Match.";
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
      startStopwatch({ displayId: "vocab-game-timer" });
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
  timerEl.id = "vocab-game-timer";
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
        ? `<span class="memory-card-hebrew">${wrapHebrewSpans(card.word.Hebrew || "")}</span>`
        : `<span class="memory-card-english">${wrapHebrewSpans(card.word.English || "")}</span>`;

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

function renderDirectionSetup(container, { title, desc, direction, onDirectionChange, onStart }) {
  container.innerHTML = `<h3>${title}</h3><div class="info-box">${desc}</div>`;

  const label = document.createElement("div");
  label.className = "sidebar-label";
  label.style.marginBottom = "8px";
  label.textContent = "Prompt with:";
  container.appendChild(label);

  const group = document.createElement("div");
  group.className = "choice-group";
  for (const [value, text] of [
    ["hebrew", "Hebrew → type English"],
    ["english", "English → type Hebrew"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn" + (direction === value ? " selected" : "");
    btn.textContent = text;
    btn.addEventListener("click", () => onDirectionChange(value));
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

function renderGamePrompt(container, word, direction) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  if (direction === "hebrew") {
    div.innerHTML = wrapHebrewSpans(word.Hebrew || "");
  } else {
    div.innerHTML = `<span class="gloss-display" style="font-size:2.1rem; color:var(--ink); margin-top:0; direction:ltr; unicode-bidi:isolate;">${wrapHebrewSpans(word.English || "")}</span>`;
  }
  container.appendChild(div);
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
  const __sidebarScrollTop = sidebarExtra.scrollTop;
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    sidebarExtra.scrollTop = __sidebarScrollTop;
  });
  content.innerHTML = "";

  const allRows = getVocabRows();

  if (!allRows.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No vocabulary data found.";
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
      state.filters = { Lesson: [], POS: [], Category: [], Root: [] };
      state.minFrequency = "";
      rerender();
    });
    filterWrap.appendChild(resetBtn);

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "vocab-games",
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
    freqInput.addEventListener("change", () => rerender());
    freqDiv.appendChild(freqLabel);
    freqDiv.appendChild(freqInput);
    filterWrap.appendChild(freqDiv);

    sidebarExtra.appendChild(filterWrap);
  }

  const pool = applyRootFilter(applyVocabFilters(allRows, state.filters, state.minFrequency), state.filters.Root);

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
