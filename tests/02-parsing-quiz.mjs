import {
  setupApp,
  assert,
  summary,
  navigateTo,
  click,
  pressKey,
  findButtonByText,
  findButtonStartingWith,
  countButtonsByText,
} from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Parsing quiz end-to-end");

navigateTo(document, "parsing");
await new Promise((r) => setTimeout(r, 30));

const quizRadio = [...content.querySelectorAll('input[name="parsing-mode"]')].find((r) => r.value === "Quiz");
quizRadio.checked = true;
quizRadio.dispatchEvent(new Event("change", { bubbles: true }));

assert(countButtonsByText(content, "Return to Home Page") === 1, "Home button present at filters step");

click(findButtonByText(content, "Yes, use filters"));
assert(countButtonsByText(content, "Return to Home Page") === 1, "Home button present at length step");

click(findButtonByText(content, "Continue"));
assert(countButtonsByText(content, "Return to Home Page") === 1, "Home button present at input-mode step");

click(findButtonByText(content, "Start Quiz"));
assert(countButtonsByText(content, "Return to Home Page") === 1, "Home button present at question step");
assert(!!content.querySelector(".progress-bar-outer"), "progress bar shown on first question");

// Answer all questions via the Enter-key shortcut, leaving everything
// unanswered (guarantees at least one miss for the retry test below).
let i = 0;
while (findButtonByText(content, "Next Question") && i < 15) {
  pressKey(document.body, "Enter");
  i++;
}
assert(i === 10, `advanced through all 10 questions (got ${i})`);
assert(content.innerHTML.includes("Quiz Summary"), "reached the summary screen");
assert(countButtonsByText(content, "Return to Home Page") === 1, "exactly one Home button at summary (no duplicate)");

const retryBtn = findButtonStartingWith(content, "Retry");
assert(!!retryBtn, "Retry Missed Questions button appears when answers were left blank");
assert(!!content.querySelector(".history-panel"), "history panel appears after first completed quiz");
assert(document.querySelectorAll(".history-row").length === 1, "exactly one history entry after first quiz");

if (retryBtn) {
  const missedCount = parseInt(retryBtn.textContent.match(/\d+/)[0], 10);
  click(retryBtn);
  let j = 0;
  while (findButtonByText(content, "Next Question") && j < 15) {
    pressKey(document.body, "Enter");
    j++;
  }
  assert(j === missedCount, `retry quiz ran exactly the ${missedCount} missed questions (got ${j})`);
  assert(content.innerHTML.includes("Quiz Summary"), "retry quiz reaches its own summary");
  assert(countButtonsByText(content, "Return to Home Page") === 1, "still exactly one Home button after retry");
  assert(document.querySelectorAll(".history-row").length === 2, "history now has 2 entries after the retry");
  assert(!!document.querySelector(".history-row .pill-warn"), "most recent history entry is tagged as a retry");
}

summary();
