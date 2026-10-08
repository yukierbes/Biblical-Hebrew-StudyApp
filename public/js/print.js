import { wrapHebrewSpans } from "./helpers.js";

const MORPH_COLUMNS = ["Binyan", "Mode", "Person", "Gender", "Number"];
const CARDS_PER_ROW = 3;
const ROWS_PER_PAGE = 4;
const CARDS_PER_PAGE = CARDS_PER_ROW * ROWS_PER_PAGE;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Printed cards are a FIXED height (see .flashcard in style.css) — that is
 * what guarantees each back lines up exactly behind its front, since a
 * card that grew to fit extra text would push every row below it out of
 * line with the other side. Text that wouldn't fit at full size (a long
 * vocabulary definition, an idiom) is shrunk in steps instead, via the
 * .fit-1/.fit-2/.fit-3 classes. Hebrew niqqud/cantillation marks are
 * combining characters that take up no width, so they're not counted.
 */
const FIT_STEPS_HEBREW = [12, 18, 24];
const FIT_STEPS_LATIN = [40, 70, 110];

function fitClass(text, steps) {
  const length = String(text || "").replace(/[\u0591-\u05C7]/g, "").length;
  const step = steps.filter((limit) => length > limit).length;
  return step ? ` fit-${step}` : "";
}

/** The header printed at the top of EVERY page, front and back alike. */
function pageHeaderHtml(title, label) {
  return `<div class="print-header"><h1 class="print-title">${escapeHtml(title)}</h1><div class="print-page-label">${label}</div></div>`;
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function frontCardHtml(row, frontField) {
  const hebrew = wrapHebrewSpans(row[frontField] || "");
  const fit = fitClass(row[frontField], FIT_STEPS_HEBREW);
  return `<div class="flashcard flashcard-front"><div class="flashcard-hebrew${fit}">${hebrew}</div></div>`;
}

function backCardHtml(row, backField, metaFields, { backFieldIsHebrew = false, secondaryField = null } = {}) {
  const gloss = wrapHebrewSpans(row[backField] || "");
  const glossClass =
    "flashcard-gloss" +
    (backFieldIsHebrew ? " flashcard-gloss-hebrew" : "") +
    fitClass(row[backField], backFieldIsHebrew ? FIT_STEPS_HEBREW : FIT_STEPS_LATIN);
  const secondaryHtml = secondaryField
    ? `<div class="flashcard-gloss-secondary${fitClass(row[secondaryField], FIT_STEPS_LATIN)}">${row[secondaryField] || ""}</div>`
    : "";
  const morph = metaFields.map((c) => row[c]).filter(Boolean).join(" · ");
  return `
    <div class="flashcard flashcard-back">
      <div class="${glossClass}">${gloss}</div>
      ${secondaryHtml}
      <div class="flashcard-morph">${morph}</div>
    </div>
  `;
}

/**
 * Renders `rows` as a double-sided printable flashcard sheet and opens
 * the browser's print dialog — from there the person can print to paper
 * (with double-sided/duplex turned on) or "Save as PDF".
 *
 * Each physical sheet gets a "front" page (Hebrew only) immediately
 * followed by its "back" page (gloss + parsing) — printing double-sided
 * puts them on opposite sides of the same sheet. The back page's rows
 * are mirrored (column order reversed) to match the standard "flip on
 * long edge" duplex convention: the card in the top-left of the front
 * ends up lined up behind the card that was in the top-right of the
 * back-as-printed, so flipping the physical sheet over reveals the
 * matching answer in the same spot.
 *
 * Every page — front AND back, every sheet — carries the identical
 * header (title + "Front"/"Back" label) and every card is a fixed
 * height, so the card grid starts at the same spot on both sides of a
 * sheet and each row stays level with its counterpart. (Previously only
 * the very first front page had a title, which pushed that one sheet's
 * fronts lower than its backs.)
 *
 * `frontField` names the row property shown (in Hebrew) on the front of
 * the card, `backField` the property shown as the answer on the back,
 * and `metaFields` any extra columns (e.g. morphology, part of speech)
 * shown in small text underneath the answer. Defaults match the verb
 * dataset's column names so existing callers are unaffected.
 *
 * `backFieldIsHebrew` styles the back's primary answer in the Hebrew
 * font/RTL instead of the default body font/LTR — for datasets (like
 * Accents) whose "answer" is itself Hebrew text rather than a gloss.
 * `secondaryField`, if given, adds one more line between the primary
 * answer and the meta line (e.g. an English name under a Hebrew one).
 */
export function printFlashcards(
  rows,
  {
    title = "Flashcards",
    frontField = "Conjugation",
    backField = "Gloss Translation",
    metaFields = MORPH_COLUMNS,
    backFieldIsHebrew = false,
    secondaryField = null,
  } = {}
) {
  let printArea = document.getElementById("print-area");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "print-area";
    document.body.appendChild(printArea);
  }

  const pages = chunk(rows, CARDS_PER_PAGE);
  let html = "";

  pages.forEach((pageRows, pageIdx) => {
    const rowsOfCards = chunk(pageRows, CARDS_PER_ROW);
    const isLastPage = pageIdx === pages.length - 1;

    const frontHtml = rowsOfCards
      .map(
        (rowCards) =>
          `<div class="flashcard-row">${rowCards.map((r) => frontCardHtml(r, frontField)).join("")}</div>`
      )
      .join("");

    // Same cards, same rows, with the left-to-right order reversed (see
    // the function doc comment above for why) — and packed against the
    // RIGHT edge of the row rather than the left. That second part
    // matters for partial rows specifically: a lone reversed card would
    // otherwise still land in the leftmost slot by default, but it
    // needs to occupy the rightmost slot for the mirror-flip math to
    // land it in the correct spot (a full 3-card row is unaffected
    // either way, since it fills the whole row regardless of anchor).
    const backHtml = rowsOfCards
      .map((rowCards) => {
        const reversed = [...rowCards].reverse();
        return `<div class="flashcard-row flashcard-row-back">${reversed
          .map((r) => backCardHtml(r, backField, metaFields, { backFieldIsHebrew, secondaryField }))
          .join("")}</div>`;
      })
      .join("");

    html += `
      <div class="print-page">
        ${pageHeaderHtml(title, "Front")}
        <div class="flashcard-grid">${frontHtml}</div>
      </div>
      <div class="print-page${isLastPage ? " print-page-last" : ""}">
        ${pageHeaderHtml(title, "Back (answers)")}
        <div class="flashcard-grid">${backHtml}</div>
      </div>
    `;
  });

  printArea.innerHTML = html;
  window.print();
}
