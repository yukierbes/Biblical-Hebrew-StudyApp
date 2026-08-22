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

// --- Reset Progress button clears everything (with confirmation) ---
window.confirm = () => true; // simulate the user confirming the destructive action
click(document.getElementById("reset-progress"));
assert(streakDisplay.textContent.includes("Practice today"), "reset button clears the streak back to the initial prompt");

summary();
