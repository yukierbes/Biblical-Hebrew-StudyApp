// Update 9: themes + patterns, Hebrew size, "nothing ticked = nothing shown" filters,
// the collapsible Navigation header.
import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { renderCheckboxList } from "../public/js/widgets.js";
import { applyVocabFilters } from "../public/js/vocab-overrides.js";
import { applyAccentFilters } from "../public/js/accent-filters.js";
import { applyRootFilter } from "../public/js/vocab-roots.js";
import { freshFilters, applyLetterFilters, getLetterSet } from "../public/js/letter-sets.js";
import { selectFiltersMessage, upgradeSnapshotFilters } from "../public/js/filter-state.js";
import { PALETTES, PATTERNS, HEBREW_SIZES } from "../public/js/appearance.js";
import { readFileSync } from "node:fs";

const { document, localStorage } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const root = document.documentElement;

console.log("Filter semantics: null = all, [] = none");
{
  const rows = [
    { Lesson: "1A", POS: "Noun", Frequency: 5 },
    { Lesson: "1B", POS: "Verb", Frequency: 5 },
  ];
  assert(applyVocabFilters(rows, { Lesson: null, POS: null, Category: null }, "").length === 2, "null filters show everything");
  assert(applyVocabFilters(rows, { Lesson: [], POS: null, Category: null }, "").length === 0, "an emptied Lesson filter shows nothing");
  assert(applyVocabFilters(rows, { Lesson: ["1A"], POS: null, Category: null }, "").length === 1, "a partial selection narrows");
  assert(applyRootFilter(rows, null) === rows && applyRootFilter(rows, []).length === 0, "Root filter: null = all, [] = none");
  const acc = [{ Type: "A", Group: "x" }, { Type: "B", Group: "" }];
  assert(applyAccentFilters(acc, { Type: null, Group: null }).length === 2 && applyAccentFilters(acc, { Type: [], Group: null }).length === 0, "accent filters follow the same rule");
  const set = getLetterSet("vowels");
  const fresh = freshFilters(set);
  assert(Object.values(fresh).every((v) => v === null), "fresh letter filters are all null (everything ticked)");
  const all = set.rows();
  assert(applyLetterFilters(set, all, fresh).length === all.length, "fresh letter filters show every row");
  const none = { ...fresh, [set.filters[0].key]: [] };
  assert(applyLetterFilters(set, all, none).length === 0, "an emptied letter filter shows nothing");
}

console.log("Messages and presets");
{
  const msg = selectFiltersMessage({ Lesson: [], POS: [] }, { Lesson: "Lesson", POS: "Part of Speech" }, "fallback");
  assert(msg === "Select at least one Lesson and at least one Part of Speech in the sidebar filters to begin studying.", `names every emptied filter (${msg})`);
  assert(selectFiltersMessage({ Lesson: null }, { Lesson: "Lesson" }, "fallback") === "fallback", "otherwise the page's own wording is used");
  const old = upgradeSnapshotFilters({ filters: { Lesson: [], POS: ["Noun"] } });
  assert(old.filters.Lesson === null && old.filters.POS[0] === "Noun", "an old preset's [] (meant 'all') becomes null");
  const kept = upgradeSnapshotFilters({ fv: 2, filters: { Lesson: [] } });
  assert(Array.isArray(kept.filters.Lesson), "a new preset's [] (meant 'none') is kept");
}

console.log("Checkbox widget");
{
  const box = document.createElement("div");
  document.body.appendChild(box); // (jsdom only fires 'change' for attached checkboxes)
  const calls = [];
  renderCheckboxList(box, { label: "Lesson", options: ["a", "b"], selected: null, onChange: (v) => calls.push(v) });
  assert(box.querySelectorAll("input:checked").length === 2, "null shows every box ticked");
  assert(box.querySelector(".filter-box-toggle").dataset.summary === "all", "summary reads 'all'");
  box.querySelectorAll("input")[0].click();
  assert(JSON.stringify(calls.at(-1)) === '["b"]', "unticking one reports the rest");
  renderCheckboxList(box, { label: "Lesson", options: ["a", "b"], selected: [], onChange: () => {} });
  assert(box.querySelector(".filter-box-toggle").dataset.summary === "none", "nothing ticked reads 'none'");
  box.remove();
}

console.log("Pages show the new message and start with everything");
for (const [page, label] of [["vocabulary", "Lesson"], ["consonant-review", "Category"], ["vowel-review", "Class"], ["accent-review", "Type"], ["vocab-flashcards", "Lesson"], ["accent-typing", "Type"], ["vowel-games", "Class"]]) {
  navigateTo(document, page);
  await wait(80);
  const content = document.getElementById("content");
  assert(!content.querySelector(".alert") , `${page}: starts with no warning (everything ticked)`);
  const box = [...document.querySelectorAll(".filter-box-toggle")].find((b) => b.textContent.trim() === label);
  box.parentElement.querySelector(".clear-all-btn").click();
  await wait(80);
  const text = [...content.querySelectorAll(".alert")].map((a) => a.textContent).join(" ");
  assert(text.includes(`Select at least one ${label}`) && text.includes("to begin studying"), `${page}: clearing ${label} says to select one (${text.slice(0, 70)})`);
}

console.log("Navigation header collapses its links");
{
  navigateTo(document, "home");
  await wait(30);
  const section = document.querySelector('.sidebar-section[data-collapse-default="open"]');
  const toggle = section.querySelector(".sidebar-title-toggle");
  assert(!section.classList.contains("is-collapsed"), "Navigation starts open");
  click(toggle);
  assert(section.classList.contains("is-collapsed"), "clicking the header collapses it");
  const css = readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");
  assert(/\.sidebar-section\.is-collapsed > :not\(\.sidebar-title\):not\(\.sidebar-head-action\) \{ display: none !important; \}/.test(css), "the collapse rule beats #nav-buttons { display: flex }");
}

console.log("Appearance: themes, patterns, Hebrew size");
{
  assert(PALETTES.length === 6 && PATTERNS.some((p) => p.id === "none") && HEBREW_SIZES.join() === "80,100,120,140,160", "six themes, patterns incl. none, five Hebrew sizes");
  const swatches = [...document.querySelectorAll(".theme-swatch")];
  assert(swatches.length === 6, "the Appearance panel has six theme swatches");
  click(swatches.find((b) => b.dataset.palette === "sky"));
  assert(root.getAttribute("data-palette") === "sky" && localStorage.getItem("themePalette") === "sky", "choosing Sky sets and remembers it");
  click(swatches.find((b) => b.dataset.palette === "classic"));
  assert(!root.hasAttribute("data-palette"), "Classic removes the attribute");
  const select = document.getElementById("pattern-select");
  select.value = "grid";
  select.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
  assert(root.getAttribute("data-pattern") === "grid", "choosing a pattern sets it");
  click(document.getElementById("hebrew-zoom-in"));
  assert(root.style.getPropertyValue("--hebrew-scale") === "1.2" && localStorage.getItem("hebrewZoom") === "120", "Hebrew size up one step = 120%");
  click(document.getElementById("hebrew-zoom-reset"));
  assert(root.style.getPropertyValue("--hebrew-scale") === "1", "reset returns to 100%");
  assert(document.getElementById("zoom-reset").textContent === "100%" , "page text size control is separate and untouched");
  const css = readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");
  assert(/#print-area \{ display: none; --hebrew-scale: 1;/.test(css) && /html \{ --hebrew-scale: 1 !important; \}/.test(css), "printing always uses normal Hebrew size");
}

summary();
