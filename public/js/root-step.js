// "Type the root first": before parsing a verb, the learner types its root.
//
// Three consonants for most verbs. For a weak verb (hollow, I-Nun, III-He and the others) a letter often drops
// out of the form on the page, so two consonants are accepted as well: the root with any one letter left out.
// Final letters are treated as their ordinary forms (ך = כ), and vowels, dots and accents are ignored, so what the
// learner types can be compared with the root by consonants alone. Used by the Verb Parsing page and the Bible
// in Context Verbs page.

import { openHebrewKeyboard } from "./hebrew-keyboard.js";

const FINALS = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/** The consonants of `s` as an array, final letters turned into their ordinary forms. */
export const rootLetters = (s) => [...(s || "").replace(/[^\u05d0-\u05ea]/g, "")].map((c) => FINALS[c] || c);

/** "Strong Verb (קטל)" -> "קטל"; a paradigm named only by its root ("היה") -> "היה"; otherwise "". */
export function rootFromParadigm(name) {
  const m = /\(([^)]+)\)/.exec(name || "");
  const text = m ? m[1] : name || "";
  return /[\u05d0-\u05ea]/.test(text) ? rootLetters(text).join("") : "";
}

/** Whether a paradigm is a weak verb (anything that is not a Strong or Stative verb). */
export const isWeakParadigm = (name) => !/^(Strong|Stative)\b/i.test(name || "");

/**
 * Judges what was typed. { ok, kind }: kind is "full" (all consonants), "short" (a weak verb with one letter left
 * out, `dropped` says which), "empty" or "wrong".
 */
export function checkRoot(typed, root, weak) {
  const t = rootLetters(typed).join("");
  const r = rootLetters(root);
  if (!t) return { ok: false, kind: "empty" };
  if (t === r.join("")) return { ok: true, kind: "full" };
  if (weak && r.length === 3 && t.length === 2) {
    for (let i = 0; i < 3; i++) {
      if (r.filter((_, j) => j !== i).join("") === t) return { ok: true, kind: "short", dropped: r[i] };
    }
  }
  return { ok: false, kind: "wrong" };
}

const heb = (s) => `<span lang="he" dir="rtl" class="root-heb">${s}</span>`;

/**
 * The step itself: a labelled box, a keyboard button, Check and Skip. `onDone({ ok, kind, skipped })` is called once.
 * The root is shown only after an answer (or Skip).
 */
export function createRootStep({ root, weak, onDone }) {
  const wrap = document.createElement("div");
  wrap.className = "root-step";
  const id = `root-input-${Math.random().toString(36).slice(2, 8)}`;
  wrap.innerHTML = `<label class="field-label" for="${id}">First, the root</label>
    <p class="caption" id="${id}-help">Type the root of this verb: three consonants. In a weak verb a letter can drop out, so two consonants are accepted too.</p>`;
  const row = document.createElement("div");
  row.className = "root-step-row";
  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.lang = "he";
  input.dir = "rtl";
  input.autocomplete = "off";
  input.setAttribute("aria-describedby", `${id}-help`);
  input.className = "root-input";
  const kb = document.createElement("button");
  kb.type = "button";
  kb.className = "btn btn-sm btn-outline";
  kb.textContent = "Hebrew keyboard";
  kb.addEventListener("click", () => openHebrewKeyboard(input));
  const check = document.createElement("button");
  check.type = "button";
  check.className = "btn btn-sm";
  check.textContent = "Check root";
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "btn btn-sm btn-outline";
  skip.textContent = "Skip";
  row.append(input, kb, check, skip);
  wrap.appendChild(row);
  const msg = document.createElement("div");
  msg.className = "root-step-msg";
  msg.setAttribute("role", "status");
  msg.setAttribute("aria-live", "polite");
  wrap.appendChild(msg);

  let finished = false;
  const finish = (res, text, good) => {
    if (finished) return;
    finished = true;
    input.disabled = check.disabled = skip.disabled = true;
    msg.className = "root-step-msg " + (good ? "is-good" : "is-bad");
    msg.innerHTML = text;
    onDone(res);
  };
  const doCheck = () => {
    const res = checkRoot(input.value, root, weak);
    if (res.kind === "empty") {
      msg.className = "root-step-msg is-bad";
      msg.textContent = "Type the root first, or choose Skip.";
      input.focus();
      return;
    }
    if (res.kind === "full") finish(res, `Correct: the root is ${heb(root)}.`, true);
    else if (res.kind === "short") finish(res, `Correct. The root is ${heb(root)}; the ${heb(res.dropped)} drops out of many forms of a weak verb, so two consonants are fine.`, true);
    else finish({ ...res, ok: false }, `Not quite. The root is ${heb(root)}.`, false);
  };
  check.addEventListener("click", doCheck);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doCheck();
    }
  });
  skip.addEventListener("click", () => finish({ ok: false, kind: "skipped", skipped: true }, `Skipped. The root is ${heb(root)}.`, false));
  return wrap;
}

/** The small line shown above the parsing fields once the root step is over. */
export function rootSummaryLine(root, result) {
  const p = document.createElement("p");
  p.className = "caption root-summary";
  p.innerHTML = `Root: ${heb(root)} ${result && result.ok ? "✓" : result && result.skipped ? "(skipped)" : "(missed)"}`;
  return p;
}
