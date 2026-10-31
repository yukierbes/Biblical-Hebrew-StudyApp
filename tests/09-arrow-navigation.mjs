import { setupApp, assert, summary, navigateTo, click, pressKey, findButtonByText } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Arrow-key roving focus navigation");

// --- Sidebar nav: Up/Down cycles, wraps ---
// The arrow keys visit what is on screen: the page buttons and the dropdown headers, not pages inside a closed dropdown.
const visibleNav = () => [...document.querySelectorAll("#nav-buttons button")].filter((b) => !b.closest("[hidden]"));
const navButtons = visibleNav();
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

const navButtonsNow = visibleNav();
const firstChoiceGroup = content.querySelector(".choice-group");
const firstChoiceBtn = firstChoiceGroup.querySelectorAll(".choice-btn")[0];

navButtonsNow[navButtonsNow.length - 1].focus(); // the last item in the sidebar nav
pressKey(document.activeElement, "ArrowRight");
// ArrowRight steps into the next sidebar row below the nav (this page's "My list" filter row, then the
// zoom controls and so on): those are real rows too, not an obstacle to skip past.
assert(
  document.activeElement.closest("#sidebar") !== null && document.activeElement.closest("#nav-buttons") === null,
  "ArrowRight from the sidebar nav reaches the next sidebar row"
);
// ArrowDown keeps crossing rows (the index is carried through, clamped to each row's length) until it
// leaves the sidebar and arrives in the first choice-group of the page.
let hops = 0;
while (document.activeElement.closest("#sidebar") && hops < 12) {
  pressKey(document.activeElement, "ArrowDown");
  hops++;
}
assert(
  firstChoiceGroup.contains(document.activeElement),
  "ArrowDown through the sidebar rows reaches the first content choice-group"
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
  document.activeElement.closest("#sidebar") !== null, // the text-size and Settings controls are behind the gear now, so this is the nav or a filter row
  "ArrowUp from the first content row reaches the previous sidebar row first"
);
// Keep going up through whatever sidebar rows sit between here and the nav (the Hebrew size
// row, the My list filter row, ...); the nav is reached within a few presses.
for (let i = 0; i < 8; i++) {
  pressKey(document.activeElement, "ArrowUp");
  if ([...document.querySelectorAll("#nav-buttons .nav-btn")].includes(document.activeElement)) break;
}
assert(
  [...document.querySelectorAll("#nav-buttons .nav-btn")].includes(document.activeElement),
  "ArrowUp again reaches the sidebar nav itself"
);

summary();
