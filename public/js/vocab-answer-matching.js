import { wrapHebrewSpans } from "./helpers.js";
import { openHebrewKeyboard } from "./hebrew-keyboard.js";

// ================= Answer normalization / matching =================

export function normalizeHebrew(s) {
  return (s || "").normalize("NFC").trim();
}

// The Hebrew column sometimes lists more than one accepted spelling for
// the same word, separated by a comma or semicolon (e.g. "מָה , מֶה ,
// מַה" — three spellings of "what"). Any one of them counts as correct;
// the person is never expected to enter more than one.
export function hebrewVariants(hebrewField) {
  return (hebrewField || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isHebrewAnswerCorrect(userValue, hebrewField) {
  const norm = normalizeHebrew(userValue);
  if (!norm) return false;
  return hebrewVariants(hebrewField).some((v) => normalizeHebrew(v) === norm);
}

// The English column lists synonyms separated by commas/semicolons,
// often with a parenthetical grammar note (e.g. "(prep) unto, into, to,
// towards"). Grading strips those notes and a leading "to " from each
// side, then accepts the answer as long as every word/phrase the person
// typed is one of the accepted synonyms — they don't need to list all
// of them. E.g. correct "to go, come, enter" accepts a typed answer of
// "to enter, go".
export function englishPhrases(englishField) {
  const raw = (englishField || "").trim();
  const cleaned = raw.replace(/\([^)]*\)/g, " ");
  let phrases = cleaned
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .map((s) => s.replace(/^to\s+/, ""))
    .filter(Boolean);
  if (phrases.length === 0 && raw) {
    // The entire field was parenthetical (a small number of purely
    // grammatical entries, e.g. "(accusative particle; definite object
    // marker; not translated)") — fall back to the raw text with just
    // its outer parens stripped, split the same way as everything
    // else, so a typed answer is checked against the same phrase
    // boundaries it was split into.
    phrases = raw
      .replace(/^\(|\)$/g, "")
      .split(/[,;]/)
      .map((s) => s.trim().toLowerCase())
      .map((s) => s.replace(/^to\s+/, ""))
      .filter(Boolean);
  }
  return phrases;
}

export function userPhrases(value) {
  return (value || "")
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .map((s) => s.replace(/^to\s+/, ""))
    .filter(Boolean);
}

export function isEnglishAnswerCorrect(userValue, englishField) {
  const valid = new Set(englishPhrases(englishField));
  const given = userPhrases(userValue);
  if (given.length === 0 || valid.size === 0) return false;
  return given.every((w) => valid.has(w));
}

/** direction = the side that was PROMPTED; the person types the other side. */
export function isAnswerCorrect(direction, word, userValue) {
  if (direction === "hebrew") return isEnglishAnswerCorrect(userValue, word.English);
  return isHebrewAnswerCorrect(userValue, word.Hebrew);
}

/** A single short, canonical display form for a word's answer on the
 * given side — the first accepted spelling/phrase. Used where a single
 * clean multiple-choice option or preview is needed rather than the
 * full (possibly long, multi-synonym) raw field. */
export function primaryAnswerText(word, direction) {
  if (direction === "hebrew") {
    const phrases = englishPhrases(word.English);
    return phrases[0] || (word.English || "").trim();
  }
  const variants = hebrewVariants(word.Hebrew);
  return variants[0] || (word.Hebrew || "").trim();
}

// ================= Shared rendering =================

export function renderPrompt(container, word, direction) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  if (direction === "hebrew") {
    div.innerHTML = wrapHebrewSpans(word.Hebrew || "");
  } else {
    div.innerHTML = `<span class="gloss-display" style="font-size:1.7rem; color:var(--ink); margin-top:0; direction:ltr; unicode-bidi:isolate;">${wrapHebrewSpans(word.English || "")}</span>`;
  }
  container.appendChild(div);
}

/**
 * Renders the single "type the other side" answer field. `userState` is
 * a plain object with an `answer` string field, mutated in place as the
 * person types. When `checked` is true, the field's label is colored to
 * show whether it currently matches a valid answer. `onEnter`, if
 * given, fires when Enter is pressed in the input (for fast-paced game
 * modes that submit on Enter rather than a separate button click).
 */
export function renderAnswerInput(container, { direction, word, userState, checked, onEnter, autofocus }) {
  const field = document.createElement("div");
  field.className = "field-group";

  const isCorrect = checked && isAnswerCorrect(direction, word, userState.answer);
  const label = document.createElement("div");
  label.className = "field-label" + (checked ? (isCorrect ? " pill-good" : " pill-warn") : "");
  label.textContent = direction === "hebrew" ? "English" : "Hebrew";
  field.appendChild(label);

  function wireInput(input) {
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
      // Deferred so the element is attached to the document first —
      // focusing a detached node is a silent no-op in some browsers.
      setTimeout(() => input.focus(), 0);
    }
  }

  if (direction === "hebrew") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = userState.answer;
    wireInput(input);
    field.appendChild(input);
  } else {
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
    wireInput(input);

    const kbBtn = document.createElement("button");
    kbBtn.type = "button";
    kbBtn.className = "btn btn-outline btn-sm";
    kbBtn.style.flexShrink = "0";
    kbBtn.textContent = "Hebrew Keyboard";
    kbBtn.addEventListener("click", () => openHebrewKeyboard(input));

    row.appendChild(input);
    row.appendChild(kbBtn);
    field.appendChild(row);
  }

  container.appendChild(field);
}

export function renderRevealedAnswer(container, word, direction) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  if (direction === "hebrew") {
    div.innerHTML = `<span class="gloss-display" style="margin-top:0; font-size:1.25rem;">${wrapHebrewSpans(word.English || "")}</span>`;
  } else {
    div.innerHTML = wrapHebrewSpans(word.Hebrew || "");
  }
  container.appendChild(div);
}
