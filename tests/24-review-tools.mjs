import { setupApp, assert, summary, navigateTo, findButtonByText } from "./helpers.mjs";

// The shared layout of every Review page: the Print Table section, then
// Download & Print, both ABOVE the table; plus the column picker.

const { document } = await setupApp();
const content = document.getElementById("content");
const sidebarExtra = document.getElementById("sidebar-extra");
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function top(el) {
  // jsdom has no layout, so compare document order instead of pixel positions.
  return [...document.querySelectorAll("*")].indexOf(el);
}

console.log("\nPrint Table and Download & Print sit above the table");
for (const page of ["consonant-review", "vowel-review", "accent-review", "vocabulary"]) {
  navigateTo(document, page);
  await wait();
  const h3 = Object.fromEntries([...content.querySelectorAll("h3")].map((h) => [h.textContent.trim(), h]));
  const table = content.querySelector("table");
  assert(!!h3["Print Table"] && !!h3["Download & Print"] && !!table, `${page}: has both sections and a table`);
  assert(top(h3["Print Table"]) < top(h3["Download & Print"]) && top(h3["Download & Print"]) < top(table), `${page}: Print Table, then Download & Print, then the table`);
  assert(!!findButtonByText(content, "Print Blank Table") && !!findButtonByText(content, "Print Table (Answer Key)"), `${page}: blank and answer-key buttons`);
  assert(!!sidebarExtra.querySelector(".column-picker"), `${page}: column picker in the sidebar`);
}

console.log("\nKeyboard Key is left out of printed tables by default");
for (const page of ["consonant-review", "vowel-review", "accent-review"]) {
  navigateTo(document, page);
  await wait();
  const opts = [...content.querySelectorAll(".print-col-option")].map((l) => [l.textContent.trim(), l.querySelector("input").checked]);
  const kb = opts.find(([t]) => t === "Keyboard Key");
  assert(kb && kb[1] === false, `${page}: Keyboard Key unticked for printing`);
  assert(opts.filter(([t, on]) => on && t !== "Print a random sample of").length >= 3, `${page}: the other columns are ticked`);
}

console.log("\nColumn picker: hide and reorder");
navigateTo(document, "consonant-review");
await wait();
const headers = () => [...content.querySelectorAll("thead th")].map((th) => th.textContent.trim());
assert(headers().join("|") === "Name|Form|Transliteration|Category|Keyboard Key", "default column order");
const row = (label) => [...sidebarExtra.querySelectorAll(".column-picker-row")].find((r) => r.textContent.includes(label));
row("Category").querySelector('button[aria-label^="Move up"]').click();
await wait();
assert(headers().join("|") === "Name|Form|Category|Transliteration|Keyboard Key", "Category moved above Transliteration");
row("Name").querySelector("input").click();
await wait();
assert(!headers().includes("Name"), "hidden column leaves the table");
sidebarExtra.querySelector(".btn.btn-outline.btn-block:last-of-type");
[...sidebarExtra.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset Columns").click();
await wait();
assert(headers().join("|") === "Name|Form|Transliteration|Category|Keyboard Key", "Reset Columns restores the default");

console.log("\nRandom sample");
navigateTo(document, "vocabulary");
await wait(100);
const sampleBox = content.querySelector(".print-sample-row input[type=checkbox]");
const sampleNum = content.querySelector(".print-sample-input");
assert(!!sampleBox && !!sampleNum, "vocabulary has the random-sample controls");
assert(sampleNum.max === "100", "sample limited to 100 rows");
assert(sampleNum.disabled, "sample size is greyed out until the sample is ticked");

console.log("\nVerb Review views");
navigateTo(document, "review");
await wait(100);
const views = [...content.querySelectorAll(".view-switch button")];
for (const label of ["List", "By Binyan", "By Verb Root"]) {
  views.find((b) => b.textContent.trim() === label).click();
  await wait(100);
  const hs = Object.fromEntries([...content.querySelectorAll("h3")].map((h) => [h.textContent.trim(), h]));
  const firstTable = content.querySelector("table");
  assert(!!hs["Print Table"] && top(hs["Print Table"]) < top(hs["Download & Print"]) && top(hs["Download & Print"]) < top(firstTable), `${label}: sections above the data`);
  assert(!!findButtonByText(content, "Print Blank Table") && !!findButtonByText(content, "Print Table (Answer Key)"), `${label}: blank and answer-key buttons`);
}

summary();
