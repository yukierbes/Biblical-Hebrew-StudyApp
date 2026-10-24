// Shared engine for the "… in Context" practice pages (Definite Article, Dagesh, and later topics).
//
// Every page has the same four tabs, so they look and behave the same:
//   Guided passage   — steps through every example in a short passage, one question at a time
//   Pattern quiz     — 10 questions from across Genesis, then a score and a review of the missed ones
//   Find the …       — tap the words that have it
//   Pattern guide    — the patterns, with real examples
//
// A page supplies a small config (what is highlighted, how to describe it, what to tap in "Find",
// and how to draw the guide). The answer buttons show only the names of the patterns; the
// description is shown AFTER an answer is chosen, so the learner has to recall it first.

import { loadBibleData } from "./bible-data.js";
import { buildVerse, buildLetterVerse, prettyRef, getShowAccents, setShowAccents, wordHtml, hebrewHtml } from "./bible-text.js";
import { recordAttempt } from "./history.js";
import { recordStreakActivity, recordItemResult } from "./srs.js";
import { bibleSrsMode, exampleKey } from "./bible-areas.js";

const QUIZ_LENGTH = 10;

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.innerHTML = hebrewHtml(text); // Hebrew in any text uses the app's Hebrew font
  return e;
};
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------------
// Pieces other pages can use (the Daily Challenge asks the same questions)
// ---------------------------------------------------------------------

/** Every page registers its configuration here when its module loads, keyed by its history mode ("bible-dagesh"). */
const registry = new Map();
export function getPracticeConfig(historyMode) {
  return registry.get(historyMode) || null;
}
export function registeredPracticePages() {
  return [...registry.keys()];
}

const patternIn = (data, id) => data.patterns.find((p) => p.id === id);
const groupIn = (data, patternId) => data.groups.find((g) => g.patterns.includes(patternId));

/** The answer boxes for one example: [{ title, choices:[{id,label}], answer }]. */
export function answerPartsFor(config, data, ex) {
  if (config.answerParts) return config.answerParts(data).map((p) => ({ title: p.title, choices: p.choices, answer: p.answerOf(ex) }));
  const main = {
    title: config.mainPartTitle || "",
    choices: data.groups.map((g) => ({ id: g.id, label: g.label })),
    answer: groupIn(data, ex.pattern).id,
  };
  const extra = config.extraPart ? config.extraPart(data) : null;
  return extra ? [main, { title: extra.title, choices: extra.choices, answer: extra.answerOf(ex) }] : [main];
}

/**
 * One question as plain data, so it can be saved and drawn later without the dataset:
 *   { page, key, ex, words (the verse), parts, promptText, explainHtml }
 */
export function makeBibleQuestion(config, data, ex) {
  const words = data.verses[ex.ref];
  const target = words[ex.wi];
  const pattern = patternIn(data, ex.pattern);
  return {
    page: config.historyMode,
    key: exampleKey(ex),
    ex,
    words,
    parts: answerPartsFor(config, data, ex),
    promptText: config.promptText,
    explainHtml: `${config.describe(target, ex)} ${hebrewHtml(pattern.explain)}${target.n ? " " + hebrewHtml(target.n) : ""}`,
  };
}

/**
 * Draws a question made by makeBibleQuestion: the verse (or just the word), the prompt and the answer boxes.
 *   picked   { [partIndex]: choiceId } to show as chosen
 *   graded   true once answered: the right choices turn green and a wrong pick red
 *   onPick   (partIndex, choiceId) when a choice is tapped
 */
export function drawBibleQuestion(host, bq, { showAccents = true, picked = {}, graded = false, onPick = () => {} } = {}) {
  const config = getPracticeConfig(bq.page);
  const ex = bq.ex;
  const target = bq.words[ex.wi];
  host.appendChild(el("div", "caption", prettyRef(ex.ref)));
  if (config && config.questionDisplay) {
    host.appendChild(buildVerse(bq.words, { showAccents }));
    host.appendChild(config.questionDisplay({ ex, target, data: null, showAccents }));
  } else {
    const m = (w) => (config ? config.markWord(w, ex) : {});
    host.appendChild(
      buildVerse(bq.words, {
        showAccents,
        mark: (wi, w) => (wi === ex.wi ? m(w).markPiece ?? -1 : -1),
        markLetter: (wi, w) => (wi === ex.wi ? m(w).markLetter ?? -1 : -1),
      })
    );
  }
  host.appendChild(el("p", "bible-prompt", bq.promptText));
  bq.parts.forEach((part, pi) => {
    const wrap = el("div", "bible-part");
    if (bq.parts.length > 1 && part.title) wrap.appendChild(el("p", "caption bible-part-title", part.title));
    const group = el("div", "bible-choices" + (part.choices.length > 4 ? " bible-choices-grid" : ""));
    for (const c of part.choices) {
      const b = el("button", "bible-choice", c.label);
      b.type = "button";
      b.dataset.choice = c.id;
      if (graded) {
        b.disabled = true;
        if (c.id === part.answer) b.classList.add("is-correct");
        else if (c.id === picked[pi]) b.classList.add("is-wrong");
      } else {
        if (picked[pi] === c.id) b.classList.add("is-picked");
        b.addEventListener("click", () => {
          for (const other of group.children) other.classList.toggle("is-picked", other === b);
          onPick(pi, c.id);
        });
      }
      group.appendChild(b);
    }
    wrap.appendChild(group);
    host.appendChild(wrap);
  });
}

/**
 * config = {
 *   dataset, historyMode, title, intro,
 *   promptText,                       // the question above the answer buttons
 *   noun,                             // "article" / "dagesh" (used in a few labels)
 *   markWord(word, ex) -> { markPiece } | { markLetter }   // what to highlight for an example
 *   steps(data, passage) -> [{ref, wi, pattern, ...}]      // the questions in a guided passage
 *   describe(word, ex) -> html        // "This word is …" sentence start, shown after answering
 *   findTab: { label, prompt, key legend…, isTarget(word), candidate(words), trap(word) -> message|null, legend }
 *   renderGuide(body, ctx)            // fills the Pattern guide tab
 * }
 */
export function createPractice(config) {
  registry.set(config.historyMode, config);
  let state = null;
  let data = null;
  const TABS = [
    ["guided", "Guided passage"],
    ["quiz", "Pattern quiz"],
    ["find", config.thirdTab ? config.thirdTab.label : config.findTab.label],
    ["guide", "Pattern guide"],
  ];

  const patternById = (id) => data.patterns.find((p) => p.id === id);
  const groupOf = (patternId) => data.groups.find((g) => g.patterns.includes(patternId));

  async function mount({ content, sidebarExtra }) {
    state = { tab: "guided", showAccents: getShowAccents(), passage: 0, guided: null, quiz: null, find: null, alive: true };
    content.innerHTML = '<div class="loading">Loading Genesis…</div>';
    try {
      data = await loadBibleData(config.dataset);
    } catch (e) {
      content.innerHTML = "";
      content.appendChild(el("div", "alert alert-warning", "Could not load the Bible data. Please check your connection and try again."));
      return;
    }
    if (!state || !state.alive) return;
    render(content, sidebarExtra);
  }

  function unmount() {
    if (state) state.alive = false;
    state = null;
  }

  function render(content, sidebarExtra) {
    sidebarExtra.innerHTML = "";
    sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));
    const sec = el("div", "sidebar-section");
    sec.appendChild(el("h3", "sidebar-title", "Display"));
    const label = el("label", "bible-check");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.showAccents;
    cb.addEventListener("change", () => {
      state.showAccents = cb.checked;
      setShowAccents(cb.checked);
      render(content, sidebarExtra);
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" Show accent marks"));
    sec.appendChild(label);
    sec.appendChild(el("p", "caption", "Accent marks can be hidden to focus on the vowels and dagesh. Nothing else about the text changes."));
    sidebarExtra.appendChild(sec);

    content.innerHTML = "";
    content.appendChild(el("h1", "page-title", config.title));
    content.appendChild(el("p", "caption", `${config.intro} Source: ${data.source.name} (see Sources & Credits).`));

    const tabs = el("div", "choice-group bible-tabs");
    for (const [id, text] of TABS) {
      const b = el("button", "choice-btn" + (state.tab === id ? " selected" : ""), text);
      b.type = "button";
      b.addEventListener("click", () => {
        state.tab = id;
        render(content, sidebarExtra);
      });
      tabs.appendChild(b);
    }
    content.appendChild(tabs);

    const body = el("div", "bible-body");
    content.appendChild(body);
    const again = () => render(content, sidebarExtra);
    if (state.tab === "guided") renderGuided(body, again);
    else if (state.tab === "quiz") renderQuiz(body, again);
    else if (state.tab === "find" && config.thirdTab) config.thirdTab.render(body, { data, el, state, rerender: again, showAccents: state.showAccents, prettyRef, hebrewHtml, recordStreakActivity });
    else if (state.tab === "find") renderFind(body, again);
    else config.renderGuide(body, { data, el, showAccents: state.showAccents, patternById, wordHtml, hebrewHtml });
  }

  // ---------- one question about one example ----------

  /** The highlighted verse for an example, as an element. */
  function verseFor(ex, extra = {}) {
    const words = data.verses[ex.ref];
    return buildVerse(words, {
      showAccents: state.showAccents,
      mark: (wi, w) => (wi === ex.wi ? (config.markWord(w, ex).markPiece ?? -1) : -1),
      markLetter: (wi, w) => (wi === ex.wi ? (config.markWord(w, ex).markLetter ?? -1) : -1),
      ...extra,
    });
  }

  /** Shows the verse, the answer buttons (names only), and — after an answer — the explanation. */
  function question(host, ex, { onAnswered, showVerse = true }) {
    const words = data.verses[ex.ref];
    const target = words[ex.wi];
    host.appendChild(el("div", "caption", prettyRef(ex.ref)));
    if (config.questionDisplay) {
      if (showVerse) host.appendChild(verseFor(ex));
      host.appendChild(config.questionDisplay({ ex, target, data, showAccents: state.showAccents }));
    } else if (showVerse) host.appendChild(verseFor(ex));
    else {
      // The guided passage above already shows the verse with this word highlighted; show just the word here.
      const one = el("div", "bible-verse bible-one-word");
      one.setAttribute("lang", "he");
      one.setAttribute("dir", "rtl");
      const m = config.markWord(target, ex);
      one.innerHTML = `<span class="bible-word">${wordHtml(target, { ...m, showAccents: state.showAccents })}</span>`;
      host.appendChild(one);
    }
    host.appendChild(el("p", "bible-prompt", config.promptText));

    // The answer boxes. Most pages have one (the pattern group); a page may add a second (e.g. Pronominal
    // Suffixes: Type 1 / Type 2, and the person-gender-number). Correctness is judged when every box has an answer.
    const parts = answerParts(ex);
    const feedback = el("div", "bible-feedback");
    const chosen = {};
    let done = false;
    const rows = parts.map((part, pi) => {
      const wrap = el("div", "bible-part");
      if (parts.length > 1 && part.title) wrap.appendChild(el("p", "caption bible-part-title", part.title));
      const group = el("div", "bible-choices" + (part.choices.length > 4 ? " bible-choices-grid" : ""));
      for (const c of part.choices) {
        const b = el("button", "bible-choice", c.label);
        b.type = "button";
        b.dataset.choice = c.id;
        b.addEventListener("click", () => {
          if (done) return;
          chosen[pi] = c.id;
          for (const other of group.children) other.classList.toggle("is-picked", other === b);
          if (parts.every((_, k) => chosen[k] !== undefined)) evaluate();
        });
        group.appendChild(b);
      }
      wrap.appendChild(group);
      host.appendChild(wrap);
      return group;
    });
    host.appendChild(feedback);

    function evaluate() {
      done = true;
      let allRight = true;
      parts.forEach((part, pi) => {
        const right = chosen[pi] === part.answer;
        if (!right) allRight = false;
        for (const btn of rows[pi].children) {
          btn.disabled = true;
          btn.classList.remove("is-picked");
          if (btn.dataset.choice === part.answer) btn.classList.add("is-correct");
          else if (btn.dataset.choice === chosen[pi]) btn.classList.add("is-wrong");
        }
      });
      const pattern = patternById(ex.pattern);
      feedback.innerHTML = "";
      feedback.className = "bible-feedback " + (allRight ? "is-correct" : "is-wrong");
      feedback.appendChild(el("strong", "", allRight ? "Correct. " : `Not quite: this is ${answerLabel(ex)}. `));
      const span = document.createElement("span");
      span.innerHTML = `${config.describe(target, ex)} ${hebrewHtml(pattern.explain)}${target.n ? " " + hebrewHtml(target.n) : ""}`;
      feedback.appendChild(span);
      recordStreakActivity();
      recordItemResult(bibleSrsMode(config.historyMode), exampleKey(ex), allRight); // so Home, My Progress and the Daily Challenge know
      const chosenLabel = parts.map((part, pi) => part.choices.find((c) => c.id === chosen[pi]).label).join(" · ");
      onAnswered(allRight, { label: chosenLabel });
    }
  }

  /** The answer boxes for one example: [{ title, choices:[{id,label}], answer }]. */
  function answerParts(ex) {
    return answerPartsFor(config, data, ex);
  }

  /** The correct answer as words, e.g. "Type 2 · 3MS". */
  function answerLabel(ex) {
    return answerParts(ex)
      .map((p) => p.choices.find((c) => c.id === p.answer).label)
      .join(" · ");
  }

  // ---------- Guided passage ----------

  function renderGuided(body, rerender) {
    const passage = data.passages[state.passage] || data.passages[0];
    if (!passage) {
      body.appendChild(el("div", "alert alert-warning", "No passages are available."));
      return;
    }
    const picker = el("div", "choice-group");
    data.passages.forEach((p, i) => {
      const b = el("button", "choice-btn" + (i === state.passage ? " selected" : ""), p.title);
      b.type = "button";
      b.addEventListener("click", () => {
        state.passage = i;
        state.guided = null;
        rerender();
      });
      picker.appendChild(b);
    });
    body.appendChild(picker);

    const steps = config.steps(data, passage);
    if (!state.guided || state.guided.passage !== state.passage) state.guided = { passage: state.passage, step: 0, results: [] };
    const g = state.guided;
    const current = g.step < steps.length ? steps[g.step] : null;

    const passageBox = el("div", "bible-passage");
    for (const ref of passage.verses) {
      const row = el("div", "bible-verse-row" + (current && current.ref === ref ? " is-current" : ""));
      row.appendChild(el("span", "bible-vn", ref.split(".")[2]));
      row.appendChild(verseFor(current && current.ref === ref ? current : { ref, wi: -1 }, { showAccents: state.showAccents }));
      passageBox.appendChild(row);
    }
    body.appendChild(passageBox);

    if (!current) {
      const right = g.results.filter(Boolean).length;
      body.appendChild(el("h2", "", `Passage finished: ${right} of ${steps.length} correct`));
      const table = el("table", "bible-summary");
      const head = el("tr");
      for (const h of ["Word", "Reference", "Pattern"]) head.appendChild(el("th", "", h));
      table.appendChild(head);
      steps.forEach((s, i) => {
        const w = data.verses[s.ref][s.wi];
        const tr = el("tr");
        const td1 = el("td");
        td1.innerHTML = `<span lang="he" dir="rtl" class="bible-inline">${wordHtml(w, { ...config.markWord(w, s), showAccents: state.showAccents })}</span>`;
        tr.appendChild(td1);
        tr.appendChild(el("td", "", prettyRef(s.ref)));
        tr.appendChild(el("td", "", `${answerLabel(s)}${g.results[i] ? "" : " (missed)"}`));
        table.appendChild(tr);
      });
      const wrap = el("div", "table-scroll");
      wrap.appendChild(table);
      body.appendChild(wrap);
      const again = el("button", "btn", "Walk through it again");
      again.type = "button";
      again.addEventListener("click", () => {
        state.guided = null;
        rerender();
      });
      body.appendChild(again);
      return;
    }

    const stepBox = el("div", "bible-step");
    stepBox.appendChild(el("div", "caption", `${config.noun[0].toUpperCase() + config.noun.slice(1)} ${g.step + 1} of ${steps.length}`));
    const bar = el("div", "progress-bar-outer");
    const fill = el("div", "progress-bar-inner");
    fill.style.width = `${(g.step / steps.length) * 100}%`;
    bar.appendChild(fill);
    stepBox.appendChild(bar);
    const q = el("div", "bible-question");
    const next = el("button", "btn", g.step === steps.length - 1 ? "Finish" : `Next ${config.noun}`);
    next.type = "button";
    next.hidden = true;
    next.addEventListener("click", () => {
      g.step += 1;
      rerender();
    });
    question(q, current, {
      showVerse: false,
      onAnswered: (correct) => {
        g.results[g.step] = correct;
        next.hidden = false;
      },
    });
    stepBox.appendChild(q);
    stepBox.appendChild(next);
    body.appendChild(stepBox);
  }

  // ---------- Pattern quiz ----------

  function buildQuizQuestions() {
    const byGroup = {};
    for (const ex of data.examples) (byGroup[groupOf(ex.pattern).id] ||= []).push(ex);
    const order = shuffle(Object.keys(byGroup));
    const keyOf = (e) => `${e.ref}#${e.wi}#${e.li ?? ""}`;
    const used = new Set();
    const out = [];
    for (let i = 0; i < QUIZ_LENGTH; i++) {
      // one pattern group per question, cycling through them so the rarer patterns appear;
      // if a group has run out of examples, any unused example fills the place
      let pool = byGroup[order[i % order.length]].filter((e) => !used.has(keyOf(e)));
      if (!pool.length) pool = data.examples.filter((e) => !used.has(keyOf(e)));
      if (!pool.length) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      used.add(keyOf(pick));
      out.push(pick);
    }
    return shuffle(out);
  }

  function renderQuiz(body, rerender) {
    if (!state.quiz) {
      body.appendChild(el("p", "", `${QUIZ_LENGTH} questions from across Genesis. Each shows one verse with one ${config.noun} highlighted. Choose what is happening. All patterns included.`));
      const start = el("button", "btn", "Start quiz");
      start.type = "button";
      start.addEventListener("click", () => {
        state.quiz = { questions: buildQuizQuestions(), i: 0, score: 0, answers: [], recorded: false, retry: false };
        rerender();
      });
      body.appendChild(start);
      return;
    }
    const quiz = state.quiz;
    if (quiz.i >= quiz.questions.length) return renderQuizSummary(body, quiz, rerender);

    body.appendChild(el("div", "caption", `Question ${quiz.i + 1} of ${quiz.questions.length}`));
    const bar = el("div", "progress-bar-outer");
    const fill = el("div", "progress-bar-inner");
    fill.style.width = `${(quiz.i / quiz.questions.length) * 100}%`;
    bar.appendChild(fill);
    body.appendChild(bar);
    const q = el("div", "bible-question");
    const next = el("button", "btn", quiz.i === quiz.questions.length - 1 ? "See score" : "Next question");
    next.type = "button";
    next.hidden = true;
    next.addEventListener("click", () => {
      quiz.i += 1;
      rerender();
    });
    question(q, quiz.questions[quiz.i], {
      onAnswered: (correct, chosen) => {
        quiz.answers[quiz.i] = { ex: quiz.questions[quiz.i], correct, chosen: chosen.label };
        if (correct) quiz.score += 1;
        next.hidden = false;
      },
    });
    body.appendChild(q);
    body.appendChild(next);
  }

  /** Score, then a review of every question that was missed. */
  function renderQuizSummary(body, quiz, rerender) {
    const total = quiz.questions.length;
    const percent = Math.round((quiz.score / total) * 100);
    if (!quiz.recorded) {
      recordAttempt(config.historyMode, { score: quiz.score, total, percent, datasets: ["Genesis"], retry: quiz.retry });
      quiz.recorded = true;
    }
    body.appendChild(el("h2", "", `Score: ${quiz.score} of ${total} (${percent}%)`));
    const missed = quiz.answers.filter((a) => a && !a.correct);
    if (!missed.length) {
      body.appendChild(el("div", "bible-feedback is-correct", "Every question correct."));
    } else {
      body.appendChild(el("h3", "", `Review of missed questions (${missed.length})`));
      for (const a of missed) {
        const card = el("div", "bible-guide-card bible-review");
        card.appendChild(el("div", "caption", prettyRef(a.ex.ref)));
        card.appendChild(verseFor(a.ex));
        const right = patternById(a.ex.pattern);
        const word = data.verses[a.ex.ref][a.ex.wi];
        const p = el("p");
        p.innerHTML = `<strong>Your answer:</strong> ${hebrewHtml(a.chosen)}<br><strong>Correct answer:</strong> ${hebrewHtml(answerLabel(a.ex))}<br>${config.describe(word, a.ex)} ${hebrewHtml(right.explain)}${word.n ? " " + hebrewHtml(word.n) : ""}`;
        card.appendChild(p);
        body.appendChild(card);
      }
    }
    const row = el("div", "button-row");
    if (missed.length) {
      const retry = el("button", "btn", "Practise the missed ones");
      retry.type = "button";
      retry.addEventListener("click", () => {
        state.quiz = { questions: shuffle(missed.map((a) => a.ex)), i: 0, score: 0, answers: [], recorded: false, retry: true };
        rerender();
      });
      row.appendChild(retry);
    }
    const again = el("button", "btn" + (missed.length ? " btn-outline" : ""), "New quiz");
    again.type = "button";
    again.addEventListener("click", () => {
      state.quiz = null;
      rerender();
    });
    row.appendChild(again);
    body.appendChild(row);
  }

  // ---------- Find the … ----------
  // The page may offer a TYPE to look for (e.g. lene / forte / mappiq, or Type 1 / Type 2) and may ask for
  // WORDS or single LETTERS (consonants).

  function renderFind(body, rerender) {
    const ft = config.findTab;
    if (!state.find) state.find = { type: ft.types ? ft.types[0].id : null, ref: null, picked: new Set(), checked: false };
    const f = state.find;
    if (ft.types) {
      const picker = el("div", "choice-group bible-type-picker");
      picker.appendChild(el("span", "caption", "Find:"));
      for (const t of ft.types) {
        const b = el("button", "choice-btn" + (f.type === t.id ? " selected" : ""), t.label);
        b.type = "button";
        b.addEventListener("click", () => {
          f.type = t.id;
          f.ref = null;
          rerender();
        });
        picker.appendChild(b);
      }
      body.appendChild(picker);
    }
    const typeLabel = ft.types ? ft.types.find((t) => t.id === f.type).label : "";
    const letterMode = ft.level === "letter";
    if (!f.ref) {
      const c = Object.entries(data.verses).filter(([, words]) => ft.candidate(words, f.type)).map(([ref]) => ref);
      f.ref = c[Math.floor(Math.random() * c.length)];
      f.picked = new Set();
      f.checked = false;
    }
    const words = data.verses[f.ref];
    const key = (wi, li) => (letterMode ? `${wi}:${li}` : String(wi));
    const target = (wi, li) => ft.isTarget(words[wi], f.type, li);
    body.appendChild(el("p", "", typeof ft.prompt === "function" ? ft.prompt(typeLabel) : ft.prompt));
    body.appendChild(el("div", "caption", prettyRef(f.ref)));

    // every tappable thing in this verse: [key, wi, li]
    const things = [];
    let verse;
    const toggle = (k, node) => {
      if (f.checked) return;
      if (f.picked.has(k)) f.picked.delete(k);
      else f.picked.add(k);
      node.classList.toggle("is-picked", f.picked.has(k));
    };
    if (letterMode) {
      verse = buildLetterVerse(words, { showAccents: state.showAccents, onLetter: (wi, li, w, node) => toggle(key(wi, li), node) });
      verse.querySelectorAll(".bible-letter").forEach((node) => things.push([key(+node.dataset.wi, +node.dataset.li), +node.dataset.wi, +node.dataset.li, node]));
    } else {
      verse = buildVerse(words, { showAccents: state.showAccents, onWord: (wi, w, node) => toggle(key(wi), node) });
      verse.querySelectorAll(".bible-word").forEach((node) => things.push([key(+node.dataset.wi), +node.dataset.wi, undefined, node]));
    }
    for (const [k, wi, li, node] of things) {
      if (f.picked.has(k)) node.classList.add("is-picked");
      if (f.checked) {
        const isT = target(wi, li);
        const picked = f.picked.has(k);
        if (isT && picked) node.classList.add("is-correct");
        else if (isT && !picked) node.classList.add("is-missed");
        else if (!isT && picked) node.classList.add("is-wrong");
      }
    }
    body.appendChild(verse);
    const row = el("div", "button-row");
    if (!f.checked) {
      const check = el("button", "btn", "Check");
      check.type = "button";
      check.addEventListener("click", () => {
        f.checked = true;
        recordStreakActivity();
        rerender();
      });
      row.appendChild(check);
    } else {
      const total = things.filter(([, wi, li]) => target(wi, li)).length;
      const got = things.filter(([k, wi, li]) => target(wi, li) && f.picked.has(k)).length;
      const wrongPicks = things.filter(([k, wi, li]) => !target(wi, li) && f.picked.has(k));
      const unit = letterMode ? "letter" : "word";
      const msg = el("div", "bible-feedback " + (got === total && !wrongPicks.length ? "is-correct" : "is-wrong"));
      msg.textContent = `You found ${got} of ${total}${wrongPicks.length ? `, and tapped ${wrongPicks.length} ${unit}${wrongPicks.length > 1 ? "s" : ""} that ${wrongPicks.length > 1 ? "do" : "does"} not match` : ""}. ${typeof ft.legend === "function" ? ft.legend(typeLabel) : ft.legend}`;
      body.appendChild(msg);
      for (const [, wi, li] of wrongPicks) {
        const trap = ft.trap && ft.trap(words[wi], f.type, li);
        if (trap) {
          body.appendChild(el("div", "bible-feedback", trap));
          break;
        }
      }
      const nxt = el("button", "btn", "Next verse");
      nxt.type = "button";
      nxt.addEventListener("click", () => {
        f.ref = null;
        rerender();
      });
      row.appendChild(nxt);
    }
    body.appendChild(row);
  }

  return { mount, unmount };
}
