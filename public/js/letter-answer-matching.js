import { wrapHebrewSpans, sampleN } from "./helpers.js";
import { openHebrewKeyboard } from "./hebrew-keyboard.js";
import { openVowelKeyboard } from "./vowel-keyboard.js";
import { PLACEHOLDER, isSharedForm, ambiguityHints } from "./letter-sets.js";

// Shared answer checking and prompt/answer widgets for Typing and the
// typing-style Games on the Consonants and Vowels pages — the counterpart
// of accent-answer-matching.js, but written once for both sets.

// ================= Answer normalization / matching =================

/** Canonical form for comparing typed Hebrew. NFC puts a letter's marks in
 * one fixed order (so dagesh + shin-dot typed in either order match), and the
 * dotted circle ◌ (the "put the vowel here" placeholder) is dropped from
 * both sides so it doesn't matter whether it was typed. */
function normalizeForm(s) {
  return (s || "").normalize("NFC").split(PLACEHOLDER).join("").replace(/\s+/g, "");
}

/** Either way a typing question is asked, the person types the letter or
 * vowel itself, so correctness only ever checks against `row.Form`. */
export function isFormAnswerCorrect(row, userValue) {
  const norm = normalizeForm(userValue);
  if (!norm) return false;
  return norm === normalizeForm(row.Form);
}

/** The answer a typing question is graded against, for "correct answer
 * was..." feedback after a miss. */
export function primaryAnswerText(row) {
  return row.Form || "";
}

/** Symbol → Keyboard: given the mark, pick the keyboard shortcut that types it. */
export function isKeyboardAnswerCorrect(row, selected) {
  return !!selected && selected === row.Keyboard;
}

/** The correct Keyboard string plus up to 3 distractors from `pool`
 * (duplicates dropped — several rows can share a shortcut). */
export function buildKeyboardOptions(row, pool) {
  const correct = row.Keyboard || "";
  const shuffled = sampleN(
    pool.filter((r) => r !== row),
    pool.length,
    false
  );
  const seen = new Set([correct]);
  const options = [correct];
  for (const r of shuffled) {
    if (options.length >= 4) break;
    const text = r.Keyboard || "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    options.push(text);
  }
  return sampleN(options, options.length, false);
}

// ================= Hint panel for marks that look identical =================

/**
 * When a mark is shown on its own and another vowel is written the same
 * way (qameṣ / qameṣ-ḥaṭuf), this explains the overlap and lets the person
 * reveal which class the answer belongs to — the same idea as the Verb
 * pages' "this form fits more than one parsing" hints. `hintState` is any
 * object with a mutable `hintsRevealed` counter.
 */
export function renderAmbiguityHintPanel(container, set, row, hintState, onReveal) {
  const hints = ambiguityHints(set, row);
  if (hints.length === 0) return;

  const panel = document.createElement("div");
  panel.className = "hint-panel";

  const badge = document.createElement("div");
  badge.className = "hint-badge";
  badge.textContent = "Two vowels are written with this same mark.";
  panel.appendChild(badge);

  const revealed = hints.slice(0, hintState.hintsRevealed || 0);
  if (revealed.length > 0) {
    const list = document.createElement("ul");
    list.className = "hint-list";
    for (const h of revealed) {
      const li = document.createElement("li");
      li.textContent = h.text;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }

  if ((hintState.hintsRevealed || 0) < hints.length) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline btn-sm";
    btn.textContent = "Show Hint";
    btn.addEventListener("click", () => {
      hintState.hintsRevealed = (hintState.hintsRevealed || 0) + 1;
      onReveal();
    });
    panel.appendChild(btn);
  }
  container.appendChild(panel);
}

/** A small always-visible class note under a mark, for timed games where a
 * button would be too slow. Only appears for the identical-looking pair. */
export function sharedFormNote(set, row) {
  if (set.id !== "vowels" || !isSharedForm(row, set.rows())) return "";
  return `<div class="caption" style="margin-top:6px;">Hint: this vowel is in the ${row.Class} class.</div>`;
}

// ================= Shared rendering =================

export function renderPrompt(container, set, row, promptWith, { showSharedNote = false } = {}) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  if (promptWith === "symbol") {
    div.innerHTML = `<span lang="he" dir="rtl">${row.Form || ""}</span>${showSharedNote ? sharedFormNote(set, row) : ""}`;
  } else {
    div.innerHTML = set.promptNameHtml(row);
  }
  container.appendChild(div);
}

/** The single "type the letter / vowel" answer field with its keyboard button. */
export function renderAnswerInput(container, { set, row, userState, checked, onEnter, autofocus }) {
  const field = document.createElement("div");
  field.className = "field-group";

  const isCorrect = checked && isFormAnswerCorrect(row, userState.answer);
  const label = document.createElement("div");
  label.className = "field-label" + (checked ? (isCorrect ? " pill-good" : " pill-warn") : "");
  label.textContent = set.answerLabel;
  field.appendChild(label);

  const rowEl = document.createElement("div");
  rowEl.style.display = "flex";
  rowEl.style.gap = "8px";

  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("dir", "rtl");
  input.setAttribute("lang", "he");
  input.style.fontFamily = "var(--font-hebrew)";
  input.style.fontSize = "1.25rem";
  input.value = userState.answer;
  input.addEventListener("input", () => {
    userState.answer = input.value;
  });
  if (onEnter) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onEnter();
      }
    });
  }
  if (autofocus) setTimeout(() => input.focus(), 0);

  const kbBtn = document.createElement("button");
  kbBtn.type = "button";
  kbBtn.className = "btn btn-outline btn-sm";
  kbBtn.style.flexShrink = "0";
  kbBtn.textContent = set.keyboardButtonLabel;
  kbBtn.addEventListener("click", () => (set.keyboardKind === "vowel" ? openVowelKeyboard(input) : openHebrewKeyboard(input)));

  rowEl.appendChild(input);
  rowEl.appendChild(kbBtn);
  field.appendChild(rowEl);
  container.appendChild(field);
}

/** Multiple-choice "which keyboard shortcut types this?" question. */
export function renderKeyboardChoiceInput(container, { row, options, userState, checked, onSelect }) {
  const field = document.createElement("div");
  field.className = "field-group";

  const label = document.createElement("div");
  label.className =
    "field-label" + (checked ? (isKeyboardAnswerCorrect(row, userState.answer) ? " pill-good" : " pill-warn") : "");
  label.textContent = "Keyboard Input";
  field.appendChild(label);

  const group = document.createElement("div");
  group.className = "choice-group";
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn game-option-btn" + (userState.answer === opt && !checked ? " selected" : "");
    btn.textContent = opt;
    if (checked) {
      btn.disabled = true;
      if (opt === row.Keyboard) btn.classList.add("game-choice-good");
      else if (opt === userState.answer) btn.classList.add("game-choice-bad");
    }
    btn.addEventListener("click", () => {
      userState.answer = opt;
      if (onSelect) onSelect(opt);
    });
    group.appendChild(btn);
  }
  field.appendChild(group);
  container.appendChild(field);
}

export function renderRevealedAnswer(container, row) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  div.innerHTML = `<span lang="he" dir="rtl">${row.Form || ""}</span>`;
  container.appendChild(div);
}

export function renderRevealedKeyboardAnswer(container, row) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  div.innerHTML = `<span style="font-family: var(--font-mono); font-size: 1.3rem;">${row.Keyboard || ""}</span>`;
  container.appendChild(div);
}

export { wrapHebrewSpans };
