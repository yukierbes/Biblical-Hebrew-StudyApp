import { wrapHebrewSpans, sampleN } from "./helpers.js";
import { openAccentKeyboard } from "./accent-keyboard.js";

// ================= Answer normalization / matching =================

function normalizeSymbol(s) {
  return (s || "").normalize("NFC").trim();
}

/** promptWith = the side that was SHOWN ("names" or "symbol"); either
 * way the person always types the accent's Symbol using the Accent
 * Keyboard, so correctness only ever checks against `word.Symbol`. */
export function isAccentAnswerCorrect(word, userValue) {
  const norm = normalizeSymbol(userValue);
  if (!norm) return false;
  return norm === normalizeSymbol(word.Symbol);
}

/** The answer a typing-based game/quiz question is always graded
 * against — the accent's Symbol — for showing "correct answer was..."
 * feedback after a miss. */
export function primaryAccentAnswerText(word) {
  return word.Symbol || "";
}

/** Symbol → Select Keyboard Input tests the Keyboard column instead —
 * given the accent's Symbol, pick the SIL keyboard shortcut that types
 * it, so the person practices the actual key combo rather than the
 * mark itself. */
export function isKeyboardAnswerCorrect(word, selected) {
  return !!selected && selected === word.Keyboard;
}

/** Multiple-choice options for a Symbol → Keyboard question: the
 * correct Keyboard string plus up to 3 distractors sampled from other
 * rows in `pool`, deduplicated (several accents share the same
 * Keyboard shortcut across Prose/Poetry, so duplicates are dropped
 * rather than shown as separate options). */
export function buildKeyboardOptions(word, pool) {
  const correct = word.Keyboard || "";
  const distractPool = pool.filter((r) => r !== word);
  const shuffled = sampleN(distractPool, distractPool.length, false);

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

// ================= Shared rendering =================

export function renderAccentPrompt(container, word, promptWith) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  if (promptWith === "symbol") {
    div.innerHTML = `<span lang="he" dir="rtl">${word.Symbol || ""}</span>`;
  } else {
    div.innerHTML = `
      ${wrapHebrewSpans(word.HebrewName || "")}
      <div class="gloss-display" style="font-size:1.5rem; margin-top:6px;">${word.EnglishName || ""}</div>
    `;
  }
  container.appendChild(div);
}

/**
 * Renders the single "type the accent" answer field. `userState` is a
 * plain object with an `answer` string field, mutated in place as the
 * person types (or inserts via the Accent Keyboard). When `checked` is
 * true, the field's label is colored to show whether it currently
 * matches. `onEnter`, if given, fires when Enter is pressed (for
 * fast-paced game modes that submit on Enter).
 */
export function renderAccentAnswerInput(container, { word, userState, checked, onEnter, autofocus }) {
  const field = document.createElement("div");
  field.className = "field-group";

  const isCorrect = checked && isAccentAnswerCorrect(word, userState.answer);
  const label = document.createElement("div");
  label.className = "field-label" + (checked ? (isCorrect ? " pill-good" : " pill-warn") : "");
  label.textContent = "Accent";
  field.appendChild(label);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";

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
  if (autofocus) {
    setTimeout(() => input.focus(), 0);
  }

  const kbBtn = document.createElement("button");
  kbBtn.type = "button";
  kbBtn.className = "btn btn-outline btn-sm";
  kbBtn.style.flexShrink = "0";
  kbBtn.textContent = "Accent Keyboard";
  kbBtn.addEventListener("click", () => openAccentKeyboard(input));

  row.appendChild(input);
  row.appendChild(kbBtn);
  field.appendChild(row);

  container.appendChild(field);
}

/**
 * Renders a multiple-choice "which keyboard shortcut types this?"
 * question. `options` are pre-built Keyboard-string candidates (see
 * `buildKeyboardOptions`). `userState` is a plain object with a
 * `answer` string field holding the currently-selected option (empty
 * until one is picked). When `checked` is true, the correct option is
 * highlighted green and a wrong selection red, and all options lock.
 */
export function renderKeyboardChoiceInput(container, { word, options, userState, checked, onSelect }) {
  const field = document.createElement("div");
  field.className = "field-group";

  const label = document.createElement("div");
  label.className =
    "field-label" + (checked ? (isKeyboardAnswerCorrect(word, userState.answer) ? " pill-good" : " pill-warn") : "");
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
      if (opt === word.Keyboard) btn.classList.add("game-choice-good");
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

export function renderRevealedAccentAnswer(container, word) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  div.innerHTML = `<span lang="he" dir="rtl">${word.Symbol || ""}</span>`;
  container.appendChild(div);
}

/** Reveals the correct Keyboard shortcut for a Symbol → Keyboard
 * question (used by "Show Answer" in Practice mode). */
export function renderRevealedKeyboardAnswer(container, word) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  div.innerHTML = `<span style="font-family: var(--font-mono); font-size: 1.3rem;">${word.Keyboard || ""}</span>`;
  container.appendChild(div);
}
