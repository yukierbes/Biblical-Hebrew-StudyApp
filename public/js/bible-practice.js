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
import { buildVerse, prettyRef, getShowAccents, setShowAccents, wordHtml, hebrewHtml } from "./bible-text.js";
import { recordAttempt } from "./history.js";
import { recordStreakActivity } from "./srs.js";

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
  let state = null;
  let data = null;
  const TABS = [
    ["guided", "Guided passage"],
    ["quiz", "Pattern quiz"],
    ["find", config.findTab.label],
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
    if (showVerse) host.appendChild(verseFor(ex));
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

    const group = el("div", "bible-choices");
    const feedback = el("div", "bible-feedback");
    const rightGroup = groupOf(ex.pattern);
    let answered = false;
    for (const g of data.groups) {
      const b = el("button", "bible-choice", g.label);
      b.type = "button";
      b.dataset.group = g.id;
      b.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = g.id === rightGroup.id;
        for (const other of group.children) other.disabled = true;
        b.classList.add(correct ? "is-correct" : "is-wrong");
        if (!correct) [...group.children].find((x) => x.dataset.group === rightGroup.id).classList.add("is-correct");
        const right = patternById(ex.pattern);
        feedback.innerHTML = "";
        feedback.className = "bible-feedback " + (correct ? "is-correct" : "is-wrong");
        feedback.appendChild(el("strong", "", correct ? "Correct. " : `Not quite: this is ${rightGroup.label}. `));
        const span = document.createElement("span");
        span.innerHTML = `${config.describe(target, ex)} ${hebrewHtml(right.explain)}${target.n ? " " + hebrewHtml(target.n) : ""}`;
        feedback.appendChild(span);
        recordStreakActivity();
        onAnswered(correct, g);
      });
      group.appendChild(b);
    }
    host.appendChild(group);
    host.appendChild(feedback);
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
        tr.appendChild(el("td", "", `${groupOf(s.pattern).label}${g.results[i] ? "" : " (missed)"}`));
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
    const used = new Set();
    const out = [];
    for (let i = 0; i < QUIZ_LENGTH; i++) {
      const pool = byGroup[order[i % order.length]].filter((e) => !used.has(`${e.ref}#${e.wi}#${e.li ?? ""}`));
      if (!pool.length) continue;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      used.add(`${pick.ref}#${pick.wi}#${pick.li ?? ""}`);
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
        p.innerHTML = `<strong>Your answer:</strong> ${hebrewHtml(a.chosen)}<br><strong>Correct answer:</strong> ${hebrewHtml(groupOf(a.ex.pattern).label)}<br>${config.describe(word, a.ex)} ${hebrewHtml(right.explain)}${word.n ? " " + hebrewHtml(word.n) : ""}`;
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

  function renderFind(body, rerender) {
    const ft = config.findTab;
    if (!state.find) state.find = { ref: null, picked: new Set(), checked: false };
    const f = state.find;
    if (!f.ref) {
      const c = Object.entries(data.verses).filter(([, words]) => ft.candidate(words)).map(([ref]) => ref);
      f.ref = c[Math.floor(Math.random() * c.length)];
      f.picked = new Set();
      f.checked = false;
    }
    const words = data.verses[f.ref];
    body.appendChild(el("p", "", ft.prompt));
    body.appendChild(el("div", "caption", prettyRef(f.ref)));
    const verse = buildVerse(words, {
      showAccents: state.showAccents,
      onWord: (wi, w, span) => {
        if (f.checked) return;
        if (f.picked.has(wi)) f.picked.delete(wi);
        else f.picked.add(wi);
        span.classList.toggle("is-picked", f.picked.has(wi));
      },
    });
    verse.querySelectorAll(".bible-word").forEach((span) => {
      const wi = Number(span.dataset.wi);
      if (f.picked.has(wi)) span.classList.add("is-picked");
      if (f.checked) {
        const target = ft.isTarget(words[wi]);
        const picked = f.picked.has(wi);
        if (target && picked) span.classList.add("is-correct");
        else if (target && !picked) span.classList.add("is-missed");
        else if (!target && picked) span.classList.add("is-wrong");
      }
    });
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
      const total = words.filter(ft.isTarget).length;
      const got = [...f.picked].filter((wi) => ft.isTarget(words[wi])).length;
      const wrongPicks = [...f.picked].filter((wi) => !ft.isTarget(words[wi]));
      const msg = el("div", "bible-feedback " + (got === total && !wrongPicks.length ? "is-correct" : "is-wrong"));
      msg.textContent = `You found ${got} of ${total}${wrongPicks.length ? `, and tapped ${wrongPicks.length} word${wrongPicks.length > 1 ? "s" : ""} that ${wrongPicks.length > 1 ? "do" : "does"} not have it` : ""}. ${ft.legend}`;
      body.appendChild(msg);
      for (const wi of wrongPicks) {
        const trap = ft.trap && ft.trap(words[wi]);
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
