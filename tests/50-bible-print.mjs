import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");
const win = document.defaultView;
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
let printed = 0;
win.print = () => printed++;
const tabBtn = (name) => [...content.querySelectorAll(".bible-tabs .choice-btn")].find((b) => b.textContent.trim() === name);
const change = (el, v) => {
  if (v !== undefined) el.value = v;
  if (el.type === "radio" || el.type === "checkbox") el.checked = v === undefined ? el.checked : v;
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};

const pages = [
  ["bible-dagesh", "Dagesh"],
  ["bible-article", "Definite Article"],
  ["bible-prefix", "Prefixed Prepositions"],
  ["bible-noun", "Nouns"],
  ["bible-syllable", "Syllables & Stress"],
  ["bible-verb", "Verbs"],
];
for (const [page, title] of pages) {
  console.log(`\n${title}`);
  navigateTo(document, page);
  await wait(500);
  assert(!!tabBtn("Print"), `${title}: has a Print tab`);
  click(tabBtn("Print"));
  await wait(120);
  const sheet = content.querySelector(".bp-preview .bp-quiz");
  assert(!!sheet, `${title}: the quiz sheet previews`);
  assert(new RegExp(title.replace(/[&]/g, "&amp;|&")).test(sheet.querySelector("h1").textContent) || sheet.querySelector("h1").textContent.includes(title), `${title}: titled with the page name`);
  assert(/Name _+/.test(sheet.querySelector(".bp-meta").textContent), `${title}: name, date and score lines`);
  const qs = sheet.querySelectorAll(".bp-q");
  assert(qs.length >= 1 && qs.length <= 10, `${title}: ${qs.length} numbered questions`);
  const nums = [...sheet.querySelectorAll(".bp-passage .bp-num")].flatMap((n) => n.textContent.split(",").map(Number));
  assert(qs.length === 0 || (Math.max(...nums) === qs.length && new Set(nums).size === qs.length), `${title}: every question number appears once in the passage`);
  assert(sheet.querySelector(".bp-passage [lang='he']") !== null, `${title}: the passage is Hebrew text`);
  assert(sheet.querySelectorAll(".bp-opt").length >= qs.length * 2, `${title}: circle style lists the choices in each row`);
  assert(!!content.querySelector(".bp-preview .bp-key"), `${title}: an answer key follows by default`);
  const key = content.querySelectorAll(".bp-key-list li");
  assert(key.length === qs.length && [...key].every((li) => li.querySelector("b").textContent.trim().length > 0), `${title}: the key answers every question`);
}

console.log("\nOptions (Definite Article)");
navigateTo(document, "bible-article");
await wait(500);
click(tabBtn("Print"));
await wait(100);
const lines = [...content.querySelectorAll('input[name="bp-style"]')].find((r) => r.value === "lines");
change(lines, true);
await wait(100);
assert(!!content.querySelector(".bp-bank") && content.querySelectorAll(".bp-line").length > 0 && content.querySelectorAll(".bp-opt").length === 0, "lines style: a word bank and a line for each answer, no circle choices");
const cnt = content.querySelector("#bp-count-select");
change(cnt, "5");
await wait(100);
assert(content.querySelectorAll(".bp-q").length <= 5, "the number of questions follows the setting");
const keyBox = [...content.querySelectorAll(".bp-form input[type=checkbox]")].find((c) => /answer key/.test(c.parentElement.textContent));
change(keyBox, false);
await wait(100);
assert(!content.querySelector(".bp-key"), "the answer key can be left off");
const accBox = [...content.querySelectorAll(".bp-form input[type=checkbox]")].find((c) => /accent marks/.test(c.parentElement.textContent));
const hasAccent = (t) => /[\u0591-\u05AF]/.test(t);
change(accBox, true);
await wait(100);
assert(hasAccent(content.querySelector(".bp-passage").textContent), "with accents on, the passage keeps them");
change(accBox, false);
await wait(100);
assert(!hasAccent(content.querySelector(".bp-passage").textContent), "with accents off, only the accent marks go");
const sel = content.querySelector("#bp-passage-select");
change(sel, "1");
await wait(100);
assert(/Gen|Genesis|\d/.test(content.querySelector(".bp-passage-title").textContent), "another passage can be chosen");

console.log("\nPrinting");
click(content.querySelector(".button-row .btn:not(.btn-outline)"));
const area = document.getElementById("print-area");
assert(printed === 1 && area && area.querySelector(".bible-sheet"), "Print sends the sheet to the print area and calls print");
assert(!area.querySelector("button, input, select"), "nothing interactive is printed");
win.dispatchEvent(new win.Event("afterprint"));
assert(area.innerHTML === "", "the print area is emptied afterwards");

console.log("\nPattern guide");
click([...content.querySelectorAll(".bible-tabs ~ * .choice-btn, .choice-group .choice-btn")].find((b) => b.textContent === "Pattern guide" && !b.closest(".bible-tabs")));
await wait(100);
const g = content.querySelector(".bp-preview .bp-guide");
assert(!!g && /pattern guide/.test(g.querySelector("h1").textContent), "the pattern guide previews");
assert(g.querySelectorAll(".bible-guide-card").length > 0 && !g.querySelector("button"), "with its cards and no buttons");
click(content.querySelector(".button-row .btn:not(.btn-outline)"));
assert(printed === 2, "and prints");

console.log("\nVerbs prints the roots?");
navigateTo(document, "bible-verb");
await wait(500);
click(tabBtn("Print"));
await wait(100);
assert(content.querySelectorAll(".bp-bank, .bp-part").length > 0 && content.querySelectorAll(".bp-part-title").length > 0, "a multi-box page labels each answer row");

summary();
