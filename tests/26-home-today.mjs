import { setupApp, assert, summary, navigateTo, findButtonByText, click } from "./helpers.mjs";
import { recordItemResult, recordStreakActivity } from "../public/js/srs.js";
import { getLetterSet } from "../public/js/letter-sets.js";
import { readFileSync } from "fs";

// The Home page: Today card (due count, streak, Study now), pick up where you
// left off, one tile per area, weak spots with a drill, verb of the day, and
// the small feedback line.

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const goHome = async () => {
  navigateTo(document, "progress");
  await wait();
  navigateTo(document, "home");
  await wait(120);
};
const card = (title) => [...content.querySelectorAll(".home-card")].find((c) => c.querySelector("h3").textContent.trim() === title);
const text = (sel) => (content.querySelector(sel) ? content.querySelector(sel).textContent.replace(/\s+/g, " ").trim() : "");
const vowels = getLetterSet("vowels");
const consonants = getLetterSet("consonants");
const vk = (i) => vowels.rowKey(vowels.rows()[i]);
const ck = (i) => consonants.rowKey(consonants.rows()[i]);

console.log("\nA brand-new learner");
await goHome();
const tiles = [...content.querySelectorAll(".area-tile")];
assert(
  JSON.stringify(tiles.map((t) => t.dataset.homeSection)) === JSON.stringify(["consonants", "vowels", "vocabulary", "verbs", "accents"]),
  "five area tiles in the order Consonants, Vowels, Vocabulary, Verbs, Accents"
);
assert(tiles.every((t) => t.querySelectorAll("[data-goto]").length === 4), "every tile has four quick buttons");
assert(tiles.every((t) => /Start here/.test(t.textContent)), "an untouched area says Start here");
assert(tiles.every((t) => /0%/.test(t.textContent)), "an untouched area shows 0%");
assert(/all caught up/i.test(text(".today-card-due")), "nothing is due yet");
assert(findButtonByText(content, "Start here"), "Study now offers a place to start");
assert(/Consonants Flashcards/.test(text(".today-card-sub")), "...Consonants Flashcards first");
assert(/start a streak/i.test(text(".today-streak")), "no streak yet");
assert(
  JSON.stringify([...content.querySelectorAll(".home-card h3")].map((h) => h.textContent.trim())) ===
    JSON.stringify(["Vocabulary of the day", "Verb of the day", "Weak spots", "Closest achievements"]),
  "four info boxes: Vocabulary of the day, Verb of the day, then Weak spots and Closest achievements below"
);
assert(/Nothing here yet/.test(card("Weak spots").textContent), "weak spots start empty");
const votd = card("Vocabulary of the day");
assert(votd.querySelector(".wotd-form").textContent.trim().length > 0, "a Hebrew word is shown");
assert(votd.querySelector(".votd-answer").hasAttribute("hidden"), "its definition starts hidden");
click(findButtonByText(votd, "Show definition"));
assert(!votd.querySelector(".votd-answer").hasAttribute("hidden"), "Show definition reveals it");
assert(/Lesson .+ · Frequency [\d,]+/.test(votd.querySelector(".votd-answer").textContent.replace(/\s+/g, " ")), "...with the lesson and frequency");
assert(votd.querySelector(".wotd-gloss").textContent.trim().length > 0, "...and the English definition");
click(findButtonByText(votd, "Hide definition"));
assert(votd.querySelector(".votd-answer").hasAttribute("hidden"), "Hide definition hides it again");
assert(/Practice a little/.test(card("Closest achievements").textContent), "no goals to show before any practice");
assert(!!content.querySelector(".wotd-form") && content.querySelector(".wotd-form").textContent.length > 0, "a verb of the day is shown");
assert(content.querySelector(".wotd-parse").hasAttribute("hidden"), "its parsing starts hidden");
click(findButtonByText(content, "Show parsing"));
assert(!content.querySelector(".wotd-parse").hasAttribute("hidden"), "Show parsing reveals it");
assert(/Qal|Niphal|Piel|Pual|Hitpael|Hiphil|Hophal|Polel|Polal|Hitpolel/.test(text(".wotd-parse")), "...with the binyan");
assert(/My Progress/.test(text(".resume-page")), "Home offers to resume the last page visited (the test just visited My Progress)");
assert(!/keyboard shortcut/i.test(content.textContent), "no mention of the old keyboard-shortcut typing mode");
assert(/Send feedback/.test(text(".feedback-line")) && !content.querySelector(".feedback-box"), "feedback is a single quiet line");
const typingBtn = tiles[1].querySelector('[data-goto="vowel-typing"]');
assert(/name of the vowel shown/.test(typingBtn.title), "the Typing button's tooltip describes Typing today");

console.log("\nDue items and Study now");
for (let i = 0; i < 3; i++) recordItemResult("vowel-flashcards", vk(0), false);
recordItemResult("vowel-flashcards", vk(1), false);
await goHome();
assert(/2 items due/.test(text(".today-card-due")), "two missed vowels are due");
assert(/2 due/.test(content.querySelector('[data-home-section="vowels"]').textContent), "the Vowels tile says 2 due");
assert(/2 due in Vowels · Flashcards/.test(text(".today-card-sub")), "Study now names the area and the queue");
click(findButtonByText(content, "Study now"));
await wait();
assert(content.querySelector("h1").textContent === "Vowels Flashcards", "Study now opens Vowels Flashcards");

// The Letter → name typing queue counts too (not the old shortcut mode).
for (const i of [0, 1, 2]) recordItemResult("consonant-typing-form", ck(i), false);
recordItemResult("vowel-typing-symbol", vk(5), false);
await goHome();
assert(/5 items due/.test(text(".today-card-due")), "3 consonant + 2 vowel items due; the old shortcut mode is not counted");
assert(/3 due in Consonants · Typing/.test(text(".today-card-sub")), "Study now moves to the area with the most due");
click(findButtonByText(content, "Study now"));
await wait();
assert(content.querySelector("h1").textContent === "Consonants Typing", "...and opens Consonants Typing");

console.log("\nStreak");
await goHome();
recordStreakActivity();
await goHome();
assert(/1-day streak/.test(text(".today-streak")), "the streak shows on Home");
assert(/Kept for today/.test(text(".today-streak-nudge")), "...and says it is kept for today");

console.log("\nWeak spots");
const weakItems = [...content.querySelectorAll(".weak-list li")];
assert(weakItems.length === 1 && weakItems[0].textContent.includes(vowels.rows()[0].Name.normalize("NFC").slice(0, 3)), "only the vowel missed three times is a weak spot");
assert(/Vowels · missed 3 of 3/.test(weakItems[0].textContent.replace(/\s+/g, " ")), "...with its miss count");
click(findButtonByText(content, "Drill these"));
await wait();
assert(content.querySelector("h1").textContent === "Weak-Spot Drill", "Drill these opens the Weak-Spot Drill");
click(findButtonByText(content, "Start Drill"));
await wait();
assert(!!content.querySelector(".hebrew-display"), "the drill asks a question");

console.log("\nClosest achievements");
await goHome();
const goals = card("Closest achievements");
const goalTitles = [...goals.querySelectorAll(".goal-title")];
assert(goalTitles.length >= 1 && goalTitles.length <= 4, "achievements you are partway to are listed (at most four)");
assert(goals.querySelectorAll(".progress-bar-inner").length === goalTitles.length, "each shows a progress bar");
assert(/\d+ \/ \d+/.test(goalTitles[0].textContent), "...and how far along it is");
const ratios = [...goals.querySelectorAll(".progress-bar-inner")].map((b) => parseInt(b.style.width, 10));
assert(ratios.every((r, i) => i === 0 || ratios[i - 1] >= r), "the closest one comes first");

console.log("\nPick up where you left off");
navigateTo(document, "vowel-typing");
await wait();
navigateTo(document, "home");
await wait(120);
assert(/Vowels Typing/.test(text(".resume-page")), "Home offers to resume the last page");
assert(/Last practised today/.test(text(".resume-activity")), "...and shows when you last practised");
click(findButtonByText(content, "Resume"));
await wait();
assert(content.querySelector("h1").textContent === "Vowels Typing", "Resume goes back to it");

console.log("\nInstalled-app name");
const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf-8"));
assert(manifest.name === "Biblical Hebrew Study App", "the manifest uses the app's name");
assert(!/verb/i.test(manifest.short_name), "the short name no longer says Verbs");

summary();
