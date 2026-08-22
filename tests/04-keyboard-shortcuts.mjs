import { setupApp, assert, summary, navigateTo, click, pressKey, findButtonByText } from "./helpers.mjs";

const { document, window } = await setupApp();
const content = document.getElementById("content");

console.log("Keyboard shortcuts modal + number-key selection");

const modal = document.getElementById("shortcuts-modal");
const computed = () => window.getComputedStyle(modal).display;

assert(computed() === "none", "shortcuts modal is hidden on load");

click(document.getElementById("shortcuts-toggle"));
assert(computed() === "flex", "modal opens when the sidebar link is clicked");

click(document.getElementById("shortcuts-close"));
assert(computed() === "none", "modal closes via the × button");

click(document.getElementById("shortcuts-toggle"));
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
assert(computed() === "none", "modal closes via Escape");

document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
assert(computed() === "flex", "modal opens via the ? key");

modal.dispatchEvent(new Event("click", { bubbles: true }));
assert(computed() === "none", "modal closes when clicking the backdrop");

// --- Number-key selection in Selection mode ---
navigateTo(document, "parsing");
await new Promise((r) => setTimeout(r, 30));

const selRadio = [...content.querySelectorAll("label")].find(
  (l) => l.textContent.trim() === "Selection" && l.querySelector('input[name="practice-input-mode"]')
).querySelector("input");
selRadio.checked = true;
selRadio.dispatchEvent(new Event("change", { bubbles: true }));
click(findButtonByText(content, "Generate Verb"));

const firstBtn = content.querySelector(".choice-group .choice-btn");
firstBtn.focus();
const targetLabel = content.querySelector(".choice-group").querySelectorAll(".choice-btn")[1].textContent;
pressKey(document.activeElement, "2");

const selected = content.querySelector(".choice-group .choice-btn.selected");
assert(!!selected, "pressing a digit selects a choice-btn");
assert(selected?.textContent === targetLabel, "digit '2' selects the 2nd option");
assert(
  document.activeElement === selected,
  "focus follows to the freshly-rendered button after the underlying re-render"
);

// Repeat press should still work against the newly-focused (re-rendered) button.
const nextLabel = content.querySelector(".choice-group").querySelectorAll(".choice-btn")[3].textContent;
pressKey(document.activeElement, "4");
const selected2 = content.querySelector(".choice-group .choice-btn.selected");
assert(selected2?.textContent === nextLabel, "repeated digit press still works after a prior re-render");

summary();
