import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Ambiguity hints in Parsing practice");

navigateTo(document, "parsing");
await new Promise((r) => setTimeout(r, 30));

let sawAmbiguous = false;
let sawUnambiguous = false;

for (let i = 0; i < 40 && (!sawAmbiguous || !sawUnambiguous); i++) {
  click(findButtonByText(content, "Generate Verb"));
  const hintPanel = content.querySelector(".hint-panel");
  if (hintPanel) {
    sawAmbiguous = true;
    const showHintBtn = findButtonByText(content, "Show Hint");
    if (showHintBtn) {
      click(showHintBtn);
      const hints = content.querySelectorAll(".hint-list li");
      assert(hints.length === 1, "clicking Show Hint reveals exactly one hint");
      assert(
        [...hints].every((li) => /^Not .+/.test(li.textContent.trim()) && li.textContent.trim() !== "Not"),
        "revealed hint text names an actual value (not a blank 'Not ' from an unnamed field)"
      );
    }
  } else {
    sawUnambiguous = true;
  }
}

assert(sawAmbiguous, "found at least one ambiguous form across 40 draws");
assert(sawUnambiguous, "found at least one unambiguous form across 40 draws (no hint panel)");

summary();
