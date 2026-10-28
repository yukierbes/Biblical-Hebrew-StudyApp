import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import * as ob from "../public/js/onboarding.js";
import { recordItemResult } from "../public/js/srs.js";

const { document, localStorage } = await setupApp();
const win = document.defaultView;
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const KEY = "hebrewVerbApp:onboarding";
const dialog = () => document.querySelector(".onb-dialog");
const btn = (text) => [...document.querySelectorAll(".onb-dialog button")].find((b) => b.textContent.trim() === text);
const keydown = (target, key, opts = {}) => target.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));

console.log("Who is welcomed");
localStorage.removeItem(KEY);
assert(!ob.hasExistingProgress() && ob.shouldWelcome(), "a person with no progress and no record is welcomed");
localStorage.setItem(KEY, JSON.stringify({ done: true }));
assert(!ob.shouldWelcome(), "someone who has been through it is not welcomed again");
localStorage.removeItem(KEY);
recordItemResult("vocab-typing-hebrew", "x", true);
assert(ob.hasExistingProgress() && !ob.shouldWelcome(), "someone with saved progress is never welcomed as new");
localStorage.setItem("hebrewVerbApp:confidencePrompt", "0");

console.log("\nLevels, placement and the plan");
assert(ob.LEVELS.length === 4, "four levels");
assert(ob.placedLevel(0, 6) === 1 && ob.placedLevel(3, 6) === 2 && ob.placedLevel(5, 6) === 3 && ob.placedLevel(6, 6) === 4, "the quiz score maps to a level");
assert(ob.startingLevel(2, null, 0) === 2, "with no quiz, the person's own level stands");
assert(ob.startingLevel(4, 6, 6) === 4 && ob.startingLevel(4, 0, 6) === 3 && ob.startingLevel(1, 6, 6) === 3, "the start is halfway between what they said and what the quiz showed");
assert(ob.startingLevel(1, 0, 6) === 1 && ob.startingLevel(2, 4, 6) >= 2 && ob.startingLevel(2, 4, 6) <= 3, "never outside the four levels");
const qs = ob.buildPlacement();
assert(qs.length === 6, "six placement questions");
assert(qs.every((q) => q.options.length === 4 && q.options.includes(q.answer) && new Set(q.options).size === 4 && q.hebrew), "each has four different options, including the answer, and a Hebrew prompt");
assert(new Set(qs.map((q) => q.area)).size === 3, "they cover letters, vowels and vocabulary");
for (const lv of [1, 2, 3, 4]) {
  const plan = ob.firstWeekPlan(lv);
  assert(plan.length === 7 && plan.every((d, i) => d.day === i + 1 && d.page && d.title && d.label), `level ${lv}: seven days, each with a page`);
  assert(plan.every((d) => document.querySelector(`#sidebar [data-page="${d.page}"]`)), `level ${lv}: every day's page exists in the app`);
}
localStorage.setItem(KEY, JSON.stringify({ done: true, level: 2, planStart: "2026-10-26" }));
assert(ob.planDayToday(new Date(2026, 9, 26)) === 1 && ob.planDayToday(new Date(2026, 9, 28)) === 3 && ob.planDayToday(new Date(2026, 10, 2)) === 8 === false, "the plan day follows the calendar");
assert(ob.getPlanToday(new Date(2026, 9, 29)).day === 4 && ob.getPlanToday(new Date(2026, 9, 29)).of === 7, "today's step of the plan");
assert(ob.getPlanToday(new Date(2026, 10, 3)) === null, "after seven days the plan is over");
ob.hidePlan();
assert(ob.getPlanToday(new Date(2026, 9, 29)) === null, "the plan can be hidden");

console.log("\nThe welcome");
localStorage.removeItem(KEY);
localStorage.removeItem("hebrewVerbApp:vocab-typing-hebrew");
for (const k of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))) if (k.startsWith("hebrewVerbApp:") && k !== "hebrewVerbApp:confidencePrompt") localStorage.removeItem(k);
navigateTo(document, "home");
await wait(400);
assert(!!dialog(), "a brand-new person sees the welcome when Home opens");
assert(dialog().getAttribute("role") === "dialog" && dialog().getAttribute("aria-modal") === "true", "it is a modal dialog");
assert(document.activeElement && dialog().contains(document.activeElement), "focus moves into it");
click(btn("Set up my first week"));
await wait(40);
assert(/Step 1 of 3/.test(dialog().textContent) && dialog().querySelectorAll('input[type="radio"]').length === 4, "step 1: four levels");
assert(btn("Next").disabled, "Next waits for a choice");
const radio = dialog().querySelector('input[value="2"]');
radio.checked = true;
radio.dispatchEvent(new win.Event("change", { bubbles: true }));
assert(!btn("Next").disabled, "choosing a level enables Next");
click(btn("Next"));
await wait(40);
assert(/Step 2 of 3/.test(dialog().textContent), "step 2: the placement quiz");
for (let i = 0; i < 6; i++) {
  assert(/Question \d of 6/.test(dialog().textContent), `question ${i + 1} is shown`);
  click(dialog().querySelector(".onb-options .choice-btn"));
  await wait(20);
  assert(!!dialog().querySelector(".is-correct") && dialog().querySelector(".onb-feedback").textContent.length > 0, `question ${i + 1} gives feedback`);
  click(btn(i === 5 ? "See my plan" : "Next question"));
  await wait(30);
}
assert(/Step 3 of 3/.test(dialog().textContent) && dialog().querySelectorAll(".onb-plan li").length === 7, "step 3: seven days");
// keyboard: Tab from the last control wraps to the first
const focusables = [...dialog().querySelectorAll("button")];
focusables[focusables.length - 1].focus();
keydown(document.activeElement, "Tab");
assert(dialog().contains(document.activeElement), "Tab stays inside the dialog");
click(btn("Start day 1"));
await wait(150);
const rec = JSON.parse(localStorage.getItem(KEY));
assert(rec.done === true && [1, 2, 3, 4].includes(rec.level) && /^\d{4}-\d\d-\d\d$/.test(rec.planStart) && rec.selfLevel === 2, "the level, the quiz and the plan's start date are saved");
assert(!dialog(), "the dialog closes");
assert(win.location.hash.replace("#", "") === ob.firstWeekPlan(rec.level)[0].page, "day 1 opens its page");
navigateTo(document, "home");
await wait(150);
assert(!dialog(), "the welcome is not shown again");
const card = content.querySelector(".plan-card");
assert(!!card && /day 1 of 7/.test(card.textContent), "Home shows today's step of the first week");
click(card.querySelector("[data-hide-plan]"));
assert(!content.querySelector(".plan-card") && JSON.parse(localStorage.getItem(KEY)).planHidden === true, "the plan can be hidden");

console.log("\nSkipping, and returning people");
localStorage.removeItem(KEY);
ob.startWelcome(() => {});
await wait(20);
keydown(document.activeElement, "Escape");
assert(!dialog() && JSON.parse(localStorage.getItem(KEY)).skipped === true, "Escape closes the welcome and it is not shown again");
localStorage.removeItem(KEY);
recordItemResult("vocab-flashcards-hebrew", "y", true);
navigateTo(document, "progress");
await wait(100);
navigateTo(document, "home");
await wait(300);
assert(!dialog() && JSON.parse(localStorage.getItem(KEY)).existing === true, "a person with progress is not welcomed, and is quietly marked as done");

console.log("\nThe tour");
navigateTo(document, "progress");
await wait(100);
navigateTo(document, "home");
await wait(150);
click(content.querySelector("[data-tour]"));
await wait(40);
assert(/Tour: 1 of \d+/.test(dialog().textContent), "the tour opens from Home");
const total = ob.TOUR_STEPS.length;
assert(total >= 8, "it covers the sidebar, the main areas, Reading, My Progress, Word Lookup and the footer");
assert(ob.TOUR_STEPS.filter((s) => s.target).every((s) => document.querySelector(s.target)), "every highlighted part exists in the sidebar");
assert(btn("Back").disabled, "Back is off on the first card");
for (let i = 1; i < total; i++) {
  click(btn("Next") || btn("Finish"));
  await wait(20);
}
assert(btn("Finish") && /Tour: \d+ of \d+/.test(dialog().textContent), "the last card has Finish");
click(btn("Finish"));
assert(!dialog() && JSON.parse(localStorage.getItem(KEY)).tourSeen === true, "finishing closes the tour");
click(content.querySelector("[data-tour]"));
await wait(20);
keydown(document.activeElement, "Escape");
assert(!dialog() && !document.querySelector(".tour-highlight"), "Escape closes the tour and clears the highlight");

summary();
