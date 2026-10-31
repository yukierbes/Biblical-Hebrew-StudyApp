import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";

const { document, window } = await setupApp();
const content = document.getElementById("content");

console.log("Progress sidebar integration (streak + mastery stats)");

const streakDisplay = document.getElementById("streak-display");
assert(!!streakDisplay, "streak display element exists in the sidebar");
assert(streakDisplay.textContent.includes("Practice today"), "shows a prompt before any activity has been recorded");

// --- Practicing in Parsing should start a streak ---
navigateTo(document, "parsing");
await new Promise((r) => setTimeout(r, 30));
click(findButtonByText(content, "Generate Verb"));

const dropdowns = content.querySelectorAll(".field-group select");
// Fill every dropdown with its first real option so we get a deterministic
// check (don't care if it's right or wrong, just that Check Answer fires).
dropdowns.forEach((sel) => {
  if (sel.options.length > 1) {
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
click(findButtonByText(content, "Check Answer"));

assert(streakDisplay.querySelector(".streak-count")?.textContent === "1", "streak shows 1 after the first practice check");
assert(streakDisplay.textContent.includes("Day Streak"), "streak label reads 'Day Streak'");

// Checking again (same day, same or different item) should not change the streak count.
click(findButtonByText(content, "Generate Verb"));
click(findButtonByText(content, "Check Answer"));
assert(streakDisplay.querySelector(".streak-count")?.textContent === "1", "streak stays at 1 for further activity on the same day");

// --- Mastery stats caption appears on the Practice page ---
navigateTo(document, "parsing");
await new Promise((r) => setTimeout(r, 30));
const statsCaptions = [...content.querySelectorAll(".caption")].map((c) => c.textContent);
assert(
  statsCaptions.some((t) => t.includes("New:") && t.includes("Learning:") && t.includes("Mastered:")),
  "mastery stats caption (New/Learning/Mastered) appears on the Parsing practice page"
);

// --- Construction practice also feeds the same streak/stats system ---
navigateTo(document, "construction");
await new Promise((r) => setTimeout(r, 30));
const cStatsCaptions = [...content.querySelectorAll(".caption")].map((c) => c.textContent);
assert(
  cStatsCaptions.some((t) => t.includes("New:") && t.includes("Learning:") && t.includes("Mastered:")),
  "mastery stats caption also appears on the Construction practice page"
);

// --- The streak chip links to My Progress, where the goal and Reset now live ---
const chip = streakDisplay.querySelector("a.streak-chip");
assert(!!chip && chip.getAttribute("href") === "#progress", "the streak chip is a link to My Progress");
assert(!document.getElementById("reset-progress") && !document.getElementById("daily-goal-input"), "Reset Progress and the goal box are no longer in the sidebar");

navigateTo(document, "progress");
await new Promise((r) => setTimeout(r, 60));
click([...content.querySelectorAll(".pm-tab")].find((t) => /Backup/.test(t.textContent))); // Settings live on the Backup & Settings tab
await new Promise((r) => setTimeout(r, 60));
const goalInput = content.querySelector("#pm-daily-goal");
assert(!!goalInput && goalInput.value === "15", "My Progress has the daily goal, at its default of 15");
goalInput.value = "25";
goalInput.dispatchEvent(new Event("change", { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
assert(streakDisplay.textContent.includes("/ 25 today"), "changing the goal updates the sidebar chip");

// --- Reset Progress clears everything (with confirmation) ---
window.confirm = () => false;
click(content.querySelector("#pm-reset"));
assert(streakDisplay.querySelector(".streak-count")?.textContent === "1", "declining the confirmation keeps the streak");
window.confirm = () => true; // simulate the user confirming the destructive action
click(content.querySelector("#pm-reset"));
assert(streakDisplay.textContent.includes("Practice today"), "reset button clears the streak back to the initial prompt");
assert(streakDisplay.textContent.includes("/ 15 today"), "...and puts the goal back to its default");

summary();
