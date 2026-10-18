import { setupApp, assert, summary, navigateTo, findButtonByText } from "./helpers.mjs";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// The Consonants and Vowels pages: navigation order, that every page mounts,
// the data rules (dagesh forms are separate rows, aleph/ayin marks), filters,
// and the typing answer checks (including the ◌ placeholder and the
// qameṣ / qameṣ-ḥaṭuf pair that share one mark).

const dir = path.dirname(fileURLToPath(import.meta.url));
const data = (f) => JSON.parse(readFileSync(path.join(dir, "../netlify/functions/data", f), "utf-8"));
const consonants = data("consonants.json");
const vowels = data("vowels.json");
// The names are stored with combining marks; compare them in NFC.
const vowelNamed = (name) => vowels.rows.find((r) => r.Name.normalize("NFC") === name.normalize("NFC"));

console.log("\nData");
assert(consonants.rows.length === 34, "34 consonant rows (dagesh forms are separate rows)");
assert(vowels.rows.length === 16, "16 vowel rows");
const byName = Object.fromEntries(consonants.rows.map((r) => [r.Name, r]));
assert(byName["bet"].Form !== byName["bet (dagesh)"].Form, "bet and bet (dagesh) are different forms");
assert(byName["aleph"].Transliteration === "\u02BE", "aleph transliteration is ʾ (curves like \")\")");
assert(byName["ayin"].Transliteration === "\u02BF", "ayin transliteration is ʿ (curves like \"(\")");
assert(consonants.rows.every((r) => r.Keyboard), "every consonant has a keyboard combination");
assert(vowels.rows.every((r) => r.Keyboard && r.Form.includes("\u25CC")), "every vowel has a keyboard combination and shows the ◌ placeholder");

const { document, window } = await setupApp();

console.log("\nNavigation order");
const sidebarOrder = [...document.querySelectorAll(".nav-section-toggle")].map((b) => b.dataset.navSection);
assert(JSON.stringify(sidebarOrder) === JSON.stringify(["consonants", "vowels", "vocabulary", "verbs", "accents", "bible"]), "sidebar order: " + sidebarOrder.join(", "));
for (const pre of ["consonant", "vowel"]) {
  for (const mode of ["review", "flashcards", "typing", "games"]) {
    assert(!!document.querySelector(`.nav-btn[data-page="${pre}-${mode}"]`), `sidebar has ${pre}-${mode}`);
  }
}
const homeOrder = [...document.querySelectorAll("[data-home-section]")].map((b) => b.dataset.homeSection);
if (homeOrder.length) assert(JSON.stringify(homeOrder) === JSON.stringify(["consonants", "vowels", "vocabulary", "verbs", "accents"]), "home order: " + homeOrder.join(", "));

console.log("\nEvery new page mounts");
const content = document.getElementById("content");
const titles = {
  "consonant-review": "Consonants Review",
  "consonant-flashcards": "Consonants Flashcards",
  "consonant-typing": "Consonants Typing",
  "consonant-games": "Consonants Games",
  "vowel-review": "Vowels Review",
  "vowel-flashcards": "Vowels Flashcards",
  "vowel-typing": "Vowels Typing",
  "vowel-games": "Vowels Games",
};
for (const [page, title] of Object.entries(titles)) {
  navigateTo(document, page);
  await new Promise((r) => setTimeout(r, 50));
  const h1 = content.querySelector("h1");
  assert(h1 && h1.textContent === title, `${page} shows "${title}"`);
}

console.log("\nReview tables and filters");
navigateTo(document, "consonant-review");
await new Promise((r) => setTimeout(r, 50));
assert(content.querySelectorAll("tbody tr").length === 34, "consonant review lists 34 rows");
assert(!!findButtonByText(content, "Print Blank Table"), "consonant review has Print Blank Table");
assert(!!findButtonByText(content, "Print Table (Answer Key)"), "consonant review has the answer-key print");
const sidebarExtra = document.getElementById("sidebar-extra");
// Every box starts ticked, so clear the Category box first, then tick just Final Form.
sidebarExtra.querySelector(".clear-all-btn").click();
await new Promise((r) => setTimeout(r, 50));
const finalForm = [...sidebarExtra.querySelectorAll("label")].find((l) => l.textContent.trim() === "Final Form");
assert(!!finalForm, "Category filter lists Final Form");
finalForm.querySelector("input").click();
await new Promise((r) => setTimeout(r, 50));
assert(content.querySelectorAll("tbody tr").length === 5, "Final Form filter leaves the 5 final letters");

navigateTo(document, "vowel-review");
await new Promise((r) => setTimeout(r, 50));
assert(content.querySelectorAll("tbody tr").length === 16, "vowel review lists 16 rows");

console.log("\nTyping answer checks");
const m = await import(path.join(dir, "../public/js/letter-answer-matching.js"));
const kamats = vowelNamed("qameṣ");
const hatuf = vowelNamed("qameṣ-ḥaṭuf");
assert(kamats.Form === hatuf.Form, "qameṣ and qameṣ-ḥaṭuf are written with the same mark");
assert(m.isFormAnswerCorrect(kamats, kamats.Form), "vowel accepted with ◌");
assert(m.isFormAnswerCorrect(kamats, kamats.Form.replace("\u25CC", "")), "vowel accepted without ◌");
assert(!m.isFormAnswerCorrect(kamats, vowelNamed("pataḥ").Form), "a different vowel is rejected");
assert(m.isFormAnswerCorrect(hatuf, kamats.Form), "the same mark is right for both qameṣ and qameṣ-ḥaṭuf");
assert(!m.isFormAnswerCorrect(byName["bet"], byName["bet (dagesh)"].Form), "bet needs no dagesh; bet (dagesh) is not accepted for it");
assert(m.isFormAnswerCorrect(byName["bet (dagesh)"], byName["bet (dagesh)"].Form), "bet (dagesh) accepted");
// shin dot and dagesh typed in the other order still count
const shin = consonants.rows.find((r) => r.Form.includes("\u05C1"));
assert(!!shin, "a shin/sin form with its dot is in the data");
assert(m.isKeyboardAnswerCorrect(consonants.rows[0], consonants.rows[0].Keyboard), "keyboard answer accepted");

console.log("\nHints for the shared mark");
const sets = await import(path.join(dir, "../public/js/letter-sets.js"));
const vset = sets.getLetterSet("vowels");
assert(sets.ambiguityHints(vset, kamats).length === 1 && /A class/.test(sets.ambiguityHints(vset, kamats)[0].text), "qameṣ hint names the A class");
assert(/O class/.test(sets.ambiguityHints(vset, hatuf)[0].text), "qameṣ-ḥaṭuf hint names the O class");
assert(sets.ambiguityHints(vset, vowelNamed("pataḥ")).length === 0, "no hint for a vowel with its own mark");

summary();
