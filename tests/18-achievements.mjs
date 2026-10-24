import { setupApp, assert, summary, navigateTo, findButtonByText, click } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

console.log("Achievements page (badges with Bronze, Silver and Gold)");

navigateTo(document, "achievements");
await wait();

assert(content.innerHTML.includes("Achievements"), "page renders its title");
assert(/0 \/ \d+ levels earned/.test(content.textContent), "summary shows 0 levels earned with no activity yet");

for (const section of ["Consistency", "Vocabulary Mastery", "Verb Mastery", "Quizzes", "Organization", "Games", "Bible in Context", "Reading", "Comebacks", "Secret Badges"]) {
  assert(content.innerHTML.includes(section), `section header "${section}" renders`);
}
assert(content.textContent.includes("Your path"), "the four-chapter path is shown");
assert(content.querySelectorAll(".badge-chapter").length === 4, "four chapters: Letters, Vowels, Words, Reading");

const cards = [...content.querySelectorAll(".badge-card")];
assert(cards.length >= 30, `at least 30 badge cards render (got ${cards.length})`);
assert(!content.querySelector(".achievement-unlocked"), "nothing shows as unlocked with no activity");
const tiered = cards.filter((c) => c.querySelector(".badge-medals"));
assert(tiered.length >= 25 && tiered.every((c) => c.querySelectorAll(".badge-medal").length === 3), "tiered badges show three medals");
assert(tiered.every((c) => !c.querySelector(".badge-medal.is-earned")), "no medal is earned yet");
assert(cards.filter((c) => !c.classList.contains("badge-secret")).every((c) => c.querySelector(".progress-bar-outer")), "every open badge shows a progress bar");
const secret = cards.filter((c) => c.classList.contains("badge-secret"));
assert(secret.length === 4 && secret.every((c) => /Secret badge/.test(c.textContent) && !/Pausal|Hat Trick|Early Bird|Needle/.test(c.textContent)), "four secret badges are hidden, with no hints");

// --- Earn the first level of a badge by finishing a quiz well ---
const { recordAttempt } = await import("../public/js/history.js");
recordAttempt("parsing", { score: 5, total: 5, percent: 100, datasets: ["Test"], retry: false });

navigateTo(document, "home");
await wait();
navigateTo(document, "achievements");
await wait();

assert(!/^0 \/ /.test(content.querySelector(".badges-root .info-box").textContent.trim()), "the summary count updates once a level is earned");
const passer = content.querySelector('[data-badge="quiz-pass"]');
assert(!!passer && passer.querySelector(".badge-medal.is-earned"), "Quiz Passer earns Bronze for a quiz at 80% or better");
assert(passer.querySelectorAll(".badge-medal.is-earned").length === 1, "...and only Bronze");
const perfect = content.querySelector('[data-badge="quiz-perfect-tier"]');
assert(perfect.querySelector(".badge-medal.is-earned"), "Perfectionist earns Bronze from a 100% quiz");

// --- The next three have a button that goes to the page that earns each ---
const nextCards = content.querySelectorAll(".badge-next .achievement-card");
assert(nextCards.length >= 1 && nextCards.length <= 3, "at most three 'next' badges");
assert([...nextCards].every((c) => c.querySelector("[data-goto]")), "each has a button to its page");

// --- Return to Home ---
click(findButtonByText(content, "Return to Home Page"));
await wait();
assert(document.querySelector(".nav-btn.active")?.dataset.page === "home", "Return to Home Page navigates correctly");

summary();
