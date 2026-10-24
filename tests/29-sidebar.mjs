import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { findPages } from "../public/js/page-finder.js";

// The sidebar: collapsible headers and filter boxes (remembered), "Filters · N active · Reset",
// the "Go to…" page finder, and the footer (streak chip, accessibility row, Account) at the bottom.

const { document, localStorage } = await setupApp();
const win = document.defaultView;
const content = document.getElementById("content");
const sidebar = document.getElementById("sidebar");
const extra = document.getElementById("sidebar-extra");
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const section = (title) => [...document.querySelectorAll(".sidebar-section")].find((s) => s.querySelector(":scope > .sidebar-title")?.textContent.trim() === title);
const titleBtn = (title) => section(title)?.querySelector(":scope > .sidebar-title > .sidebar-title-toggle");
const tick = (cb) => {
  cb.checked = !cb.checked;
  cb.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const boxToggle = (label) => [...extra.querySelectorAll(".filter-box-toggle")].find((b) => b.textContent.trim() === label);

console.log("\nThe footer is pinned at the bottom");
{
  const footer = sidebar.querySelector(".sidebar-footer");
  const inner = sidebar.querySelector(".sidebar-inner");
  assert(!!footer && inner.lastElementChild === footer, "the footer is the last thing in the sidebar");
  assert(footer.compareDocumentPosition(extra) & win.Node.DOCUMENT_POSITION_PRECEDING, "...after the page's own filters");
  const order = [...footer.children].map((c) => c.id || c.className.split(" ")[0]);
  assert(order.join() === "streak-display,a11y-row,hebrew-size-row,sidebar-section,sidebar-section,sidebar-footer-links", `footer order: streak, accessibility row, Hebrew size row, appearance, account (${order})`);
  assert(footer.querySelector(".sidebar-account").nextElementSibling.classList.contains("sidebar-footer-links") && footer.querySelector(".sidebar-footer-links [data-page=\"credits\"]"), "Sources & Credits sits just below Account");
  assert(!document.getElementById("reset-progress") && !document.getElementById("daily-goal-input"), "the old Progress block (goal, Reset) is gone from the sidebar");
  const row = footer.querySelector(".a11y-row");
  const ids = [...row.querySelectorAll("button")].map((b) => b.id);
  assert(ids.join() === "theme-toggle,zoom-out,zoom-reset,zoom-in,shortcuts-toggle", "Accessibility is one row: theme, A−, 100%, A+, ?");
}

console.log("\nAccessibility buttons still work");
{
  const theme = document.getElementById("theme-toggle");
  const before = document.documentElement.getAttribute("data-theme");
  click(theme);
  assert(document.documentElement.getAttribute("data-theme") !== before, "the theme button still switches the theme");
  assert(theme.textContent.includes("Light Mode") || theme.textContent.includes("Dark Mode"), "its words are still there for screen readers");
  assert(theme.querySelector(".sr-only") && theme.querySelector("[aria-hidden]"), "shown as a small icon with hidden words");
  click(theme);
  click(document.getElementById("zoom-in"));
  assert(document.getElementById("zoom-reset").textContent.trim() !== "100%", "A+ changes the zoom readout");
  click(document.getElementById("zoom-reset"));
  assert(document.getElementById("zoom-reset").textContent.trim() === "100%", "100% resets it");
}

console.log("\nCollapsible headers: Navigation and Account");
{
  assert(section("Navigation").classList.contains("is-collapsible") === false && titleBtn("Navigation"), "Navigation has a toggle button in its header");
  assert(titleBtn("Navigation").getAttribute("aria-expanded") === "true", "Navigation starts open");
  assert(titleBtn("Account").getAttribute("aria-expanded") === "false" && section("Account").classList.contains("is-collapsed"), "Account starts collapsed");
  assert(/Not signed in|Synced|Syncing|Sync/.test(titleBtn("Account").dataset.summary || ""), `Account's header says how syncing is going ("${titleBtn("Account").dataset.summary}")`);
  click(titleBtn("Navigation"));
  assert(section("Navigation").classList.contains("is-collapsed") && titleBtn("Navigation").getAttribute("aria-expanded") === "false", "clicking Navigation collapses it");
  assert(localStorage.getItem("sidebarCollapsed:desktop:Navigation") === "1", "and the choice is remembered");
  click(titleBtn("Navigation"));
  assert(!section("Navigation").classList.contains("is-collapsed"), "clicking again opens it");
  assert(document.querySelector("#sidebar .sidebar-title").textContent.trim() === "Navigation", "the heading's own text is unchanged");
}

console.log("\nFilters: boxes start closed, with a summary");
navigateTo(document, "vowel-review");
await wait(150);
const filters = () => section("Filters");
assert(!!filters() && titleBtn("Filters").getAttribute("aria-expanded") === "true", "a page's Filters section is open on a computer");
const boxes = [...extra.querySelectorAll(".filter-box-toggle")];
assert(boxes.length >= 1, `the page has filter boxes (${boxes.map((b) => b.textContent).join(", ")})`);
assert(boxes.every((b) => b.closest(".checkbox-list-wrap, div")?.classList.contains("filter-box-collapsed") && b.getAttribute("aria-expanded") === "false"), "every box starts collapsed");
assert(boxes.every((b) => b.dataset.summary === "all" && b.dataset.filterActive === "false"), "...summarised as 'all'");
{
  const first = boxes[0];
  const box = first.parentElement;
  const next = first.nextElementSibling.nextElementSibling;
  assert(next && next.classList.contains("checkbox-list"), "label, Select all row and list are still siblings in that order");
  assert(first.classList.contains("sidebar-label") && /\S/.test(first.textContent), "and the label keeps its sidebar-label class and text");

  click(first);
  assert(!box.classList.contains("filter-box-collapsed") && first.getAttribute("aria-expanded") === "true", "clicking a box opens it");
  assert(localStorage.getItem(`sidebarCollapsed:desktop:box:${first.textContent.trim()}`) === "0", "and remembers it");

  // Tick one option: the page redraws its sidebar, the box must stay open.
  const label = first.textContent.trim();
  const cbs = () => boxToggle(label).parentElement.querySelectorAll('.checkbox-list input[type="checkbox"]');
  const total = cbs().length;
  tick(cbs()[0]);
  await wait(80);
  const again = boxToggle(label);
  assert(again.getAttribute("aria-expanded") === "true", "a redrawn box stays open");
  assert(again.dataset.summary === `${total - 1} of ${total}` && again.dataset.filterActive === "true", `unticking one of the (all-ticked) options makes its summary read "${total - 1} of ${total}"`);
  assert(titleBtn("Filters").dataset.summary === "1 active", "the Filters header says '1 active'");
  const reset = filters().querySelector(":scope > .sidebar-head-action");
  assert(!!reset && reset.textContent === "Reset", "and offers a Reset shortcut");
  click(reset);
  await wait(80);
  assert(boxToggle(label).dataset.summary === "all" && !titleBtn("Filters").dataset.summary, "Reset clears the filter and the summary");
  assert(!filters().querySelector(":scope > .sidebar-head-action"), "...and the shortcut goes away");

  // All ticked is no restriction at all, so it is not "active".
  const selectAll = [...extra.querySelectorAll(".btn, button")].find((b) => b.textContent.trim().toLowerCase() === "select all");
  click(selectAll);
  await wait(80);
  assert(boxToggle(label).dataset.filterActive === "false" && !titleBtn("Filters").dataset.summary, "selecting everything is not counted as an active filter");
  click(boxToggle(label));
}

console.log("\nCollapsing the Filters header");
{
  click(titleBtn("Filters"));
  assert(filters().classList.contains("is-collapsed"), "clicking Filters collapses it");
  tick(extra.querySelector(".checkbox-list input"));
  await wait(80);
  assert(filters().classList.contains("is-collapsed"), "it stays collapsed after the page redraws its sidebar");
  assert(localStorage.getItem("sidebarCollapsed:desktop:Filters") === "1", "remembered by title");
  click(titleBtn("Filters"));
  assert(!filters().classList.contains("is-collapsed"), "and opens again");
}

console.log("\nOn a phone, the page's own sections start collapsed");
{
  localStorage.setItem("sidebarCollapsed:desktop:Filters", "1"); // a computer remembered Filters as closed
  win.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  navigateTo(document, "accent-review");
  await wait(150);
  assert(titleBtn("Filters").getAttribute("aria-expanded") === "false" && filters().classList.contains("is-collapsed"), "Filters starts collapsed");
  assert(!section("Navigation").classList.contains("is-collapsed"), "...while Navigation stays open, first in the list");
  click(titleBtn("Filters"));
  assert(localStorage.getItem("sidebarCollapsed:phone:Filters") === "0" && localStorage.getItem("sidebarCollapsed:desktop:Filters") === "1", "a phone remembers its choices separately from a computer");
  delete win.matchMedia;
}

console.log("\nThe page finder: matching");
{
  const pages = [
    { page: "vowel-typing", label: "Vowels Typing", haystack: "vowels typing type" },
    { page: "vowel-review", label: "Vowels Review", haystack: "vowels review table browse" },
    { page: "accent-typing", label: "Accents Typing", haystack: "accents typing type" },
    { page: "parsing", label: "Verb Parsing", haystack: "verb parsing parse analyze" },
    { page: "search", label: "Word Lookup", haystack: "word lookup find dictionary" },
  ];
  const names = (q) => findPages(pages, q).map((p) => p.label).join("|");
  assert(names("vow typ") === "Vowels Typing", `"vow typ" → ${names("vow typ")}`);
  assert(names("typ").startsWith("Vowels Typing|Accents Typing"), "one word finds every typing page");
  assert(names("parse") === "Verb Parsing", "an alias word finds a page by what people call it");
  assert(names("dictionary") === "Word Lookup", "...including words not in its name");
  assert(names("zzz") === "" && names("") === "", "nothing matches nonsense, or an empty box");
  assert(names("vow zzz") === "", "every typed word has to match");
  assert(names("VOWELS review") === "Vowels Review", "capitals don't matter");
}

console.log("\nThe page finder: in the sidebar");
{
  navigateTo(document, "home");
  await wait(100);
  const input = document.getElementById("page-finder-input");
  const list = document.getElementById("page-finder-list");
  const type = (v) => {
    input.value = v;
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  };
  const key = (k) => input.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true }));
  assert(input.getAttribute("role") === "combobox" && input.getAttribute("aria-expanded") === "false" && list.hidden, "a closed combobox to begin with");
  type("vow typ");
  assert(!list.hidden && input.getAttribute("aria-expanded") === "true", "typing opens the list");
  const opts = [...list.querySelectorAll("[role=option]")].map((o) => o.textContent);
  assert(opts.join() === "Vowels Typing", `real sidebar pages are searched (${opts})`);
  assert(input.getAttribute("aria-activedescendant") === "page-finder-opt-0", "the first match is active");
  key("Enter");
  await wait(120);
  assert(win.location.hash === "#vowel-typing" || document.querySelector(".nav-btn.active")?.dataset.page === "vowel-typing", "Enter goes to the page");
  assert(input.value === "" && list.hidden, "and the box clears");

  type("achiev");
  assert([...list.querySelectorAll("[role=option]")].map((o) => o.textContent).join() === "Achievements", "Achievements can be found by name");
  key("Escape");
  assert(input.value === "" && list.hidden, "Escape clears and closes");
  type("qqq");
  assert(/No page matches/.test(list.textContent), "no match says so");
  key("Escape");

  type("progress");
  key("ArrowDown");
  key("ArrowUp");
  assert(input.getAttribute("aria-activedescendant") !== null, "arrow keys move through the matches");
  key("Escape");

  // "/" jumps to the finder when not typing…
  document.body.focus();
  document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "/", bubbles: true }));
  await wait(40);
  assert(document.activeElement === input, '"/" focuses the page finder');
  // …but not while typing in a box.
  const other = document.createElement("input");
  document.body.appendChild(other);
  other.focus();
  other.dispatchEvent(new win.KeyboardEvent("keydown", { key: "/", bubbles: true }));
  await wait(40);
  assert(document.activeElement === other, '"/" is left alone while typing in another box');
  other.remove();
  assert(/Go to/.test(document.getElementById("shortcuts-modal")?.textContent || document.body.textContent), "the shortcuts list mentions the page finder");
}

summary();
