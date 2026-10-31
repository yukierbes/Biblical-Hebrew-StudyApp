import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import * as rs from "../public/js/root-search.js";
import * as vr from "../public/js/vocab-roots.js";
import { getVocabRows } from "../public/js/vocab-data.js";

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const choose = (radio) => {
  radio.checked = true;
  radio.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
};
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new document.defaultView.Event("input", { bubbles: true }));
};

console.log("Root letter matching");
assert(rs.rootLetters("שָׁמַר") === "שמר" && rs.rootLetters("מֶלֶךְ") === "מלכ" && rs.rootLetters("מלכ") === "מלכ", "points are dropped and final letters made regular");
assert(rs.matchWord("מֶלֶךְ", rs.rootLetters("מלך"))?.kind === "adjacent", "a final-form search (מלך) finds a word that ends in final khaf");
assert(rs.matchWord("מֶלֶךְ", rs.rootLetters("מלכ"))?.kind === "adjacent", "...and so does the regular-form search (מלכ)");
assert(rs.matchWord("נָפַל", rs.rootLetters("נפל"))?.kind === "adjacent", "ordinary root, letters together");
assert(rs.matchWord("מַלְאָךְ", "מלכ")?.kind === "ordered", "letters in order but spread apart still match (מלאך for מלך)");
assert(rs.matchWord("נָפַל", "פלנ") === null, "letters out of order do not match");
assert(rs.matchWord("מִשְׁמָר", "שמר", { mode: "starts" }) === null && rs.matchWord("שָׁמַר", "שמר", { mode: "starts" })?.kind === "starts", "'starts with' is stricter");
assert(rs.matchWord("אִישׁ ; אֲנָשִׁים", "אנש")?.kind === "adjacent", "a word with several forms is checked form by form");
assert(rs.matchWord("אִישׁ ; אֲנָשִׁים", "שנא") === null, "letters are not joined across different forms");
assert(rs.matchWord("פָּל", "נפל") === null && rs.matchWord("פָּל", "נפל", { weak: true })?.missing === "נ", "weak roots: a missing nun is found only when asked for");
assert(rs.matchWord("צַד", "צדק", { weak: true }) === null, "a missing strong letter is never guessed");

console.log("\nThe page");
navigateTo(document, "search");
await wait();
assert(!content.querySelector('input[name="lookup-mode"]') && content.querySelectorAll('input[type="text"]').length === 1, "one search bar, and no choice of kinds of search above it");
assert(!content.querySelector('.lookup-searchbox input[type="checkbox"], .lookup-searchbox input[type="radio"]'), "the options are selectable boxes, not check boxes");
const chipRows = [...content.querySelectorAll(".lookup-option-row")];
assert(chipRows.length === 2 && chipRows[0].textContent.includes("Hebrew") && chipRows[0].textContent.includes("English meaning") && chipRows[0].textContent.includes("Ignore vowel points"), "beneath it: what to match (Hebrew, English meaning, vowel points)");
for (const s of ["Verb Forms", "Vocabulary", "Accents", "Consonants", "Vowels"]) assert(chipRows[1].textContent.includes(s), `can choose to look in ${s}`);
assert([...content.querySelectorAll(".lookup-chip")].every((c) => c.getAttribute("aria-pressed") === "true" && c.classList.contains("selected")), "every box starts selected");
assert(/Results will appear here/.test(content.querySelector(".lookup-hint").textContent) && !content.querySelector(".lookup-results .alert"), "the empty state is a quiet hint, not a box that looks like a field");

let input = content.querySelector('input[type="text"]');
type(input, "קָטַל");
await wait();
let sections = [...content.querySelectorAll(".lookup-section")];
assert(sections.length === 5, "five collapsible sections of results");
const toggles = () => [...content.querySelectorAll(".lookup-section-toggle")];
assert(toggles().every((t) => /match|no matches/.test(t.textContent)), "each heading says how many matches it found");
const bodies = () => [...content.querySelectorAll(".lookup-section-body")];
const opened = bodies().filter((b) => !b.hidden).length;
assert(opened === 1 && toggles().filter((t) => !/no matches/.test(t.textContent)).length === 1, "when only one section has matches, just that one opens");
type(input, "ב");
await wait();
const many = bodies().filter((b) => !b.hidden).length;
assert(toggles().filter((t) => !/no matches/.test(t.textContent)).length > 1 && many === 0, "when several sections have matches they all start collapsed");
const vocabToggle = toggles().find((t) => t.textContent.startsWith("Vocabulary"));
click(vocabToggle);
assert(!content.querySelector('.lookup-section[data-section="vocab"] .lookup-section-body').hidden, "clicking a heading opens it");
assert(content.querySelectorAll('.lookup-section[data-section="vocab"] .tray-col').length > 1, "results have the ★ ✎ ⚑ tray");
assert(content.querySelector('.lookup-section[data-section="vocab"] .note-col'), "and a My note column");

console.log("\nChoosing where to look");
const verbChip = content.querySelector('.lookup-chip[data-section="verbs"]');
click(verbChip);
assert(verbChip.getAttribute("aria-pressed") === "false" && !verbChip.classList.contains("selected"), "selecting a box again turns it off");
assert(!content.querySelector('.lookup-section[data-section="verbs"]'), "turning a place off removes its results");
click(verbChip);
assert(!!content.querySelector('.lookup-section[data-section="verbs"]'), "and on again brings them back");
const firstHeading = content.querySelector(".lookup-section-heading");
assert(firstHeading.querySelector(".lookup-section-toggle") && firstHeading.className.includes("lookup-section-heading"), "each result heading is just the collapsible button");

console.log("\nSearching a root's letters, then choosing the words that belong");
input = content.querySelector('input[type="text"]');
type(input, "שמר");
await wait();
const vocabRows = () => [...content.querySelectorAll('.lookup-section[data-section="vocab"] tbody tr')];
const nShamar = vocabRows().length;
assert(nShamar >= 3, `a plain Hebrew search for שמר (no vowels) finds the vocabulary words that contain it (${nShamar})`);
assert(vocabRows().every((tr) => !tr.querySelector(".lookup-row-select").checked), "nothing is ticked until you choose");
const setRootBtn = () => content.querySelector(".lookup-set-root");
assert(setRootBtn().disabled && /Set root \(0 selected\)/.test(setRootBtn().textContent), "Set root (0 selected) waits for a selection");
type(input, "שמר");
const sel = [...content.querySelectorAll(".lookup-bulkbar button")].find((b) => b.textContent.startsWith("Select all matches"));
click(sel);
assert(setRootBtn().textContent === `Set root (${nShamar} selected)` && !setRootBtn().disabled, "Select all matches ticks every row and updates the button");
assert(vocabRows().every((tr) => tr.querySelector(".lookup-row-select").checked), "all the checkboxes are ticked");
const shown = vocabRows().length;
click([...content.querySelectorAll(".lookup-bulkbar button")].find((b) => b.textContent === "Clear Selection"));
assert(setRootBtn().disabled, "Clear Selection empties it");

console.log("\nAssigning a root: conflicts and undo");
// give two words another root first, so there are conflicts
const rowsBefore = getVocabRows();
const firstTwo = [...content.querySelectorAll('.lookup-section[data-section="vocab"] .lookup-row-select')].slice(0, 2).map((cb) => decodeURIComponent(cb.dataset.key));
const byKey = (k) => rowsBefore.find((r) => `${r.Lesson}||${r.Hebrew}||${r.English}` === k);
vr.setRootForWord(byKey(firstTwo[0]), "זזז");
vr.setRootForWord(byKey(firstTwo[1]), "זזז");
type(input, "שמר");
click([...content.querySelectorAll(".lookup-bulkbar button")].find((b) => b.textContent.startsWith("Select all matches")));
click(setRootBtn());
await wait();
const modal = document.getElementById("vocab-root-editor-modal");
assert(!!modal, "Set root opens the bulk root editor");
const rootInput = modal.querySelector('input[type="text"]');
assert(rootInput.value === "שמר", "its box starts with the letters that were searched");
assert(/2 of these words already have a different root/.test(modal.textContent), "it names the words that already have a different root");
assert(modal.querySelector('input[name="root-conflict-choice"][value="skip"]').checked, "skipping them is the default here");
assert(modal.querySelectorAll('.root-preview-row[data-conflict="1"]').length === 2, "the conflicts are marked in the preview");
const onlyBox = [...modal.querySelectorAll('input[type="checkbox"]')][0];
onlyBox.checked = true;
onlyBox.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
assert(modal.querySelectorAll(".root-preview-row").length === 2, "Show conflicts only lists just those words");
const applyBtn = [...modal.querySelectorAll("button")].find((b) => /^Set Root for/.test(b.textContent));
assert(applyBtn.textContent === `Set Root for ${nShamar - 2} Words`, "the button counts only the words that will change");
click(applyBtn);
await wait();
assert(vr.getRootForWord(byKey(firstTwo[0])) === "זזז", "skipped words keep the root they had");
const another = rowsBefore.filter((r) => rs.matchWord(r.Hebrew, "שמר")).find((r) => !firstTwo.includes(`${r.Lesson}||${r.Hebrew}||${r.English}`));
assert(vr.getRootForWord(another) === "שמר", "the other words now have the root");
const banner = content.querySelector(".lookup-banner");
assert(!!banner && /Set root שמר for \d+ words \(2 kept their own root\)/.test(banner.textContent), "a banner reports what was done");
assert(!!content.querySelector(".lookup-undo"), "with an Undo last assignment button");
click(content.querySelector(".lookup-undo"));
await wait();
assert(vr.getRootForWord(another) === "" && vr.getRootForWord(byKey(firstTwo[0])) === "זזז", "undo puts every word back as it was");
assert(vr.getLastRootChange() === null, "and there is nothing more to undo");

console.log("\nReplacing");
click([...content.querySelectorAll(".lookup-bulkbar button")].find((b) => b.textContent.startsWith("Select all matches")));
click(setRootBtn());
await wait();
const modal2 = document.getElementById("vocab-root-editor-modal");
choose(modal2.querySelector('input[name="root-conflict-choice"][value="replace"]'));
click([...modal2.querySelectorAll("button")].find((b) => /^Set Root for/.test(b.textContent)));
await wait();
assert(vr.getRootForWord(byKey(firstTwo[0])) === "שמר", "replacing changes the words that had another root");
assert(![...content.querySelectorAll(".lookup-banner button")].some((b) => /Show words with this root/.test(b.textContent)), "(the old assigned-root search is gone, so the banner no longer offers it)");
vr.undoLastRootChange();

console.log("\nEdit in place");
assert(content.querySelectorAll(".lookup-cat-edit").length === nShamar && content.querySelectorAll(".lookup-root-edit").length === nShamar, "each word has Edit buttons for category and root");
click(content.querySelector(".lookup-root-edit"));
assert(!!document.getElementById("vocab-root-editor-modal"), "Edit root opens the editor without leaving the page");
click(document.querySelector("#vocab-root-editor-modal .modal-close"));
assert(document.querySelector('.nav-btn.active')?.dataset.page === "search", "still on Word Lookup");

console.log("\nRecent searches");
navigateTo(document, "home");
await wait();
navigateTo(document, "search");
await wait();
const recent = [...content.querySelectorAll(".lookup-recent-btn")];
assert(recent.length >= 1 && recent.length <= 3, `recent searches are kept (${recent.length})`);
for (const q of ["אב", "בן", "דבר", "ים"]) {
  const inp = content.querySelector('input[type="text"]');
  type(inp, q);
  inp.dispatchEvent(new document.defaultView.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}
const last3 = [...content.querySelectorAll(".lookup-recent-btn")].map((b) => b.textContent);
assert(last3.length === 3 && last3[0].startsWith("ים") && !last3.some((t) => t.startsWith("אב")), "only the latest three are kept, newest first");
click(content.querySelectorAll(".lookup-recent-btn")[1]);
await wait();
assert(content.querySelector('input[type="text"]').value === "דבר", "clicking one restores that search");

summary();
