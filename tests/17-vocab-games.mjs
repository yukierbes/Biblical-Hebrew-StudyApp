import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";


// Let the page's timers run between actions, as a real browser does. (Without this, jsdom keeps every
// old 1,991-row table alive and the test runs out of memory.)
const tick = () => new Promise((r) => setTimeout(r, 25));
const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Vocabulary Games page");

navigateTo(document, "vocab-games");
await new Promise((r) => setTimeout(r, 30));

assert(content.innerHTML.includes("Vocabulary Games"), "page renders its title");
assert([...content.querySelectorAll(".mode-card")].some((c) => c.textContent.includes("Survival Sprint")), "menu lists Survival Sprint"); // each game is a card with a Play button
assert([...content.querySelectorAll(".mode-card")].some((c) => c.textContent.includes("Beat the Clock")), "menu lists Beat the Clock"); // each game is a card with a Play button
assert([...content.querySelectorAll(".mode-card")].some((c) => c.textContent.includes("Memory Match")), "menu lists Memory Match"); // each game is a card with a Play button
assert([...content.querySelectorAll(".mode-card")].some((c) => c.textContent.includes("Lightning Round")), "menu lists Lightning Round"); // each game is a card with a Play button
assert([...content.querySelectorAll(".mode-card")].some((c) => c.textContent.includes("Category Sort")), "menu lists Category Sort"); // each game is a card with a Play button

const playButtons = [...content.querySelectorAll(".mode-card button")].filter((b) => b.textContent === "Play");
assert(playButtons.length === 5, `all 5 games have a Play button (got ${playButtons.length})`);
assert(playButtons.every((b) => !b.disabled), "with the full dataset and no filters, every game is playable");

// --- Survival Sprint: play through, answering wrong every time, and
// confirm the run ends after exactly 3 misses ---
click(playButtons[0]); // Survival Sprint card
assert(content.innerHTML.includes("Survival Sprint"), "Survival Sprint setup screen renders");
click(findButtonByText(content, "Start"));
await tick();

let guard = 0;
while (content.querySelector(".field-group input[type='text']") && guard < 10) {
  const input = content.querySelector(".field-group input[type='text']");
  input.value = "definitely wrong answer xyz";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  click(findButtonByText(content, "Submit"));
  guard++;
}
assert(guard <= 3, `run ends after at most 3 wrong answers (took ${guard})`);
assert(content.innerHTML.includes("Run Over"), "game-over screen renders after losing all lives");
assert(!!findButtonByText(content, "Play Again"), "Play Again is offered");
assert(!!findButtonByText(content, "Back to Menu"), "Back to Menu is offered");

click(findButtonByText(content, "Back to Menu"));
await tick();
assert(content.innerHTML.includes("Vocabulary Games") && !content.innerHTML.includes("Run Over"), "Back to Menu returns to the game menu");

// --- Lightning Round: answer every question with the first option and
// confirm it reaches a summary screen with a bounded number of steps ---
const lightningBtn = [...content.querySelectorAll(".mode-card")].find((c) => c.textContent.includes("Lightning Round"))?.querySelector("button");
click(lightningBtn);
await tick();
click(findButtonByText(content, "Start"));
await tick();

let lguard = 0;
while (!content.innerHTML.includes("Round Complete") && lguard < 30) {
  const optionBtn = content.querySelector('.game-option-grid button.choice-btn:not([disabled])');
  if (!optionBtn) break;
  click(optionBtn);
  // The 900ms auto-advance uses a real setTimeout; jsdom's timers run on
  // Node's event loop, so give it a moment before checking again.
  await new Promise((r) => setTimeout(r, 950));
  lguard++;
}
assert(content.innerHTML.includes("Round Complete"), "Lightning Round reaches a summary screen");
assert(lguard < 30, "Lightning Round finishes in a bounded number of questions");

click(findButtonByText(content, "Back to Menu"));
await tick();

// --- Return to Home ---
click(findButtonByText(content, "Return to Home Page"));
await tick();
await new Promise((r) => setTimeout(r, 30));
assert(document.querySelector(".nav-btn.active")?.dataset.page === "home", "Return to Home Page navigates correctly");

summary();
