// Mixed review: one verse at a time, with a question of each kind the practice pages ask (the article, the preposition,
// the vav, the verb and more), so what was practised page by page is used together, in a real verse.
//
// The questions are the same ones the practice pages ask: an index (bible-mixed) says which examples share a verse, and each
// page's own data and configuration draw the question and its answer boxes. Every answer is saved to that page's own review
// schedule. (It used to be a tab of the Reading page; it is a page of its own in Bible in Context.)

import { loadBibleData } from "../bible-data.js";
import { buildVerse, prettyRef, getShowAccents, setShowAccents } from "../bible-text.js";
import { getPracticeConfig, makeBibleQuestion, drawBibleQuestion, noteBibleAnswer } from "../bible-practice.js";
import { recordStreakActivity, recordItemResult } from "../srs.js";
import { bibleSrsMode, exampleKey, pickAdaptiveVerse, describeNeed } from "../bible-areas.js";
import { createConfidenceAsk } from "../confidence.js";
import { saveResumePoint } from "../resume.js";

const el = (tag, className, html) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let state = null;
let mixedIndex = null;

export async function mount({ content, sidebarExtra }) {
  state = { mixedMode: "need", lastMixedRef: null, mixed: null, showAccents: getShowAccents(), alive: true };
  render(content, sidebarExtra);
}

export function unmount() {
  if (state) state.alive = false;
  state = null;
}

function render(content, sidebarExtra) {
  const again = () => render(content, sidebarExtra);
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
    again();
  });
  label.appendChild(cb);
  label.appendChild(document.createTextNode(" Show accent marks"));
  sec.appendChild(label);
  sec.appendChild(el("p", "caption", "Hide the accent marks to read the way many printed texts do. Nothing else about the text changes."));
  sidebarExtra.appendChild(sec);

  content.innerHTML = "";
  content.appendChild(el("h1", "page-title", "Mixed review"));
  content.appendChild(el("p", "caption", "One verse, several kinds of question: the article, prepositions, the vav, verbs and more, all asked about words in the same verse."));
  const body = el("div", "bible-body");
  content.appendChild(body);
  renderMixed(body, again);
  saveResumePoint("bible-mixed", {}, "Mixed review");
}

// ---------------------------------------------------------------------------------------------
// Mixed review: one verse, several kinds of question
// ---------------------------------------------------------------------------------------------

async function loadMixed() {
  if (!mixedIndex) mixedIndex = (await loadBibleData("bible-mixed")).verses;
  return mixedIndex;
}

/** Starts a verse: loads the data of each page it asks about and draws its questions. */
async function startMixed(body, rerender) {
  body.innerHTML = '<div class="loading">Choosing a verse…</div>';
  try {
    const verses = await loadMixed();
    // "What I need" favours verses whose questions are due for review or weak; "Random" ignores your history.
    let pick;
    let need = null;
    if (state.mixedMode === "random") {
      pick = verses[Math.floor(Math.random() * verses.length)];
    } else {
      const chosen = pickAdaptiveVerse(verses, { avoid: state.lastMixedRef });
      pick = chosen.verse;
      need = describeNeed(chosen);
    }
    state.lastMixedRef = pick.ref;
    const questions = [];
    for (const p of pick.picks) {
      const config = getPracticeConfig(p.page);
      if (!config) continue;
      const pageData = await loadBibleData(config.dataset);
      questions.push(makeBibleQuestion(config, pageData, p.ex));
    }
    if (!state || !state.alive) return;
    state.mixed = { ref: pick.ref, questions, i: 0, results: [], picked: {}, graded: false, need };
  } catch (e) {
    if (!state || !state.alive) return;
    body.innerHTML = "";
    body.appendChild(el("div", "alert alert-warning", "Could not load a mixed-review verse. Please try again."));
    return;
  }
  rerender();
}

function renderMixed(body, rerender) {
  const m = state.mixed;
  if (!m) {
    body.appendChild(
      el("p", "", "One verse, several questions: the same kinds of question as the practice pages — the article, a prefixed preposition, the vav, the verb, a noun and more — but all in the same verse, the way they meet you when you read.")
    );
    const modes = el("div", "choice-group reading-mixed-mode");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "How the verse is chosen");
    for (const [id, text] of [
      ["need", "What I need (due and weak first)"],
      ["random", "Random"],
    ]) {
      const b = el("button", "choice-btn" + (state.mixedMode === id ? " selected" : ""), esc(text));
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.mixedMode === id));
      b.addEventListener("click", () => {
        state.mixedMode = id;
        rerender();
      });
      modes.appendChild(b);
    }
    body.appendChild(el("p", "caption", "Choose the verse by:"));
    body.appendChild(modes);
    body.appendChild(
      el(
        "p",
        "caption",
        state.mixedMode === "need"
          ? "Verses whose questions are due for review, or that you often miss, come up first. Your answers here count toward the same review schedule as the practice pages."
          : "Any verse, whatever your history."
      )
    );
    const start = el("button", "btn", "Start a verse");
    start.type = "button";
    start.addEventListener("click", () => startMixed(body, rerender));
    body.appendChild(start);
    return;
  }
  if (m.i >= m.questions.length) return renderMixedSummary(body, m, rerender);

  const bq = m.questions[m.i];
  const config = getPracticeConfig(bq.page);
  body.appendChild(el("div", "caption", `Question ${m.i + 1} of ${m.questions.length} · ${esc(config ? config.title : "")}`));
  if (m.need && m.i === 0) body.appendChild(el("p", "caption reading-mixed-why", `Chosen for you: ${esc(m.need)}.`));
  const bar = el("div", "progress-bar-outer");
  bar.appendChild(Object.assign(el("div", "progress-bar-inner"), {}));
  bar.firstChild.style.width = `${(m.i / m.questions.length) * 100}%`;
  body.appendChild(bar);

  const host = el("div", "bible-question");
  const feedback = el("div", "bible-feedback");
  const next = el("button", "btn", m.i === m.questions.length - 1 ? "See results" : "Next question");
  next.type = "button";
  next.hidden = !m.graded;
  next.addEventListener("click", () => {
    m.i += 1;
    m.picked = {};
    m.graded = false;
    rerender();
  });

  const draw = () => {
    host.innerHTML = "";
    drawBibleQuestion(host, bq, {
      showAccents: state.showAccents,
      picked: m.picked,
      graded: m.graded,
      onPick: (pi, id) => {
        m.picked[pi] = id;
        if (bq.parts.every((_, k) => m.picked[k] !== undefined)) grade();
      },
    });
  };
  function grade() {
    const right = bq.parts.every((p, k) => m.picked[k] === p.answer);
    m.graded = true;
    m.results[m.i] = { right, page: bq.page };
    recordStreakActivity();
    recordItemResult(bibleSrsMode(bq.page), bq.key, right);
    try {
      const cfg = getPracticeConfig(bq.page);
      const pageData = { verses: { [bq.ex.ref]: bq.words }, examples: [] };
      if (cfg) noteBibleAnswer(cfg, pageData, bq.ex, bq.parts, m.picked);
    } catch (e) {
      /* the extra notes never interrupt a question */
    }
    draw();
    feedback.className = "bible-feedback " + (right ? "is-correct" : "is-wrong");
    feedback.innerHTML = `<strong>${right ? "Correct. " : "Not quite. "}</strong>${bq.explainHtml}`;
    if (right) {
      const ask = createConfidenceAsk(bibleSrsMode(bq.page), bq.key);
      if (ask) feedback.appendChild(ask);
    }
    next.hidden = false;
  }
  draw();
  if (m.graded) {
    // coming back to a graded question after a redraw (for example toggling the accent marks)
    const right = m.results[m.i] && m.results[m.i].right;
    feedback.className = "bible-feedback " + (right ? "is-correct" : "is-wrong");
    feedback.innerHTML = `<strong>${right ? "Correct. " : "Not quite. "}</strong>${bq.explainHtml}`;
  }
  body.appendChild(host);
  body.appendChild(feedback);
  body.appendChild(next);
}

function renderMixedSummary(body, m, rerender) {
  const right = m.results.filter((r) => r && r.right).length;
  body.appendChild(el("h2", "", `${prettyRef(m.ref)}: ${right} of ${m.questions.length} correct`));
  const words = m.questions[0].words;
  body.appendChild(buildVerse(words, { showAccents: state.showAccents }));
  const list = el("ul", "bible-credit-list");
  m.questions.forEach((bq, i) => {
    const cfg = getPracticeConfig(bq.page);
    const r = m.results[i];
    const word = bq.words[bq.ex.wi];
    list.appendChild(
      el("li", "", `${r && r.right ? "✓" : "✗"} ${esc(cfg ? cfg.title : bq.page)}: <span lang="he" dir="rtl" class="bible-inline">${esc(word.t.split("/").join(""))}</span>`)
    );
  });
  body.appendChild(list);
  const row = el("div", "button-row");
  const again = el("button", "btn", "Another verse");
  again.type = "button";
  again.addEventListener("click", () => {
    state.mixed = null;
    startMixed(body, rerender);
  });
  row.appendChild(again);
  const done = el("button", "btn btn-outline", "Back to reading");
  done.type = "button";
  done.addEventListener("click", () => {
    state.mixed = null;
    rerender();
  });
  row.appendChild(done);
  body.appendChild(row);
}
