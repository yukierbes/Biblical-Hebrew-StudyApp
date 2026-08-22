import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");

console.log("Pages mount + navigation");

assert(!document.querySelector(".alert-error"), "app loads without a fatal error banner");
assert(document.querySelector(".nav-btn.active")?.dataset.page === "home", "home is active by default");

for (const page of ["review", "verb-flashcards", "parsing", "construction", "search", "vocabulary", "vocab-flashcards", "vocab-typing", "vocab-games", "accent-review", "accent-flashcards", "accent-typing", "accent-games", "progress", "achievements", "daily-challenge", "home"]) {
  navigateTo(document, page);
  await new Promise((r) => setTimeout(r, 30));
  assert(document.querySelector(".nav-btn.active")?.dataset.page === page, `nav highlights ${page} after navigating`);
  assert(content.innerHTML.length > 100, `${page} renders non-trivial content`);
  assert(document.activeElement === content, `focus moves to #content after navigating to ${page}`);
}

summary();
