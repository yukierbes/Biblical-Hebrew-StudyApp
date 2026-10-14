// Lenient checking of a typed NAME (e.g. "sere" for ṣere) for the Typing pages
// on Consonants, Vowels and Accents, plus the little text box they type into.
//
// The names in the data carry transliteration marks (ṣ, š, ḥ, ā, ê …) that are
// awkward to type, so the check ignores them: capital letters, spaces, hyphens,
// apostrophes and every mark above or below a letter. "sere", "Sere" and "ṣere"
// are all accepted for ṣere; "hatef patah" for ḥāṭef-pataḥ; "sureq" for šureq.
//
// Two extra allowances:
//   - š may also be typed "sh" (shureq, shin, resh), the usual English spelling.
//   - a name with a bracketed alternative, "vav (waw)", accepts either name, but a
//     bracketed "(dagesh)" is part of the name ("bet (dagesh)" is NOT just "bet").
//
// One guard: śin and šin both boil down to "sin". Typing the bare "sin" is
// accepted for either (it cannot be told apart without the marks), but if the
// person DID type a mark and it spells the other letter's name exactly ("śin"
// for šin), that is marked wrong.

/** Lower-case, one fixed Unicode form, and no spaces/hyphens/apostrophes/brackets. */
function fold(s) {
  return String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\-\u2010-\u2015'\u2019\u02bc\u02be\u02bf`()]/g, "");
}

/** `fold`, and then every combining mark removed (ṣ → s, ā → a, ê → e). */
function bare(s) {
  return fold(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Every spelling that counts as a correct answer for one name. */
function spellings(name) {
  const out = new Set();
  const add = (n) => {
    const b = bare(n);
    if (!b) return;
    out.add(b);
    // š is also written "sh" — š is "s" + a caron, so look at the folded form.
    out.add(fold(n).normalize("NFD").replace(/s\u030c/g, "sh").replace(/[\u0300-\u036f]/g, ""));
  };
  add(name);
  const m = String(name ?? "").match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m && fold(m[2]) !== "dagesh") {
    add(m[1]); // "vav"
    add(m[2]); // "waw"
  }
  return out;
}

/**
 * Is `typed` an acceptable spelling of the name of any row in `answers`?
 *
 *   answers   the rows that count as right — the prompted row, plus any row that
 *             looks identical (qameṣ / qameṣ-ḥaṭuf, or accents written with the
 *             same mark), because the mark alone cannot tell them apart
 *   nameOf    row → its name
 *   allRows   every row of the set, so the śin/šin guard knows the other names
 */
export function isNameAnswerCorrect(typed, answers, nameOf, allRows = []) {
  const raw = fold(typed);
  if (!raw) return false;

  // Typed with its marks and exactly another letter's name → that is the other one.
  const hasMarks = raw !== bare(typed);
  if (hasMarks) {
    const exactNames = new Set(answers.map((r) => fold(nameOf(r))));
    if (!exactNames.has(raw) && allRows.some((r) => fold(nameOf(r)) === raw)) return false;
  }

  const typedBare = bare(typed);
  for (const row of answers) {
    const ok = spellings(nameOf(row));
    if (ok.has(typedBare) || ok.has(raw)) return true;
  }
  return false;
}

/** The rows that look the same as `row` (same mark), `row` included. */
export function lookAlikes(row, allRows, markOf) {
  const mark = markOf(row);
  if (!mark) return [row];
  const same = allRows.filter((r) => markOf(r) === mark);
  return same.includes(row) ? same : [row, ...same];
}

/** The name(s) to show as "the answer": the row's own, then any look-alike's. */
export function nameAnswerText(row, answers, nameOf) {
  const names = [];
  for (const r of [row, ...answers]) {
    const n = nameOf(r);
    if (n && !names.includes(n)) names.push(n);
  }
  return names.join(" / ");
}

/**
 * The "type the name" box used by all three Typing pages. `userState.answer` is
 * updated as the person types. When `checked`, the label is coloured to show
 * whether the answer was accepted.
 */
export function renderNameInput(container, { label, userState, checked, isCorrect, onEnter, autofocus }) {
  const field = document.createElement("div");
  field.className = "field-group";

  const lbl = document.createElement("div");
  lbl.className = "field-label" + (checked ? (isCorrect ? " pill-good" : " pill-warn") : "");
  lbl.textContent = label;
  field.appendChild(lbl);

  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.placeholder = "Type the name — marks like ṣ or š are not needed";
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
  field.appendChild(input);
  container.appendChild(field);
}

/** The revealed answer for "Show Answer": the name(s), in plain text. */
export function renderRevealedName(container, text) {
  const div = document.createElement("div");
  div.className = "hebrew-display";
  div.innerHTML = `<div class="gloss-display" style="font-size:1.8rem;"></div>`;
  div.firstChild.textContent = text;
  container.appendChild(div);
}
