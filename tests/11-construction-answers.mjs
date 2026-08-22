import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Construction answer checking + Hebrew keyboard");

navigateTo(document, "construction");
await new Promise((r) => setTimeout(r, 30));

click(findButtonByText(content, "Generate a Verb"));
click(findButtonByText(content, "Show Answer"));

const revealedHebrew = content.querySelector(".hebrew-display span[lang='he']")?.textContent;
const revealedGloss = content.querySelector(".hebrew-display .gloss-display")?.textContent;
assert(!!revealedHebrew, "Show Answer reveals a Hebrew form to test against");
assert(!!revealedGloss, "Show Answer reveals a gloss to test against");

// Regression check for a real bug: `.hebrew-display span` (a bare `span`
// descendant selector) used to match the .gloss-display span too, since
// it's also a <span> inside .hebrew-display — which set direction:rtl
// on the English gloss and caused the browser's bidi algorithm to
// reposition trailing punctuation (e.g. an imperative's "!") to the
// front, rendering "kill!" as "!kill".
//
// This checks the stylesheet SOURCE directly rather than trusting
// getComputedStyle's cascade resolution — jsdom does not reliably
// apply CSS specificity for descendant-combinator selectors like this
// one (confirmed by direct testing: it kept resolving direction:ltr
// even with the buggy broad selector reinstated, when a real browser's
// higher-specificity `.hebrew-display span` rule would in fact win).
// The defensive .gloss-display{direction:ltr} rule alone isn't
// sufficient without also removing the bug at its source.
const cssText = (await import("fs")).readFileSync(
  new URL("../css/style.css", import.meta.url),
  "utf-8"
);
assert(
  !/\.hebrew-display\s+span\s*\{/.test(cssText),
  "no bare '.hebrew-display span' selector remains (it would match .gloss-display too and win on specificity)"
);
assert(
  /\.hebrew-display\s+span\[lang=["']he["']\]/.test(cssText),
  "the Hebrew-only styling is scoped to span[lang=\"he\"], excluding the gloss span"
);
assert(
  /\.gloss-display\s*\{[^}]*direction:\s*ltr/.test(cssText),
  ".gloss-display also explicitly declares direction:ltr as a defense-in-depth backstop"
);

// Helper: fetch the CURRENT live input elements — each Check Answer
// click re-renders this section, replacing the DOM nodes, so we must
// never hold onto a reference across a rerender.
function hebInput() {
  return content.querySelector(".construction-hebrew-input");
}
function glossInput() {
  return content.querySelector('.field-group input[type="text"]:not(.construction-hebrew-input)');
}
function setValue(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// --- Type the CORRECT answers and check ---
setValue(hebInput(), revealedHebrew);
setValue(glossInput(), revealedGloss);
click(findButtonByText(content, "Check Answer"));

let labels = content.querySelectorAll(".field-label");
assert(labels[0].classList.contains("pill-good"), "correct Hebrew answer is marked good");
assert(labels[1].classList.contains("pill-good"), "correct gloss answer is marked good");

// --- Now type WRONG answers (fresh elements, post-rerender) and re-check ---
setValue(hebInput(), "שטות");
setValue(glossInput(), "complete nonsense answer");
click(findButtonByText(content, "Check Answer"));

labels = content.querySelectorAll(".field-label");
assert(labels[0].classList.contains("pill-warn"), "incorrect Hebrew answer is marked as needing another look");
assert(labels[1].classList.contains("pill-warn"), "incorrect gloss answer is marked as needing another look");

// --- Gloss matching should be case/whitespace-insensitive ---
setValue(glossInput(), "  " + revealedGloss.toUpperCase() + "  ");
click(findButtonByText(content, "Check Answer"));
labels = content.querySelectorAll(".field-label");
assert(labels[1].classList.contains("pill-good"), "gloss matching ignores case and surrounding whitespace");

// --- Hebrew Keyboard: insert characters, backspace, clear ---
console.log("\nHebrew keyboard");
setValue(hebInput(), "");
click(findButtonByText(content, "Hebrew Keyboard"));
const kbModal = document.getElementById("hebrew-keyboard-modal");
assert(document.defaultView.getComputedStyle(kbModal).display !== "none", "keyboard modal opens");

const alefBtn = [...kbModal.querySelectorAll(".hebrew-kb-key")].find((b) => b.textContent === "א");
const qamatsBtn = [...kbModal.querySelectorAll(".hebrew-kb-key-niqqud")].find((b) => b.title === "Qamats");
assert(!!alefBtn, "aleph key exists on the virtual keyboard");
assert(!!qamatsBtn, "qamats niqqud key exists on the virtual keyboard");

click(alefBtn);
click(qamatsBtn);
assert(hebInput().value === "א\u05B8", "clicking letter then niqqud inserts both into the active input in order");

const previewInput = document.getElementById("hebrew-keyboard-preview");
assert(!!previewInput, "the keyboard has a live preview textbox");
assert(previewInput.value === "א\u05B8", "the preview textbox shows the same value as the active input");

const backspaceBtn = [...kbModal.querySelectorAll("button")].find((b) => b.textContent.includes("Backspace"));
click(backspaceBtn);
assert(hebInput().value === "א", "backspace removes exactly the last character (the combining niqqud)");
assert(previewInput.value === "א", "the preview textbox stays in sync after backspace");

const clearBtn = [...kbModal.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear");
click(clearBtn);
assert(hebInput().value === "", "Clear empties the active input");
assert(previewInput.value === "", "Clear also empties the preview textbox");

// Typing directly into the preview (e.g. with a physical keyboard for
// plain letters) should sync back to the real page input too.
previewInput.value = "שלום";
previewInput.dispatchEvent(new Event("input", { bubbles: true }));
assert(hebInput().value === "שלום", "typing directly into the preview box syncs back to the real input");

click(document.getElementById("hebrew-keyboard-close"));
assert(document.defaultView.getComputedStyle(kbModal).display === "none", "closing the keyboard hides it again");
assert(document.activeElement === hebInput(), "closing the keyboard returns focus to the Hebrew input");

summary();
