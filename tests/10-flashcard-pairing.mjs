import { setupApp, assert, summary } from "./helpers.mjs";
import { printFlashcards } from "../js/print.js";

const { document } = await setupApp();

console.log("Flashcard double-sided print pairing");

// 8 fake rows: enough to span more than one row (3 per row) but stay
// within a single page (12 per page), so we can check the reversal
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
assert(pages.length === 2, "8 cards at 12/page produces exactly 2 pages (1 front + 1 back)");

const frontPage = pages[0];
const backPage = pages[1];

assert(frontPage.querySelector(".print-page-label").textContent === "Front", "first page is labeled Front");
assert(backPage.querySelector(".print-page-label").textContent.includes("Back"), "second page is labeled Back");
assert(frontPage.querySelector(".print-title")?.textContent === "Test Deck", "title appears on the front page");

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

// --- Multi-page: more than 12 cards should split into multiple front/back pairs ---
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
assert(manyPages.length === 4, "20 cards at 12/page produces 2 page-pairs = 4 print pages");
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
  new URL("../css/style.css", import.meta.url),
  "utf-8"
);
assert(
  /\.flashcard-row-back\s*\{[^}]*justify-content:\s*flex-end/.test(cssText),
  ".flashcard-row-back rule sets justify-content: flex-end in the stylesheet"
);

summary();
