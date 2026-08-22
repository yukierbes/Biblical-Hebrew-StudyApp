import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";

const { document, localStorage } = await setupApp();

console.log("Sidebar nav sections (Verbs / Vocabulary)");

const verbsToggle = document.querySelector('.nav-section-toggle[data-nav-section="verbs"]');
const verbsGroup = document.querySelector('.nav-section-group[data-nav-section-group="verbs"]');
const vocabToggle = document.querySelector('.nav-section-toggle[data-nav-section="vocabulary"]');
const vocabGroup = document.querySelector('.nav-section-group[data-nav-section-group="vocabulary"]');

assert(!!verbsToggle && !!verbsGroup, "Verbs section toggle + group exist");
assert(!!vocabToggle && !!vocabGroup, "Vocabulary section toggle + group exist");

// --- Default state: both expanded ---
assert(verbsToggle.getAttribute("aria-expanded") === "true", "Verbs section starts expanded");
assert(!verbsGroup.hasAttribute("hidden"), "Verbs group is visible by default");
assert(vocabToggle.getAttribute("aria-expanded") === "true", "Vocabulary section starts expanded");
assert(!vocabGroup.hasAttribute("hidden"), "Vocabulary group is visible by default");

for (const page of ["review", "verb-flashcards", "parsing", "construction"]) {
  assert(!!verbsGroup.querySelector(`.nav-btn[data-page="${page}"]`), `Verbs group contains ${page}`);
}
for (const page of ["vocabulary", "vocab-flashcards", "vocab-typing", "vocab-games"]) {
  assert(!!vocabGroup.querySelector(`.nav-btn[data-page="${page}"]`), `Vocabulary group contains ${page}`);
}

// --- Collapsing ---
click(verbsToggle);
assert(verbsToggle.getAttribute("aria-expanded") === "false", "clicking the toggle collapses Verbs");
assert(verbsGroup.hasAttribute("hidden"), "Verbs group is hidden once collapsed");
assert(vocabToggle.getAttribute("aria-expanded") === "true", "Vocabulary section is unaffected by collapsing Verbs");
assert(localStorage.getItem("navSectionCollapsed:verbs") === "1", "collapsed state is persisted to storage");

// --- Re-expanding ---
click(verbsToggle);
assert(verbsToggle.getAttribute("aria-expanded") === "true", "clicking again re-expands Verbs");
assert(!verbsGroup.hasAttribute("hidden"), "Verbs group is visible again");
assert(localStorage.getItem("navSectionCollapsed:verbs") === "0", "expanded state is persisted to storage");

// --- Navigating to a page inside a collapsed section auto-expands it ---
click(verbsToggle); // collapse again
assert(verbsGroup.hasAttribute("hidden"), "Verbs collapsed again ahead of the navigation check");

navigateTo(document, "parsing");
await new Promise((r) => setTimeout(r, 30));

assert(!verbsGroup.hasAttribute("hidden"), "navigating to a page inside a collapsed section auto-expands it");
assert(verbsToggle.getAttribute("aria-expanded") === "true", "the toggle's aria-expanded reflects the auto-expand");
assert(
  document.querySelector('.nav-btn[data-page="parsing"]').classList.contains("active"),
  "the active page is correctly highlighted once visible"
);

summary();
