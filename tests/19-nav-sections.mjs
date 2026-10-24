import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";

const { document, localStorage } = await setupApp();

console.log("Sidebar nav sections: Foundations, and Bible in Context with four subgroups");

const toggle = (k) => document.querySelector(`.nav-section-toggle[data-nav-section="${k}"]`);
const group = (k) => document.querySelector(`.nav-section-group[data-nav-section-group="${k}"]`);
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// --- structure ---
for (const k of ["foundations", "consonants", "vowels", "vocabulary", "verbs", "accents", "bible", "bible-marks", "bible-words", "bible-prefixes", "bible-verbs"]) {
  assert(!!toggle(k) && !!group(k), `${k}: toggle and group exist`);
}
const inside = (k, parent) => group(parent).contains(toggle(k));
for (const k of ["consonants", "vowels", "vocabulary", "verbs", "accents"]) assert(inside(k, "foundations"), `${k} sits inside Foundations`);
for (const k of ["bible-marks", "bible-words", "bible-prefixes", "bible-verbs"]) assert(inside(k, "bible"), `${k} sits inside Bible in Context`);

const pagesOf = (k) => [...group(k).querySelectorAll(".nav-btn")].map((b) => b.dataset.page).join();
assert(pagesOf("bible-marks") === "bible-dagesh,bible-qames,bible-sheva,bible-syllable", "Marks & Syllables: Dagesh, Qameṣ, Shevas, Syllables & Stress");
assert(pagesOf("bible-words") === "bible-noun,bible-pronoun,bible-demo,bible-adj,bible-suffix", "Words: Nouns, Pronouns, Demonstratives, Adjectives, Pronominal Suffixes");
assert(pagesOf("bible-prefixes") === "bible-article,bible-interrog,bible-prefix,bible-vav,bible-min", "Prefixes: Article, Interrogative ה, Prepositions, Vav, Min");
assert(pagesOf("bible-verbs") === "bible-verb", "Verbs: Verbs");
assert(pagesOf("bible").split(",").length === 15, "all 15 Bible pages are in the sidebar once");
assert(document.querySelector('.nav-btn[data-page="bible-pronoun"]').textContent === "Personal Pronouns", "long label shortened: Personal Pronouns");
assert(document.querySelector('.nav-btn[data-page="bible-qames"]').textContent === "Qameṣ / Qameṣ-ḥaṭuf", "long label shortened: Qameṣ / Qameṣ-ḥaṭuf");
assert(["review", "verb-flashcards", "parsing", "construction"].every((p) => group("verbs").querySelector(`.nav-btn[data-page="${p}"]`)), "Verbs group keeps its four pages");

// --- Credits and Reports are below Account, outside the dropdowns ---
const credits = document.querySelector('.nav-btn[data-page="credits"]');
const reports = document.getElementById("nav-reports");
assert(!!credits && credits.closest(".sidebar-footer-links") && !credits.closest(".nav-section-group"), "Sources & Credits is in the footer links");
assert(!!reports && reports.closest(".sidebar-footer-links") && reports.hidden, "Mistake Reports is in the footer links (hidden unless owner)");
assert((document.querySelector(".sidebar-account").compareDocumentPosition(credits) & 4) !== 0, "...below the Account dropdown");

// --- everything starts collapsed; clicking opens and closes; state is remembered ---
assert(toggle("foundations").getAttribute("aria-expanded") === "false" && group("foundations").hasAttribute("hidden"), "Foundations starts collapsed");
click(toggle("foundations"));
assert(!group("foundations").hasAttribute("hidden") && localStorage.getItem("navSectionCollapsed:foundations") === "0", "clicking opens Foundations and remembers it");
click(toggle("verbs"));
assert(!group("verbs").hasAttribute("hidden"), "a dropdown inside Foundations opens");
click(toggle("verbs"));
assert(group("verbs").hasAttribute("hidden") && localStorage.getItem("navSectionCollapsed:verbs") === "1", "...and closes again");
click(toggle("foundations"));
assert(group("foundations").hasAttribute("hidden"), "Foundations closes");

// --- going to a page opens every dropdown above it ---
navigateTo(document, "parsing");
await wait();
assert(!group("verbs").hasAttribute("hidden") && !group("foundations").hasAttribute("hidden"), "Verb Parsing opens Verbs and Foundations");
navigateTo(document, "bible-interrog");
await wait();
assert(!group("bible-prefixes").hasAttribute("hidden") && !group("bible").hasAttribute("hidden"), "Interrogative ה opens Prefixes and Bible in Context");
assert(group("bible-words").hasAttribute("hidden"), "...and leaves the other subgroups closed");
assert(document.querySelector('.nav-btn[data-page="bible-interrog"]').classList.contains("active"), "the page is highlighted");
navigateTo(document, "credits");
await wait();
assert(credits.classList.contains("active"), "Sources & Credits highlights in the footer");

summary();
