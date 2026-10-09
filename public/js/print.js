import { wrapHebrewSpans } from "./helpers.js";

// Each entry is either a column name or an ARRAY of column names. An array
// is a group whose values are glued together with no separator — so a verb
// reads "Qal · Perfect · 2MS" rather than "Qal · Perfect · 2 · M · S".
// (Entries are separated from each other by " · ".)
const MORPH_COLUMNS = ["Binyan", "Mode", ["Person", "Gender", "Number"]];
const CARDS_PER_ROW = 3;
const ROWS_PER_PAGE = 4;
const CARDS_PER_PAGE = CARDS_PER_ROW * ROWS_PER_PAGE;

// ---------- Auto-fit: text must never reach the card border ----------
//
// Every printed card is a FIXED size, with a safe margin of empty space
// (the card's padding, see style.css) between the text and the border so
// nothing gets clipped when the cards are cut out. Text that is too long
// for that inner box is shrunk, by measuring it — not guessing from its
// length — until it fits.
//
// The measuring happens in a hidden copy of the print layout whose grid is
// REF_GRID_WIDTH_PX wide. That's deliberately NARROWER than the grid on real
// paper (about 717px on A4 and 739px on US Letter, because the pages have
// a fixed 0.4in margin — see style.css), and a card that fits in a narrower
// box always fits in a wider one, so what fits here fits on paper too —
// including if someone prints at up to roughly 115% zoom, which narrows the
// layout. (Very small paper such as A5 is narrower still and isn't covered.)
const REF_GRID_WIDTH_PX = 640;
const MIN_FIT = 0.4; // smallest the main text will ever be scaled to
const FIT_TOLERANCE = 0.01;

/**
 * Largest scale in [min, 1] at which `fits(scale)` is true. Returns 1 if
 * the text already fits at full size, and `min` if it doesn't even fit at
 * the smallest allowed size (there's nothing more that can be done then).
 * `fits` must be monotonic: if it fits at some scale, it fits at any smaller one.
 */
export function findFitScale(fits, { min = MIN_FIT, tolerance = FIT_TOLERANCE } = {}) {
  if (fits(1)) return 1;
  if (!fits(min)) return min;
  let lo = min; // known to fit
  let hi = 1; // known not to fit
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Shrinks one card's text (via its --fit variable) until it fits the card's inner box. */
function fitCard(card) {
  const body = card.firstElementChild; // the .flashcard-body wrapper
  if (!body) return;
  const style = window.getComputedStyle(card);
  const availableHeight =
    card.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
  if (!(availableHeight > 0)) return; // no layout (nothing to measure)

  const textBlocks = [...body.children];
  const fits = (scale) => {
    card.style.setProperty("--fit", String(scale));
    const tallEnough = body.getBoundingClientRect().height <= availableHeight - 1;
    // A single very long word can't wrap, so it can poke out sideways.
    const wideEnough = textBlocks.every((el) => el.scrollWidth <= el.clientWidth + 1);
    return tallEnough && wideEnough;
  };

  const scale = findFitScale(fits);
  if (scale >= 1) card.style.removeProperty("--fit");
  else card.style.setProperty("--fit", scale.toFixed(3));
}

/**
 * Briefly lays the (normally hidden) print area out off-screen at the width
 * it will have on paper, shrinks any card whose text doesn't fit, then
 * hides it again.
 */
function fitAllCards(printArea) {
  const cards = printArea.querySelectorAll(".flashcard");
  if (cards.length === 0) return;

  const originalStyle = printArea.getAttribute("style");
  const firstPage = printArea.querySelector(".print-page");
  printArea.style.cssText =
    "display:block;position:fixed;left:-100000px;top:0;visibility:hidden;width:2000px;";
  try {
    // The page's side padding is part of its width, so measure it first
    // and set the area to (grid width + padding on both sides).
    const pageStyle = window.getComputedStyle(firstPage);
    const sidePadding = (parseFloat(pageStyle.paddingLeft) || 0) + (parseFloat(pageStyle.paddingRight) || 0);
    printArea.style.width = `${REF_GRID_WIDTH_PX + sidePadding}px`;
    cards.forEach(fitCard);
  } finally {
    if (originalStyle === null) printArea.removeAttribute("style");
    else printArea.setAttribute("style", originalStyle);
  }
}

// ---------- Card markup ----------

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

/** "Qal · Perfect · 2MS" — see MORPH_COLUMNS for how groups are glued together. */
function metaText(row, metaFields) {
  return metaFields
    .map((field) =>
      Array.isArray(field) ? field.map((c) => row[c]).filter(Boolean).join("") : row[field]
    )
    .filter(Boolean)
    .join(" · ");
}

function frontCardHtml(row, frontField) {
  const hebrew = wrapHebrewSpans(row[frontField] || "");
  return `<div class="flashcard flashcard-front"><div class="flashcard-body"><div class="flashcard-hebrew">${hebrew}</div></div></div>`;
}

function backCardHtml(row, backField, metaFields, { backFieldIsHebrew = false, secondaryField = null } = {}) {
  const gloss = wrapHebrewSpans(row[backField] || "");
  const glossClass = "flashcard-gloss" + (backFieldIsHebrew ? " flashcard-gloss-hebrew" : "");
  const secondaryHtml = secondaryField
    ? `<div class="flashcard-gloss-secondary">${row[secondaryField] || ""}</div>`
    : "";
  const morph = metaText(row, metaFields);
  return `<div class="flashcard flashcard-back"><div class="flashcard-body"><div class="${glossClass}">${gloss}</div>${secondaryHtml}<div class="flashcard-morph">${morph}</div></div></div>`;
}

/**
 * Renders `rows` as a double-sided printable flashcard sheet and opens
 * the browser's print dialog — from there the person can print to paper
 * (with double-sided/duplex turned on) or "Save as PDF".
 *
 * The printed pages contain ONLY the cards: no title, no "Front"/"Back"
 * labels, nothing else (saves ink, and keeps every page's card grid in
 * exactly the same place). The browser's own header/footer text (date,
 * page title, URL, page numbers) is suppressed by the `@page { margin: 0 }`
 * rule in style.css, with the pages' own fixed padding standing in for
 * the usual paper margin.
 *
 * Each physical sheet gets a "front" page (Hebrew only) immediately
 * followed by its "back" page (gloss + parsing) — printing double-sided
 * puts them on opposite sides of the same sheet. The back page's rows
 * are mirrored (column order reversed) to match the standard "flip on
 * long edge" duplex convention: the card in the top-left of the front
 * ends up lined up behind the card that was in the top-right of the
 * back-as-printed, so flipping the physical sheet over reveals the
 * matching answer in the same spot. Both pages start their card grid at
 * the same place and every card is the same fixed size, so each row on
 * the back sits exactly behind the matching row on the front.
 *
 * `frontField` names the row property shown (in Hebrew) on the front of
 * the card, `backField` the property shown as the answer on the back,
 * and `metaFields` any extra columns (e.g. morphology, part of speech)
 * shown in small text underneath the answer — an entry that is itself
 * an array of column names is printed as one run with no separators
 * (see MORPH_COLUMNS). Defaults match the verb dataset's column names so
 * existing callers are unaffected.
 *
 * `backFieldIsHebrew` styles the back's primary answer in the Hebrew
 * font/RTL instead of the default body font/LTR — for datasets (like
 * Accents) whose "answer" is itself Hebrew text rather than a gloss.
 * `secondaryField`, if given, adds one more line between the primary
 * answer and the meta line (e.g. an English name under a Hebrew one).
 *
 * `title` is still accepted so existing callers keep working, but it is
 * no longer printed anywhere.
 */
export function printFlashcards(
  rows,
  {
    title = "Flashcards", // accepted for compatibility; no longer printed
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
      <div class="print-page"><div class="flashcard-grid">${frontHtml}</div></div>
      <div class="print-page${isLastPage ? " print-page-last" : ""}"><div class="flashcard-grid">${backHtml}</div></div>
    `;
  });

  printArea.innerHTML = html;
  fitAllCards(printArea);
  window.print();
}
