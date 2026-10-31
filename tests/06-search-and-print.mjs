import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";

const { document, window } = await setupApp();
const content = document.getElementById("content");

console.log("Word Lookup search + flashcard printing");

navigateTo(document, "search");
await new Promise((r) => setTimeout(r, 30));

assert(content.innerHTML.includes("Word Lookup"), "search page renders its title");

const input = content.querySelector('input[type="text"]');
assert(!!input, "search input is present");

// No query yet -> prompt, not results.
assert(content.textContent.includes("Results will appear here"), "shows a quiet hint before any query is entered");

// Search by Hebrew substring.
input.value = "קָטַל";
input.dispatchEvent(new Event("input", { bubbles: true }));
let rows = content.querySelectorAll("table.custom-table tbody tr");
assert(rows.length > 0, "searching a Hebrew form returns matching rows");

// Search by English gloss substring (case-insensitive).
input.value = "he killed";
input.dispatchEvent(new Event("input", { bubbles: true }));
rows = content.querySelectorAll("table.custom-table tbody tr");
assert(rows.length > 0, "searching an English gloss returns matching rows");

// Turning off both search targets should show a warning, not a stale table.
for (const opt of ["hebrew", "gloss"]) content.querySelector(`.lookup-chip[data-option="${opt}"]`).click();
assert(content.textContent.includes("Select at least one of Hebrew or English meaning"), "warns when both search targets are switched off");

// Re-enable and confirm the Print button triggers window.print() without throwing.
// (Navigate away first — clicking a nav link for the page you're already
// on doesn't change the URL hash, so it wouldn't actually trigger a
// fresh mount/reset.)
navigateTo(document, "home");
await new Promise((r) => setTimeout(r, 30));
navigateTo(document, "search");
await new Promise((r) => setTimeout(r, 30));
const input2 = content.querySelector('input[type="text"]');
input2.value = "קָטַל";
input2.dispatchEvent(new Event("input", { bubbles: true }));

let printCalled = false;
window.print = () => {
  printCalled = true;
};
const printBtn = [...content.querySelectorAll("button")].find((b) => b.textContent.includes("Print These as Flashcards"));
assert(!!printBtn, "print-flashcards button appears alongside results");
click(printBtn);
assert(printCalled, "clicking Print calls window.print()");
const printArea = document.getElementById("print-area");
assert(!!printArea && printArea.querySelectorAll(".flashcard").length > 0, "print area is populated with flashcards");

// Hebrew Keyboard button should also be available on Word Lookup.
const kbBtn = [...content.querySelectorAll("button")].find((b) => b.textContent.trim() === "Hebrew Keyboard");
assert(!!kbBtn, "Hebrew Keyboard button is present on the search page");
click(kbBtn);
const kbModal = document.getElementById("hebrew-keyboard-modal");
assert(window.getComputedStyle(kbModal).display !== "none", "clicking it opens the keyboard modal");
const alefBtn = [...kbModal.querySelectorAll(".hebrew-kb-key")].find((b) => b.textContent === "א");
click(alefBtn);
assert(input2.value.includes("א"), "typing via the keyboard updates the search box and re-runs the search");

summary();
