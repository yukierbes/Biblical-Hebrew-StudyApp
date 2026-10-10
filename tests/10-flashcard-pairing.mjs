import { setupApp, assert, summary } from "./helpers.mjs";
import { printFlashcards, findFitScale } from "../public/js/print.js";

const { document } = await setupApp();

console.log("Flashcard double-sided print pairing");

// 8 fake rows: enough to span more than one row (3 per row) but stay
// within a single page (15 per page: 5 rows of 3), so we can check the reversal
// math cleanly without also needing to check page-boundary behavior.
const rows = Array.from({ length: 8 }, (_, i) => ({
  Conjugation: `HEB${i}`,
  "Gloss Translation": `gloss${i}`,
  Binyan: "Qal",
  Mode: "Perfect",
  Person: "3",
  Gender: "M",
  Number: "S",
}));

printFlashcards(rows, { title: "Test Deck" });

const printArea = document.getElementById("print-area");
const pages = printArea.querySelectorAll(".print-page");
assert(pages.length === 2, "8 cards at 15/page produces exactly 2 pages (1 front + 1 back)");

const frontPage = pages[0];
const backPage = pages[1];

// The printed pages carry ONLY cards — no title, no "Front"/"Back" label,
// nothing else (saves ink, and keeps every page's grid in the same place).
assert(
  frontPage.querySelectorAll(".flashcard-front").length === 8 && frontPage.querySelectorAll(".flashcard-back").length === 0,
  "first page holds only the 8 front cards"
);
assert(
  backPage.querySelectorAll(".flashcard-back").length === 8 && backPage.querySelectorAll(".flashcard-front").length === 0,
  "second page holds only the 8 back cards"
);
assert(
  !printArea.querySelector(".print-title, .print-page-label, .print-header, h1"),
  "no title, Front/Back label or header anywhere on the printed pages"
);
assert(
  [...pages].every((pg) => pg.children.length === 1 && pg.firstElementChild.classList.contains("flashcard-grid")),
  "each page contains nothing but its card grid"
);

const frontRows = frontPage.querySelectorAll(".flashcard-row");
const backRows = backPage.querySelectorAll(".flashcard-row");
assert(frontRows.length === 3, "8 cards at 3/row makes 3 rows (3,3,2)");
assert(backRows.length === 3, "back page has the same number of rows as front");

function hebrewTextOf(card) {
  return card.querySelector(".flashcard-hebrew")?.textContent;
}
function glossTextOf(card) {
  return card.querySelector(".flashcard-gloss")?.textContent;
}

// Row 0 (full row of 3): front = [HEB0, HEB1, HEB2] left-to-right.
// Back row must be the REVERSE order: [gloss2, gloss1, gloss0].
const frontRow0Cards = [...frontRows[0].querySelectorAll(".flashcard-front")];
const backRow0Cards = [...backRows[0].querySelectorAll(".flashcard-back")];
assert(frontRow0Cards.map(hebrewTextOf).join(",") === "HEB0,HEB1,HEB2", "front row 0 is in normal order");
assert(
  backRow0Cards.map(glossTextOf).join(",") === "gloss2,gloss1,gloss0",
  "back row 0 is the mirrored (reversed) order, so flipping the sheet lines each answer up behind its question"
);

// Row 2 is a partial row (only 2 cards: HEB6, HEB7). Reversal must still
// only reverse within that row's actual 2 cards, not assume 3.
const frontRow2Cards = [...frontRows[2].querySelectorAll(".flashcard-front")];
const backRow2Cards = [...backRows[2].querySelectorAll(".flashcard-back")];
assert(frontRow2Cards.map(hebrewTextOf).join(",") === "HEB6,HEB7", "partial last row keeps normal front order");
assert(
  backRow2Cards.map(glossTextOf).join(",") === "gloss7,gloss6",
  "partial last row's back is still correctly reversed within just its own 2 cards"
);

// Front cards should show ONLY Hebrew (no gloss/morph leaking onto the question side).
assert(frontPage.querySelectorAll(".flashcard-gloss").length === 0, "front cards contain no gloss text");
assert(frontPage.querySelectorAll(".flashcard-morph").length === 0, "front cards contain no morphology text");

// Back cards should show gloss + morphology, no Hebrew (the answer side
// doesn't repeat the question).
assert(backPage.querySelectorAll(".flashcard-hebrew").length === 0, "back cards contain no Hebrew text");
assert(backPage.querySelectorAll(".flashcard-morph").length === 8, "every back card shows its morphology breakdown");

// Only the very last page should skip the forced page break.
assert(!frontPage.classList.contains("print-page-last"), "front page still forces a page break after it");
assert(backPage.classList.contains("print-page-last"), "the final (back) page does not force a trailing page break");

// --- Multi-page: more than 15 cards should split into multiple front/back pairs ---
const manyRows = Array.from({ length: 20 }, (_, i) => ({
  Conjugation: `H${i}`,
  "Gloss Translation": `g${i}`,
  Binyan: "Qal",
  Mode: "Perfect",
  Person: "3",
  Gender: "M",
  Number: "S",
}));
printFlashcards(manyRows, { title: "Big Deck" });
const manyPages = printArea.querySelectorAll(".print-page");
assert(manyPages.length === 4, "20 cards at 15/page produces 2 page-pairs = 4 print pages");
assert(
  printArea.querySelectorAll(".flashcard-front").length === 20,
  "all 20 cards appear exactly once as fronts across both page-pairs"
);
assert(
  printArea.querySelectorAll(".flashcard-back").length === 20,
  "all 20 cards appear exactly once as backs across both page-pairs"
);
assert(
  [...manyPages].filter((p) => p.classList.contains("print-page-last")).length === 1,
  "exactly one page (the very last) skips the forced page break, even across multiple page-pairs"
);

// --- Page capacity: a sheet holds 5 rows of 3 cards (15), on each side. ---
{
  const deck = (n) => manyRows.concat(manyRows).slice(0, n);
  const sheetsFor = (n) => {
    printFlashcards(deck(n), { title: "Capacity" });
    return printArea.querySelectorAll(".print-page").length / 2;
  };
  assert(sheetsFor(15) === 1, "exactly 15 cards fit on one sheet (one front page + one back page)");
  assert(sheetsFor(16) === 2, "a 16th card starts a second sheet");
  assert(sheetsFor(30) === 2, "30 cards make 2 full sheets");
  assert(sheetsFor(31) === 3, "a 31st card starts a third sheet");

  printFlashcards(deck(15), { title: "Capacity" });
  const [front15, back15] = printArea.querySelectorAll(".print-page");
  assert(front15.querySelectorAll(".flashcard-row").length === 5, "a full front page has 5 rows");
  assert(back15.querySelectorAll(".flashcard-row").length === 5, "a full back page has 5 rows");
  assert(
    [...front15.querySelectorAll(".flashcard-row")].every((r) => r.children.length === 3),
    "each of those rows has 3 cards"
  );
  printFlashcards(deck(16), { title: "Capacity" });
  const secondFront = printArea.querySelectorAll(".print-page")[2];
  assert(secondFront.querySelectorAll(".flashcard").length === 1, "the 16th card sits alone on the next sheet");
}

// --- The exact reported bug: 1 or 2 cards (a partial row) must have
// their back-row packed against the RIGHT edge, not the left, so the
// mirror-flip lands the answer in the correct spot. A front row always
// packs from the left (default); only the back row needs flex-end. ---
printFlashcards(
  [{ Conjugation: "SOLO", "Gloss Translation": "only one", Binyan: "Qal", Mode: "Perfect", Person: "3", Gender: "M", Number: "S" }],
  { title: "One Card" }
);
let onePages = printArea.querySelectorAll(".print-page");
let oneFrontRow = onePages[0].querySelector(".flashcard-row");
let oneBackRow = onePages[1].querySelector(".flashcard-row");
assert(!oneFrontRow.classList.contains("flashcard-row-back"), "a 1-card front row is NOT right-aligned (packs from the left, as normal)");
assert(oneBackRow.classList.contains("flashcard-row-back"), "a 1-card back row IS right-aligned, so it lands in the correct slot after flipping");

printFlashcards(
  [
    { Conjugation: "A", "Gloss Translation": "gA", Binyan: "Qal", Mode: "Perfect", Person: "3", Gender: "M", Number: "S" },
    { Conjugation: "B", "Gloss Translation": "gB", Binyan: "Qal", Mode: "Perfect", Person: "3", Gender: "M", Number: "S" },
  ],
  { title: "Two Cards" }
);
let twoPages = printArea.querySelectorAll(".print-page");
let twoBackRow = twoPages[1].querySelector(".flashcard-row");
let twoBackCards = [...twoBackRow.querySelectorAll(".flashcard-back")];
assert(twoBackRow.classList.contains("flashcard-row-back"), "a 2-card back row is right-aligned");
assert(twoBackCards.map(glossTextOf).join(",") === "gB,gA", "the 2-card back row is still in reversed order (B, then A)");

// The right-align CSS rule itself must actually exist, since jsdom
// can't render the resulting visual position to check directly.
const cssText = (await import("fs")).readFileSync(
  new URL("../public/css/style.css", import.meta.url),
  "utf-8"
);
assert(
  /\.flashcard-row-back\s*\{[^}]*justify-content:\s*flex-end/.test(cssText),
  ".flashcard-row-back rule sets justify-content: flex-end in the stylesheet"
);

// --- Cards-only pages: nothing but the cards, on every page of a big deck.
printFlashcards(manyRows, { title: "Big Deck" });
const bigPages = [...printArea.querySelectorAll(".print-page")];
assert(bigPages.length === 4, "20 cards make 4 print pages (2 sheets)");
assert(
  bigPages.every((pg) => pg.querySelectorAll(".flashcard-grid").length === 1 && pg.children.length === 1),
  "every page, front and back, is just one card grid"
);
assert(
  !/Big Deck/.test(printArea.textContent),
  "the deck title is accepted but never printed"
);
assert(
  bigPages.map((pg) => (pg.querySelector(".flashcard-front") ? "F" : "B")).join("") === "FBFB",
  "pages alternate front, back, front, back across every sheet"
);

// --- Verb morphology line: "Qal · Perfect · 2MS" (person/gender/number
// glued together, not separated by bullets).
printFlashcards(
  [{ Conjugation: "X", "Gloss Translation": "you killed", Binyan: "Qal", Mode: "Perfect", Person: "2", Gender: "M", Number: "S" }],
  { title: "Verb" }
);
assert(
  printArea.querySelector(".flashcard-morph").textContent === "Qal · Perfect · 2MS",
  'verb morphology prints as "Qal · Perfect · 2MS"'
);
printFlashcards(
  [{ Conjugation: "X", "Gloss Translation": "killing", Binyan: "Qal", Mode: "Active Participle", Person: "", Gender: "F", Number: "P" }],
  { title: "Verb" }
);
assert(
  printArea.querySelector(".flashcard-morph").textContent === "Qal · Active Participle · FP",
  "a missing person is simply left out of the glued group (FP)"
);
printFlashcards(
  [{ Conjugation: "X", "Gloss Translation": "to kill", Binyan: "Qal", Mode: "Infinitive Construct", Person: "", Gender: "", Number: "" }],
  { title: "Verb" }
);
assert(
  printArea.querySelector(".flashcard-morph").textContent === "Qal · Infinitive Construct",
  "an entirely empty group leaves no stray separator"
);
// Other datasets still use plain " · " separated columns.
printFlashcards(
  [{ Hebrew: "א", English: "x", Lesson: "1A", POS: "Noun", Frequency: 5 }],
  { frontField: "Hebrew", backField: "English", metaFields: ["Lesson", "POS", "Frequency"] }
);
assert(
  printArea.querySelector(".flashcard-morph").textContent === "1A · Noun · 5",
  "vocabulary still prints its columns separated by bullets"
);

// --- Auto-fit search: finds the largest size that fits.
{
  const calls = [];
  // Pretend anything at or below 0.62 of full size fits.
  const fits = (scale) => (calls.push(scale), scale <= 0.62);
  const scale = findFitScale(fits);
  assert(scale <= 0.62 && scale > 0.6, `finds the largest fitting scale (got ${scale.toFixed(3)}, expected just under 0.62)`);
  assert(findFitScale(() => true) === 1, "text that already fits is left at full size");
  assert(findFitScale(() => false) === 0.4, "text that fits at no size is clamped to the minimum scale");
  assert(findFitScale((x) => x <= 0.5, { min: 0.45 }) >= 0.45, "never goes below the requested minimum");
  assert(calls.length < 20, "the search is quick (binary search, not a slow scan)");
}

// --- Stylesheet: the things the alignment and safe margin depend on
// (jsdom can't lay anything out, so these are checked in the CSS itself;
// the real measurements are done by printing to PDF in a real browser).
const cssNoComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
assert(/@page\s*\{[^}]*margin:\s*0\s*;?[^}]*\}/.test(cssNoComments), "@page margin is 0 (so the browser prints no date/title/URL/page-number text)");
assert(/\.print-page\s*\{[^}]*padding:\s*0\.4in/.test(cssNoComments), "pages supply their own fixed margin instead");
assert(
  /\.flashcard\s*\{[^}]*(^|[\s;])height:\s*\d+px/.test(cssNoComments) &&
    !/\.flashcard\s*\{[^}]*min-height/.test(cssNoComments),
  ".flashcard has a fixed height (not a growable min-height)"
);
assert(/\.flashcard\s*\{[^}]*padding:\s*1[2-9]px/.test(cssNoComments), ".flashcard has a safe inner margin (padding) so text never reaches the border");
{
  const px = (re) => parseFloat((cssNoComments.match(re) || [])[1]);
  const answerRem = px(/\.flashcard-gloss\s*\{[^}]*font-size:\s*calc\(\s*([\d.]+)rem/);
  const morphRem = px(/\.flashcard-morph\s*\{[^}]*font-size:\s*([\d.]+)rem/);
  assert(morphRem <= answerRem * 0.65, `the small reference line (${morphRem}rem) is much smaller than the answer (${answerRem}rem)`);
}

summary();
