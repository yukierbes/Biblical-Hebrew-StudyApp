// Definite Article in Context (Genesis) — pilot page for the Bible-in-context practice.
//
// Four tabs:
//   Guided passage  — steps through every article in a short passage, one question at a time
//   Pattern quiz    — 10 questions from across Genesis, balanced so the rarer patterns appear
//   Find the article— tap the words that carry the article in a verse
//   Pattern guide   — the six patterns, with examples
//
// The Hebrew text and its tagging come from the Open Scriptures Hebrew Bible (see
// Sources & Credits). The six patterns follow the owner's own rule sheets (see
// scripts/lib/article-rules.mjs). Examples that do not match those rules are never shown.

import { loadBibleData } from "../bible-data.js";
import { buildVerse, prettyRef, getShowAccents, setShowAccents, wordHtml } from "../bible-text.js";
import { recordAttempt } from "../history.js";
import { recordStreakActivity } from "../srs.js";

const TABS = [
  ["guided", "Guided passage"],
  ["quiz", "Pattern quiz"],
  ["find", "Find the article"],
  ["guide", "Pattern guide"],
];
const QUIZ_LENGTH = 10;

let state = null;
let data = null;

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
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
const hebrew = (s) => `<span lang="he" dir="rtl" class="bible-inline">${s}</span>`;

export async function mount({ content, sidebarExtra }) {
  state = { tab: "guided", showAccents: getShowAccents(), passage: 0, guided: null, quiz: null, find: null, alive: true };
  content.innerHTML = '<div class="loading">Loading Genesis…</div>';
  try {
    data = await loadBibleData();
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(el("div", "alert alert-warning", "Could not load the Bible data. Please check your connection and try again."));
    return;
  }
  if (!state || !state.alive) return;
  render(content, sidebarExtra);
}

export function unmount() {
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
  content.appendChild(el("h1", "page-title", "Definite Article in Context"));
  content.appendChild(
    el("p", "caption", `Real examples from the Hebrew text of ${data.source.book}. Source: ${data.source.name} (see Sources & Credits).`)
  );

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
  if (state.tab === "guided") renderGuided(body, () => render(content, sidebarExtra));
  else if (state.tab === "quiz") renderQuiz(body, () => render(content, sidebarExtra));
  else if (state.tab === "find") renderFind(body, () => render(content, sidebarExtra));
  else renderGuide(body);
}

// ---------- one question about one article ----------

function patternById(id) {
  return data.patterns.find((p) => p.id === id);
}

/** Breaks the highlighted word into "article + start of the noun" for the explanation. */
function breakdown(word) {
  const pieces = word.t.split("/");
  const art = pieces[word.a];
  const rest = pieces.slice(word.a + 1).join("");
  return `${hebrew(art)} + ${hebrew(rest)}`;
}

/** Shows a verse with one article highlighted, six choices, then the explanation. */
function patternQuestion(host, ex, { onAnswered, showVerse = true }) {
  const words = data.verses[ex.ref];
  const target = words[ex.wi];
  host.appendChild(el("div", "caption", prettyRef(ex.ref)));
  if (showVerse) host.appendChild(buildVerse(words, { showAccents: state.showAccents, mark: (wi) => (wi === ex.wi ? target.a : -1) }));
  else {
    // The guided passage above already shows the verse with this word highlighted; show just the word here.
    const one = el("div", "bible-verse bible-one-word");
    one.setAttribute("lang", "he");
    one.setAttribute("dir", "rtl");
    one.innerHTML = `<span class="bible-word">${wordHtml(target, { markPiece: target.a, showAccents: state.showAccents })}</span>`;
    host.appendChild(one);
  }
  host.appendChild(el("p", "bible-prompt", "What is happening at the article in the highlighted word?"));

  const group = el("div", "bible-choices");
  const feedback = el("div", "bible-feedback");
  let answered = false;
  for (const p of data.patterns) {
    const b = el("button", "bible-choice", "");
    b.type = "button";
    b.innerHTML = p.plain.replace(/[\u0590-\u05FF]+/g, (m) => hebrew(m));
    b.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const correct = p.id === ex.pattern;
      for (const other of group.children) other.disabled = true;
      b.classList.add(correct ? "is-correct" : "is-wrong");
      if (!correct) {
        const idx = data.patterns.findIndex((q) => q.id === ex.pattern);
        group.children[idx].classList.add("is-correct");
      }
      const right = patternById(ex.pattern);
      feedback.innerHTML = "";
      feedback.className = "bible-feedback " + (correct ? "is-correct" : "is-wrong");
      feedback.appendChild(el("strong", "", correct ? "Correct. " : "Not quite. "));
      const span = document.createElement("span");
      span.innerHTML = `This word is ${breakdown(target)}. ${right.explain.replace(/[\u0590-\u05FF]+/g, (m) => hebrew(m))}`;
      feedback.appendChild(span);
      recordStreakActivity();
      onAnswered(correct);
    });
    group.appendChild(b);
  }
  host.appendChild(group);
  host.appendChild(feedback);
}

// ---------- Guided passage ----------

function passageSteps(passage) {
  const steps = [];
  for (const ref of passage.verses) {
    (data.verses[ref] || []).forEach((w, wi) => {
      if (w.a !== undefined && w.p && w.p !== "held") steps.push({ ref, wi, pattern: w.p });
    });
  }
  return steps;
}

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
  if (passage.note) body.appendChild(el("p", "caption", passage.note));

  const steps = passageSteps(passage);
  if (!state.guided || state.guided.passage !== state.passage) state.guided = { passage: state.passage, step: 0, results: [], answered: false };
  const g = state.guided;

  const passageBox = el("div", "bible-passage");
  for (const ref of passage.verses) {
    const row = el("div", "bible-verse-row" + (g.step < steps.length && steps[g.step].ref === ref ? " is-current" : ""));
    row.appendChild(el("span", "bible-vn", ref.split(".")[2]));
    row.appendChild(
      buildVerse(data.verses[ref], {
        showAccents: state.showAccents,
        mark: (wi) => (g.step < steps.length && steps[g.step].ref === ref && steps[g.step].wi === wi ? data.verses[ref][wi].a : -1),
      })
    );
    passageBox.appendChild(row);
  }
  body.appendChild(passageBox);

  if (g.step >= steps.length) {
    // summary
    const right = g.results.filter(Boolean).length;
    body.appendChild(el("h2", "", `Passage finished: ${right} of ${steps.length} correct`));
    const table = el("table", "bible-summary");
    const head = el("tr");
    for (const h of ["Word", "Reference", "Pattern"]) head.appendChild(el("th", "", h));
    table.appendChild(head);
    for (const s of steps) {
      const w = data.verses[s.ref][s.wi];
      const tr = el("tr");
      const td1 = el("td");
      td1.innerHTML = hebrew(wordHtml(w, { markPiece: w.a, showAccents: state.showAccents }));
      tr.appendChild(td1);
      tr.appendChild(el("td", "", prettyRef(s.ref)));
      const td3 = el("td");
      td3.innerHTML = patternById(s.pattern).plain.replace(/[\u0590-\u05FF]+/g, (m) => hebrew(m));
      tr.appendChild(td3);
      table.appendChild(tr);
    }
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
  stepBox.appendChild(el("div", "caption", `Article ${g.step + 1} of ${steps.length}`));
  const bar = el("div", "progress-bar-outer");
  const fill = el("div", "progress-bar-inner");
  fill.style.width = `${(g.step / steps.length) * 100}%`;
  bar.appendChild(fill);
  stepBox.appendChild(bar);

  const q = el("div", "bible-question");
  const next = el("button", "btn", g.step === steps.length - 1 ? "Finish" : "Next article");
  next.type = "button";
  next.hidden = true;
  next.addEventListener("click", () => {
    g.step += 1;
    rerender();
  });
  patternQuestion(q, steps[g.step], {
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
  const byPattern = {};
  for (const ex of data.examples) (byPattern[ex.pattern] ||= []).push(ex);
  const ids = Object.keys(byPattern);
  const order = shuffle(ids);
  const used = new Set();
  const out = [];
  for (let i = 0; i < QUIZ_LENGTH; i++) {
    const pool = byPattern[order[i % order.length]].filter((e) => !used.has(`${e.ref}#${e.wi}`));
    if (!pool.length) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    used.add(`${pick.ref}#${pick.wi}`);
    out.push(pick);
  }
  return shuffle(out);
}

function renderQuiz(body, rerender) {
  if (!state.quiz) {
    body.appendChild(el("p", "", `${QUIZ_LENGTH} questions from across Genesis. Each shows one verse with one article highlighted. Choose what is happening. The rarer patterns are included on purpose.`));
    const start = el("button", "btn", "Start quiz");
    start.type = "button";
    start.addEventListener("click", () => {
      state.quiz = { questions: buildQuizQuestions(), i: 0, score: 0, recorded: false };
      rerender();
    });
    body.appendChild(start);
    return;
  }
  const quiz = state.quiz;
  if (quiz.i >= quiz.questions.length) {
    const total = quiz.questions.length;
    const percent = Math.round((quiz.score / total) * 100);
    if (!quiz.recorded) {
      recordAttempt("bible-article", { score: quiz.score, total, percent, datasets: ["Genesis"], retry: false });
      quiz.recorded = true;
    }
    body.appendChild(el("h2", "", `Score: ${quiz.score} of ${total} (${percent}%)`));
    const again = el("button", "btn", "New quiz");
    again.type = "button";
    again.addEventListener("click", () => {
      state.quiz = null;
      rerender();
    });
    body.appendChild(again);
    return;
  }
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
  patternQuestion(q, quiz.questions[quiz.i], {
    onAnswered: (correct) => {
      if (correct) quiz.score += 1;
      next.hidden = false;
    },
  });
  body.appendChild(q);
  body.appendChild(next);
}

// ---------- Find the article ----------

function findCandidates() {
  const out = [];
  for (const [ref, words] of Object.entries(data.verses)) {
    const real = words.filter((w) => !w.m && !w.s);
    if (real.length < 5 || real.length > 14) continue;
    if (words.some((w) => w.p === "held")) continue;
    if (!words.some((w) => w.a !== undefined)) continue;
    out.push(ref);
  }
  return out;
}

function renderFind(body, rerender) {
  if (!state.find) state.find = { ref: null, picked: new Set(), checked: false, found: 0, possible: 0 };
  const f = state.find;
  if (!f.ref) {
    const c = findCandidates();
    f.ref = c[Math.floor(Math.random() * c.length)];
    f.picked = new Set();
    f.checked = false;
  }
  const words = data.verses[f.ref];
  body.appendChild(el("p", "", "Tap every word that has the definite article, then check. (The article can follow a prefix such as “and”.)"));
  body.appendChild(el("div", "caption", prettyRef(f.ref)));
  const isArticle = (w) => w.a !== undefined;
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
      const w = words[wi];
      const picked = f.picked.has(wi);
      if (isArticle(w) && picked) span.classList.add("is-correct");
      else if (isArticle(w) && !picked) span.classList.add("is-missed");
      else if (!isArticle(w) && picked) span.classList.add("is-wrong");
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
    const total = words.filter(isArticle).length;
    const got = [...f.picked].filter((wi) => isArticle(words[wi])).length;
    const wrongPicks = [...f.picked].filter((wi) => !isArticle(words[wi]));
    const msg = el("div", "bible-feedback " + (got === total && !wrongPicks.length ? "is-correct" : "is-wrong"));
    msg.textContent = `You found ${got} of ${total}${wrongPicks.length ? `, and tapped ${wrongPicks.length} word${wrongPicks.length > 1 ? "s" : ""} without the article` : ""}. Green = correct, orange outline = missed, red = not an article.`;
    body.appendChild(msg);
    const tricky = wrongPicks.filter((wi) => words[wi].i);
    if (tricky.length) {
      body.appendChild(el("div", "bible-feedback", "One of the words you tapped begins with the question-marker ה, which looks like the article but is a different word."));
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

// ---------- Pattern guide ----------

function renderGuide(body) {
  body.appendChild(el("p", "", "The six patterns, in the order they are taught. Examples are real words from Genesis."));
  for (const p of data.patterns) {
    const card = el("div", "bible-guide-card");
    const h = el("h3");
    h.innerHTML = p.label.replace(/[\u0590-\u05FF]+/g, (m) => hebrew(m)) + ` <span class="caption">(${data.counts[p.id] || 0} in ${data.source.book})</span>`;
    card.appendChild(h);
    const pe = el("p");
    pe.innerHTML = p.explain.replace(/[\u0590-\u05FF]+/g, (m) => hebrew(m));
    card.appendChild(pe);
    const ex = data.examples.filter((e) => e.pattern === p.id);
    const picks = [];
    const step = Math.max(1, Math.floor(ex.length / 4));
    for (let i = 0; i < ex.length && picks.length < 4; i += step) picks.push(ex[i]);
    const list = el("div", "bible-guide-examples");
    for (const e of picks) {
      const w = data.verses[e.ref][e.wi];
      const item = el("span", "bible-guide-example");
      item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${wordHtml(w, { markPiece: w.a, showAccents: state.showAccents })}</span> <span class="caption">${prettyRef(e.ref)}</span>`;
      list.appendChild(item);
    }
    card.appendChild(list);
    body.appendChild(card);
  }
  const look = el("div", "bible-guide-card");
  look.appendChild(el("h3", "", "Look-alike: the question-marker ה"));
  look.appendChild(el("p", "", "A ה with pataḥ at the start of a word can also be the question-marker, not the article. The text marks these separately, so the “Find the article” practice treats them as not-the-article."));
  body.appendChild(look);
  const held = data.held.length;
  body.appendChild(el("p", "caption", `${held} article${held === 1 ? "" : "s"} in Genesis do not match these rules and are left out of the practice until they are decided.`));
}
