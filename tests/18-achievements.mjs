import { setupApp, assert, summary, navigateTo, findButtonByText, click } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Achievements page");

navigateTo(document, "achievements");
await new Promise((r) => setTimeout(r, 30));

assert(content.innerHTML.includes("Achievements"), "page renders its title");
assert(content.innerHTML.includes("0 / "), "summary shows 0 unlocked with no activity yet");

for (const section of ["Consistency", "Vocabulary Mastery", "Verb Mastery", "Quizzes", "Organization", "Games"]) {
  assert(content.innerHTML.includes(section), `section header "${section}" renders`);
}

const cards = content.querySelectorAll(".achievement-card");
assert(cards.length >= 20, `at least 20 achievement cards render (got ${cards.length})`);
assert(
  [...cards].every((c) => c.classList.contains("achievement-locked")),
  "every achievement starts locked with no activity"
);
assert(!content.querySelector(".achievement-unlocked"), "no achievement shows as unlocked initially");
assert(
  [...cards].every((c) => c.querySelector(".progress-bar-outer")),
  "every locked achievement shows a progress bar"
);

// --- Unlock one achievement (a quiz attempt) via history.js directly,
// the same way Parsing/Construction/Vocabulary Typing record one, then
// confirm the page reflects it on next render ---
const { recordAttempt } = await import("../js/history.js");
recordAttempt("parsing", { score: 5, total: 5, percent: 100, datasets: ["Test"], retry: false });

navigateTo(document, "home");
await new Promise((r) => setTimeout(r, 30));
navigateTo(document, "achievements");
await new Promise((r) => setTimeout(r, 30));

assert(!content.innerHTML.includes("0 / "), "summary count updates once an achievement is unlocked");
const quizTakerCard = [...content.querySelectorAll(".achievement-card")].find((c) => c.textContent.includes("Quiz Taker"));
assert(!!quizTakerCard, "Quiz Taker card is present");
assert(quizTakerCard.classList.contains("achievement-unlocked"), "Quiz Taker unlocks after completing one quiz");
const perfectCard = [...content.querySelectorAll(".achievement-card")].find((c) => c.textContent.includes("Perfectionist"));
assert(perfectCard.classList.contains("achievement-unlocked"), "Perfectionist unlocks from a 100% quiz score");

// --- Return to Home ---
click(findButtonByText(content, "Return to Home Page"));
await new Promise((r) => setTimeout(r, 30));
assert(document.querySelector(".nav-btn.active")?.dataset.page === "home", "Return to Home Page navigates correctly");

summary();
