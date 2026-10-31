// Printable Bible in Context sheets: a pattern guide, or a quiz sheet built on a passage.
//
// A quiz sheet shows the passage in Hebrew with the words to be answered numbered, then one numbered question for
// each, in the same answer boxes as the page. The learner answers by CIRCLING a choice in each row, or by WRITING
// on a line (with a word bank at the top). An answer key can follow on its own page. The Hebrew is printed exactly
// as stored (accent marks can be left off, nothing else changes).

import { buildVerse, prettyRef, wordHtml, hebrewHtml } from "./bible-text.js";
import { prepareForPrint } from "./print-tables.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};


/**
 * Picks up to `count` examples from a passage, spread across the patterns (round robin), in reading order.
 * Returns { picked, available } where available is how many the passage has.
 */
export function pickPassageQuestions(pool, passage, count) {
  const order = new Map(passage.verses.map((r, i) => [r, i]));
  const buckets = new Map();
  for (const e of shuffle(pool)) {
    if (!buckets.has(e.pattern)) buckets.set(e.pattern, []);
    buckets.get(e.pattern).push(e);
  }
  const lists = shuffle([...buckets.values()]);
  const picked = [];
  while (picked.length < count && lists.some((l) => l.length)) {
    for (const l of lists) {
      if (picked.length >= count) break;
      if (l.length) picked.push(l.shift());
    }
  }
  picked.sort((a, b) => order.get(a.ref) - order.get(b.ref) || a.wi - b.wi || (a.li ?? a.k ?? a.from ?? 0) - (b.li ?? b.k ?? b.from ?? 0));
  return { picked, available: pool.length };
}

/** The passage in Hebrew, each verse on its own line, with the numbers of the questions after the words they ask about. */
function passageHtml(ctx, passage, questions, showAccents) {
  const byVerse = new Map();
  questions.forEach((bq, i) => {
    const key = `${bq.ex.ref}#${bq.ex.wi}`;
    const list = byVerse.get(key) || [];
    list.push(i + 1);
    byVerse.set(key, list);
  });
  const out = [];
  for (const ref of passage.verses) {
    const words = ctx.data.verses[ref];
    const targets = questions.filter((q) => q.ex.ref === ref);
    const verse = buildVerse(words, {
      showAccents,
      mark: (wi, w) => {
        const q = targets.find((t) => t.ex.wi === wi);
        return q ? ctx.config.markWord(w, q.ex).markPiece ?? -1 : -1;
      },
      markLetter: (wi, w) => {
        const q = targets.find((t) => t.ex.wi === wi);
        return q ? ctx.config.markWord(w, q.ex).markLetter ?? -1 : -1;
      },
    });
    for (const [key, nums] of byVerse) {
      const [r, wi] = key.split("#");
      if (r !== ref) continue;
      const node = verse.querySelector(`[data-wi="${wi}"]`);
      if (node) node.insertAdjacentHTML("beforeend", `<sup class="bp-num" dir="ltr">${nums.join(",")}</sup>`);
    }
    out.push(`<p class="bp-verse"><span class="bp-ref" dir="ltr">${esc(prettyRef(ref))}</span> ${verse.outerHTML}</p>`);
  }
  return out.join("");
}

/** The word a question asks about, drawn the way the page draws it. */
function targetHtml(ctx, bq, showAccents) {
  const ex = bq.ex;
  const target = bq.words[ex.wi];
  if (ctx.config.questionDisplay) {
    const node = ctx.config.questionDisplay({ ex, target, data: ctx.data, showAccents });
    return node.outerHTML;
  }
  const m = ctx.config.markWord(target, ex);
  return `<span class="bp-word" lang="he" dir="rtl">${wordHtml(target, { ...m, showAccents })}</span>`;
}

/**
 * A quiz sheet as HTML.
 *   style      "circle" (circle one choice in each row) or "lines" (write the answer on a line, with a word bank)
 *   answerKey  add an answer key on a separate page
 */
export function buildQuizSheet(ctx, { passageIndex = 0, count = 10, style = "circle", answerKey = true, showAccents = true } = {}) {
  const passage = ctx.data.passages[passageIndex] || ctx.data.passages[0];
  // The passage's own questions: the same ones its Guided passage walks through.
  const { picked, available } = pickPassageQuestions(ctx.config.steps(ctx.data, passage), passage, count);
  const questions = picked.map((ex) => ctx.makeQuestion(ex));
  const title = ctx.config.title;
  const lines = style === "lines";

  let html = `<section class="bible-sheet bp-quiz print-page${answerKey && questions.length ? "" : " print-page-last"}">
    <header class="bp-head">
      <h1>${esc(title)}: quiz</h1>
      <p class="bp-meta">Name ______________________ &nbsp; Date ____________ &nbsp; Score ______ / ${questions.length}</p>
    </header>
    <h2 class="bp-passage-title">${esc(passage.title)}</h2>
    <div class="bp-passage">${passageHtml(ctx, passage, questions, showAccents)}</div>`;

  if (!questions.length) {
    html += `<p class="bp-note">This passage has nothing to ask about on this page. Choose another passage.</p></section>`;
    return { html, questions: 0, available };
  }
  if (Number.isFinite(count) && questions.length < count) html += `<p class="bp-note">This passage has ${questions.length} ${questions.length === 1 ? "question" : "questions"} on this topic.</p>`;
  html += `<p class="bp-instructions"><b>${esc(ctx.config.promptText)}</b> The numbers in the passage match the questions. ${lines ? "Write your answer on each line." : "Circle one answer in each row."}</p>`;

  if (lines) {
    const first = questions[0].parts;
    html += `<div class="bp-bank"><b>Word bank</b>${first
      .map((p) => `<div class="bp-bank-row">${p.title ? `<span class="bp-bank-title">${esc(p.title)}:</span> ` : ""}${p.choices.map((c) => esc(c.label)).join(" &middot; ")}</div>`)
      .join("")}</div>`;
  }

  html += `<ol class="bp-questions">`;
  questions.forEach((bq) => {
    html += `<li class="bp-q"><div class="bp-q-word">${targetHtml(ctx, bq, showAccents)}</div>`;
    for (const p of bq.parts) {
      html += `<div class="bp-part">${bq.parts.length > 1 && p.title ? `<span class="bp-part-title">${esc(p.title)}</span>` : ""}`;
      if (lines) html += `<span class="bp-line"></span>`;
      else html += `<span class="bp-choices">${p.choices.map((c) => `<span class="bp-opt">${esc(c.label)}</span>`).join("")}</span>`;
      html += `</div>`;
    }
    html += `</li>`;
  });
  html += `</ol></section>`;

  if (answerKey) {
    html += `<section class="bible-sheet bp-key print-page print-page-last">
      <header class="bp-head"><h1>${esc(title)}: answer key</h1><p class="bp-meta">${esc(passage.title)}</p></header>
      <ol class="bp-key-list">`;
    questions.forEach((bq) => {
      const answers = bq.parts.map((p) => (p.choices.find((c) => c.id === p.answer) || {}).label || "").join(" &middot; ");
      html += `<li><div class="bp-key-word">${targetHtml(ctx, bq, showAccents)}</div> <b>${answers}</b><div class="bp-key-why">${bq.explainHtml}</div></li>`;
    });
    html += `</ol></section>`;
  }
  return { html, questions: questions.length, available };
}

/** The page's Pattern guide as a printable sheet. */
export function buildGuideSheet(ctx, { showAccents = true } = {}) {
  const holder = document.createElement("div");
  ctx.config.renderGuide(holder, { data: ctx.data, el: ctx.el, showAccents, patternById: ctx.patternById, wordHtml, hebrewHtml });
  holder.querySelectorAll("button, input, select").forEach((n) => n.remove()); // nothing interactive on paper
  return { html: `<section class="bible-sheet bp-guide print-page print-page-last"><header class="bp-head"><h1>${esc(ctx.config.title)}: pattern guide</h1></header>${holder.innerHTML}</section>` };
}

/** Sends a sheet to the printer through the app's print area. */
export function printSheet(html) {
  let area = document.getElementById("print-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "print-area";
    document.body.appendChild(area);
  }
  prepareForPrint();
  area.innerHTML = html;
  const clean = () => {
    area.innerHTML = "";
    window.removeEventListener("afterprint", clean);
  };
  window.addEventListener("afterprint", clean);
  window.print();
}

/** The Print tab: choose a sheet, preview it, print it. */
export function renderPrintTab(body, ctx) {
  const { el, state, data } = ctx;
  const opts = (state.printOpts ||= { kind: "quiz", style: "circle", count: null, answerKey: true, accents: state.showAccents, passage: state.passage }); // count null = the most the passage can ask
  const redraw = () => ctx.rerender();

  body.appendChild(el("p", "", "Print a pattern guide, or a quiz sheet on a passage that students answer on paper."));

  const kinds = el("div", "choice-group");
  kinds.setAttribute("role", "group");
  kinds.setAttribute("aria-label", "What to print");
  for (const [id, label] of [["quiz", "Quiz sheet"], ["guide", "Pattern guide"]]) {
    const b = el("button", "choice-btn" + (opts.kind === id ? " selected" : ""), label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(opts.kind === id));
    b.addEventListener("click", () => {
      opts.kind = id;
      redraw();
    });
    kinds.appendChild(b);
  }
  body.appendChild(kinds);

  const form = el("div", "bp-form");
  const field = (labelText, control, id) => {
    const wrap = el("div", "bp-field");
    const l = el("label", "", labelText);
    l.htmlFor = id;
    control.id = id;
    wrap.append(l, control);
    return wrap;
  };
  if (opts.kind === "quiz") {
    const sel = document.createElement("select");
    data.passages.forEach((p, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = p.title;
      if (i === opts.passage) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      opts.passage = Number(sel.value);
      opts.count = null; // a different passage: start again from its maximum
      redraw();
    });
    form.appendChild(field("Passage", sel, "bp-passage-select"));

    // How many questions: the most the passage can ask by default, lowered (or raised again) with the arrows.
    const max = Math.max(1, ctx.config.steps(data, data.passages[opts.passage] || data.passages[0]).length);
    const count = Math.min(opts.count ?? max, max);
    const stepper = el("div", "bp-field");
    stepper.appendChild(el("span", "bp-stepper-label", "Number of questions"));
    const group = el("div", "bp-stepper");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Number of questions");
    const mk = (text, label, disabled, delta) => {
      const b = el("button", "btn btn-outline bp-step-btn", text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.disabled = disabled;
      b.addEventListener("click", () => {
        opts.count = Math.max(1, Math.min(max, count + delta));
        redraw();
      });
      return b;
    };
    const value = el("span", "bp-stepper-value", `${count}`);
    value.id = "bp-count-value";
    value.setAttribute("aria-live", "polite");
    const of = el("span", "caption", ` of ${max} possible`);
    group.append(mk("−", "Fewer questions", count <= 1, -1), value, mk("+", "More questions", count >= max, 1), of);
    stepper.appendChild(group);
    form.appendChild(stepper);

    const styles = el("fieldset", "bp-fieldset");
    styles.appendChild(el("legend", "", "How students answer"));
    for (const [id, label] of [["circle", "Circle the answer"], ["lines", "Write the answer on a line (with a word bank)"]]) {
      const lab = el("label", "bible-check");
      const r = document.createElement("input");
      r.type = "radio";
      r.name = "bp-style";
      r.value = id;
      r.checked = opts.style === id;
      r.addEventListener("change", () => {
        opts.style = id;
        redraw();
      });
      lab.append(r, document.createTextNode(" " + label));
      styles.appendChild(lab);
    }
    form.appendChild(styles);

    const key = el("label", "bible-check");
    const kc = document.createElement("input");
    kc.type = "checkbox";
    kc.checked = opts.answerKey;
    kc.addEventListener("change", () => {
      opts.answerKey = kc.checked;
      redraw();
    });
    key.append(kc, document.createTextNode(" Add an answer key on a separate page"));
    form.appendChild(key);
  }
  const acc = el("label", "bible-check");
  const ac = document.createElement("input");
  ac.type = "checkbox";
  ac.checked = opts.accents;
  ac.addEventListener("change", () => {
    opts.accents = ac.checked;
    redraw();
  });
  acc.append(ac, document.createTextNode(" Print the accent marks"));
  form.appendChild(acc);
  body.appendChild(form);

  const built = opts.kind === "quiz"
    ? buildQuizSheet(ctx, { passageIndex: opts.passage, count: opts.count ?? Infinity, style: opts.style, answerKey: opts.answerKey, showAccents: opts.accents })
    : buildGuideSheet(ctx, { showAccents: opts.accents });

  const actions = el("div", "button-row");
  const print = el("button", "btn", "Print");
  print.type = "button";
  print.addEventListener("click", () => printSheet(built.html));
  const again = el("button", "btn btn-outline", opts.kind === "quiz" ? "Choose different questions" : "Refresh preview");
  again.type = "button";
  again.addEventListener("click", redraw);
  actions.append(print, again);
  body.appendChild(actions);

  body.appendChild(el("h3", "", "Preview"));
  const preview = el("div", "bp-preview");
  preview.setAttribute("aria-label", "Preview of the printed sheet");
  preview.innerHTML = built.html;
  body.appendChild(preview);
}
