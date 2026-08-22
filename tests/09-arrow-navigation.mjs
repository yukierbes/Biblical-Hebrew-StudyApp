import { setupApp, assert, summary, navigateTo, click, pressKey, findButtonByText } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Arrow-key roving focus navigation");

// --- Sidebar nav: Up/Down cycles, wraps ---
const navButtons = [...document.querySelectorAll("#nav-buttons .nav-btn")];
navButtons[0].focus();
pressKey(document.activeElement, "ArrowDown");
assert(document.activeElement === navButtons[1], "ArrowDown moves to the next sidebar nav item");
pressKey(document.activeElement, "ArrowDown");
assert(document.activeElement === navButtons[2], "ArrowDown moves again");
pressKey(document.activeElement, "ArrowUp");
assert(document.activeElement === navButtons[1], "ArrowUp moves back");

navButtons[navButtons.length - 1].focus();
pressKey(document.activeElement, "ArrowDown");
assert(document.activeElement === navButtons[0], "ArrowDown wraps from last to first nav item");

navButtons[0].focus();
pressKey(document.activeElement, "ArrowUp");
assert(document.activeElement === navButtons[navButtons.length - 1], "ArrowUp wraps from first to last nav item");

// --- Sidebar -> content: ArrowRight jumps in (passing through any other
// navigable rows still in the sidebar itself, like the zoom controls,
// before reaching the main content — that's correct: they're real rows
// too, not just an obstacle to skip past) ---
navigateTo(document, "parsing");
await new Promise((r) => setTimeout(r, 30));
const modeRadios = content.querySelectorAll('input[name="parsing-mode"]');
// The mode radio-row isn't a recognized arrow-nav group (native radios
// already handle their own arrow keys), so the first REAL group in
// content on this page is the input-mode radio row too... instead use
// a page with a .choice-group for a clean, unambiguous first group.
const selLabel = [...content.querySelectorAll("label")].find(
  (l) => l.textContent.trim() === "Selection" && l.querySelector('input[name="practice-input-mode"]')
).querySelector("input");
selLabel.checked = true;
selLabel.dispatchEvent(new Event("change", { bubbles: true }));
click(findButtonByText(content, "Generate Verb"));

const navButtonsNow = [...document.querySelectorAll("#nav-buttons .nav-btn")];
const firstChoiceGroup = content.querySelector(".choice-group");
const firstChoiceBtn = firstChoiceGroup.querySelectorAll(".choice-btn")[0];

navButtonsNow[navButtonsNow.length - 1].focus(); // last nav button, index 4 of 5
pressKey(document.activeElement, "ArrowRight");
assert(
  document.activeElement.closest(".zoom-buttons") !== null,
  "ArrowRight from sidebar nav first reaches the next sidebar row (zoom controls)"
);
// The index carries through each hop, clamped to each row's length —
// from nav item 4 (of 5) it lands on zoom-buttons' last item (index 2
// of 3), then crossing again clamps to index 2 of the first
// choice-group rather than resetting to its first item.
pressKey(document.activeElement, "ArrowDown");
const expectedAfterCross = firstChoiceGroup.querySelectorAll(".choice-btn")[2];
assert(
  document.activeElement === expectedAfterCross,
  "ArrowDown from the zoom row reaches the first content choice-group, at the carried-through clamped index"
);

navButtonsNow[0].focus();
pressKey(document.activeElement, "ArrowLeft");
assert(document.activeElement === navButtonsNow[0], "ArrowLeft on the sidebar nav is a no-op (already leftmost)");

// --- Within a choice-group: Left/Right moves along the row, wraps ---
firstChoiceBtn.focus();
pressKey(document.activeElement, "ArrowRight");
const secondChoiceBtn = firstChoiceGroup.querySelectorAll(".choice-btn")[1];
assert(document.activeElement === secondChoiceBtn, "ArrowRight moves to the next choice in the row");
pressKey(document.activeElement, "ArrowLeft");
assert(document.activeElement === firstChoiceBtn, "ArrowLeft moves back");

const allChoiceBtns = firstChoiceGroup.querySelectorAll(".choice-btn");
allChoiceBtns[allChoiceBtns.length - 1].focus();
pressKey(document.activeElement, "ArrowRight");
assert(document.activeElement === allChoiceBtns[0], "ArrowRight wraps from last to first in the row");

// --- Between choice-groups (fields): Down/Up jumps rows at the same index ---
const allGroups = content.querySelectorAll(".choice-group");
assert(allGroups.length === 5, "Parsing practice has 5 field choice-groups (Binyan/Mode/Person/Gender/Number)");

allGroups[0].querySelectorAll(".choice-btn")[2].focus();
pressKey(document.activeElement, "ArrowDown");
const secondGroupItems = allGroups[1].querySelectorAll(".choice-btn");
assert(
  document.activeElement === secondGroupItems[Math.min(2, secondGroupItems.length - 1)],
  "ArrowDown jumps to the same index in the next field's row"
);

pressKey(document.activeElement, "ArrowUp");
assert(document.activeElement === allGroups[0].querySelectorAll(".choice-btn")[2], "ArrowUp jumps back to the previous row");

// From the very first group, ArrowUp should reach the previous sidebar
// row (zoom controls), then the sidebar nav itself.
allGroups[0].querySelectorAll(".choice-btn")[0].focus();
pressKey(document.activeElement, "ArrowUp");
assert(
  document.activeElement.closest(".zoom-buttons") !== null,
  "ArrowUp from the first content row reaches the previous sidebar row first"
);
pressKey(document.activeElement, "ArrowUp");
assert(
  [...document.querySelectorAll("#nav-buttons .nav-btn")].includes(document.activeElement),
  "ArrowUp again reaches the sidebar nav itself"
);

summary();
