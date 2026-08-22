import {
  setupApp,
  assert,
  summary,
  navigateTo,
  click,
  findButtonByText,
  findButtonStartingWith,
  countButtonsByText,
} from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Construction quiz end-to-end (graded entirely at the summary)");

navigateTo(document, "construction");
await new Promise((r) => setTimeout(r, 30));

const quizRadio = [...content.querySelectorAll('input[name="construction-mode"]')].find((r) => r.value === "Quiz");
quizRadio.checked = true;
quizRadio.dispatchEvent(new Event("change", { bubbles: true }));
assert(countButtonsByText(content, "Return to Home Page") === 1, "Home button present at filters step");

click(findButtonByText(content, "Yes, use filters"));
click(findButtonByText(content, "Start Quiz"));
assert(countButtonsByText(content, "Return to Home Page") === 1, "Home button present at question step");

// Quiz mode should have ONLY typing inputs + Next Question/End Quiz —
// no per-question Check Answer or Show Answer (those stay in Practice
// mode only; the quiz is graded all together at the summary).
assert(!!content.querySelector(".construction-hebrew-input"), "Hebrew typing input is present");
assert(!!content.querySelector('input[type="text"]:not(.construction-hebrew-input)'), "Gloss typing input is present");
assert(!findButtonByText(content, "Check Answer"), "Check Answer button is NOT present during the quiz");
assert(!findButtonByText(content, "Show Answer"), "Show Answer button is NOT present during the quiz");
assert(!!findButtonByText(content, "Hebrew Keyboard"), "Hebrew Keyboard button is still present");
assert(!!findButtonByText(content, "Next Question"), "Next Question button is present");
assert(!!findButtonByText(content, "End Quiz"), "End Quiz button is present");

let i = 0;
while (findButtonByText(content, "Next Question") && i < 15) {
  click(findButtonByText(content, "Next Question"));
  i++;
}
assert(i === 10, `ran through all 10 questions (got ${i})`);
assert(content.innerHTML.includes("Quiz Summary"), "reached the summary screen");
assert(countButtonsByText(content, "Return to Home Page") === 1, "exactly one Home button at summary");

const retryBtn = findButtonStartingWith(content, "Retry");
assert(!!retryBtn, "Retry Missed Questions button appears (everything left blank)");
assert(retryBtn.textContent.includes("10"), "retry button reports all 10 as missed");
assert(!!content.querySelector(".history-panel"), "history panel appears");
assert(content.querySelector("h3").textContent.includes("/ 20"), "score is out of 20 (2 points x 10 questions)");

// Downloads shouldn't throw with the Hebrew/Gloss column structure.
click(findButtonByText(content, "Download CSV"));
click(findButtonByText(content, "Download Excel"));

summary();
