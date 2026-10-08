import { setupApp, assert, summary } from "./helpers.mjs";
import { printFlashcards } from "../public/js/print.js";

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
  new URL("../public/css/style.css", import.meta.url),
  "utf-8"
);
assert(
  /\.flashcard-row-back\s*\{[^}]*justify-content:\s*flex-end/.test(cssText),
  ".flashcard-row-back rule sets justify-content: flex-end in the stylesheet"
);

// --- Front/back ALIGNMENT: the grid must start at the same height on
// both sides of every sheet. A title that appeared only on the first
// front page used to push that one sheet's fronts lower than its backs.
printFlashcards(manyRows, { title: "Big Deck" });
const alignPages = [...printArea.querySelectorAll(".print-page")];
assert(alignPages.length === 4, "alignment check: 20 cards still make 4 print pages");
assert(
  alignPages.every((pg) => pg.querySelectorAll(".print-header").length === 1),
  "every page — front AND back, on every sheet — has exactly one header block"
);
assert(
  alignPages.every((pg) => pg.querySelector(".print-header .print-title")?.textContent === "Big Deck"),
  "every page repeats the same title, so front and back headers are identical"
);
assert(
  alignPages.map((pg) => pg.querySelector(".print-page-label").textContent).join("|") ===
    "Front|Back (answers)|Front|Back (answers)",
  "pages alternate Front / Back (answers) across every sheet"
);
assert(
  alignPages.every((pg) => pg.firstElementChild.classList.contains("print-header")),
  "the header is the first thing on every page, ahead of the card grid"
);

// A title containing markup (e.g. a search phrase) must print as text.
printFlashcards(rows.slice(0, 1), { title: '<b>bold</b> & "quoted"' });
assert(
  printArea.querySelector(".print-title").textContent === '<b>bold</b> & "quoted"' &&
    !printArea.querySelector(".print-title b"),
  "a title containing HTML is shown as plain text, not interpreted as markup"
);

// Long text is shrunk in steps rather than letting a card grow taller
// (a taller back card would push its row out of line with the front).
const longGloss = "x".repeat(150);
printFlashcards(
  [
    { Conjugation: "S", "Gloss Translation": "short", Binyan: "Qal" },
    { Conjugation: "M", "Gloss Translation": "m".repeat(60), Binyan: "Qal" },
    { Conjugation: "L", "Gloss Translation": longGloss, Binyan: "Qal" },
  ],
  { title: "Fit" }
);
// (Back rows are reversed left-to-right, so look each gloss up by its text.)
const glossByText = (t) =>
  [...printArea.querySelectorAll(".flashcard-back .flashcard-gloss")].find((g) => g.textContent === t);
assert(!/\bfit-\d/.test(glossByText("short").className), "short text is left at full size");
assert(/\bfit-1\b/.test(glossByText("m".repeat(60)).className), "medium-long text shrinks one step");
assert(/\bfit-3\b/.test(glossByText(longGloss).className), "very long text shrinks the maximum amount");

// Hebrew niqqud are combining marks that take no width, so they must not
// count towards how "long" a Hebrew word is.
const pointed = "\u05D1\u05BC\u05B0\u05E8\u05B5\u05D0\u05E9\u05C1\u05B4\u05D9\u05EA".repeat(1); // 6 letters + 5 marks
printFlashcards([{ Conjugation: pointed, "Gloss Translation": "g", Binyan: "Qal" }], { title: "Niqqud" });
assert(
  !/\bfit-\d/.test(printArea.querySelector(".flashcard-hebrew").className),
  "a short pointed Hebrew word is not shrunk just because of its niqqud"
);

// The stylesheet must pin the things the alignment depends on, since
// jsdom can't lay anything out to check it directly.
const cssNoComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
assert(/\.print-header\s*\{[^}]*\bheight:\s*\d+px/.test(cssNoComments), ".print-header has a fixed height");
assert(
  /\.flashcard\s*\{[^}]*(^|[\s;])height:\s*\d+px/.test(cssNoComments) &&
    !/\.flashcard\s*\{[^}]*min-height/.test(cssNoComments),
  ".flashcard has a fixed height (not a growable min-height)"
);

summary();
