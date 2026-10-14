import { setupApp, assert, summary, navigateTo, findButtonByText } from "./helpers.mjs";
import { isNameAnswerCorrect } from "../public/js/name-matching.js";
import { getLetterSet } from "../public/js/letter-sets.js";
import { isNameCorrect, primaryNameText } from "../public/js/letter-answer-matching.js";
import { getAccentRows } from "../public/js/accent-data.js";
import { isAccentNameCorrect, primaryAccentNameText } from "../public/js/accent-answer-matching.js";

// Typing "Form → name" on Consonants, Vowels and Accents: the name is checked
// leniently (no marks, capitals, spaces or hyphens needed).

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const vowels = getLetterSet("vowels");
const consonants = getLetterSet("consonants");
const nfc = (x) => x.normalize("NFC");
const v = (name) => vowels.rows().find((r) => nfc(r.Name) === nfc(name));
const c = (name) => consonants.rows().find((r) => nfc(r.Name) === nfc(name));

console.log("\nVowels: names without marks are accepted");
assert(isNameCorrect(vowels, v("ṣere"), "sere"), "sere for ṣere");
assert(isNameCorrect(vowels, v("ṣere"), "ṣere"), "ṣere (with its mark) for ṣere");
assert(isNameCorrect(vowels, v("ṣere"), "  SERE "), "capitals and spaces do not matter");
assert(isNameCorrect(vowels, v("šureq"), "sureq"), "sureq for šureq");
assert(isNameCorrect(vowels, v("šureq"), "shureq"), "shureq for šureq");
assert(isNameCorrect(vowels, v("ḥāṭef-pataḥ"), "hatef patah"), "hatef patah for ḥāṭef-pataḥ");
assert(isNameCorrect(vowels, v("ḥāṭef-pataḥ"), "hatef-patah"), "hatef-patah for ḥāṭef-pataḥ");
assert(isNameCorrect(vowels, v("ṣere-yod"), "sere yod"), "sere yod for ṣere-yod");
assert(!isNameCorrect(vowels, v("ṣere"), "sere-yod"), "sere-yod is not ṣere");
assert(!isNameCorrect(vowels, v("segol"), "sere"), "a different vowel is wrong");
assert(!isNameCorrect(vowels, v("ṣere"), ""), "an empty answer is wrong");
assert(!isNameCorrect(vowels, v("ḥireq"), "hireq-yod"), "ḥireq-yod is not ḥireq");

console.log("\nVowels: the two vowels written with the same mark");
assert(isNameCorrect(vowels, v("qameṣ"), "qames-hatuf"), "qameṣ-ḥaṭuf accepted when qameṣ is shown (same mark)");
assert(isNameCorrect(vowels, v("qameṣ-ḥaṭuf"), "qames"), "qameṣ accepted when qameṣ-ḥaṭuf is shown");
assert(nfc(primaryNameText(vowels, v("qameṣ"))) === nfc("qameṣ / qameṣ-ḥaṭuf"), "the revealed answer lists both names");
assert(nfc(primaryNameText(vowels, v("pataḥ"))) === nfc("pataḥ"), "an ordinary vowel shows just its name");

console.log("\nConsonants");
assert(isNameCorrect(consonants, c("šin"), "sin"), "sin for šin");
assert(isNameCorrect(consonants, c("šin"), "shin"), "shin for šin");
assert(isNameCorrect(consonants, c("šin"), "šin"), "šin for šin");
assert(isNameCorrect(consonants, c("śin"), "sin"), "sin for śin");
assert(!isNameCorrect(consonants, c("šin"), "śin"), "typing the marked śin for šin is wrong");
assert(!isNameCorrect(consonants, c("śin"), "šin"), "typing the marked šin for śin is wrong");
assert(!isNameCorrect(consonants, c("śin"), "shin"), "shin is not śin");
assert(isNameCorrect(consonants, c("ṣadê"), "sade"), "sade for ṣadê");
assert(isNameCorrect(consonants, c("reš"), "res") && isNameCorrect(consonants, c("reš"), "resh"), "res / resh for reš");
assert(isNameCorrect(consonants, c("ḥet"), "het"), "het for ḥet");
assert(isNameCorrect(consonants, c("ṭet"), "tet"), "tet for ṭet");
assert(isNameCorrect(consonants, c("he'"), "he") && isNameCorrect(consonants, c("he'"), "he'"), "he with or without the apostrophe");
assert(isNameCorrect(consonants, c("pe'"), "pe"), "pe for pe'");
assert(isNameCorrect(consonants, c("bet (dagesh)"), "bet dagesh"), "bet dagesh for bet (dagesh)");
assert(isNameCorrect(consonants, c("bet (dagesh)"), "bet (dagesh)"), "bet (dagesh) as written");
assert(!isNameCorrect(consonants, c("bet (dagesh)"), "bet"), "plain bet is not bet (dagesh)");
assert(isNameCorrect(consonants, c("bet"), "bet"), "bet for bet");
assert(!isNameCorrect(consonants, c("bet"), "bet dagesh"), "bet dagesh is not plain bet");
assert(isNameCorrect(consonants, c("vav (waw)"), "vav") && isNameCorrect(consonants, c("vav (waw)"), "waw"), "vav or waw for vav (waw)");
assert(isNameCorrect(consonants, c("final kaf"), "final kaf") && !isNameCorrect(consonants, c("final kaf"), "kaf"), "final kaf needs 'final'");
assert(isNameCorrect(consonants, c("ayin"), "ayin") && !isNameCorrect(consonants, c("aleph"), "ayin"), "every consonant is its own answer");
// Every row's own name (typed exactly, and with marks stripped) is accepted.
const rowsOk = [...consonants.rows(), ...vowels.rows()].every((r) => {
  const set = consonants.rows().includes(r) ? consonants : vowels;
  return isNameCorrect(set, r, r.Name) && isNameCorrect(set, r, r.Name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
});
assert(rowsOk, "every consonant and vowel accepts its own name, with and without marks");

console.log("\nAccents");
const acc = (type, english) => getAccentRows().find((r) => r.Type === type && r.EnglishName === english);
assert(isAccentNameCorrect(acc("Prose Disjunctive", "zaqeph qaton"), "zaqeph qaton"), "exact name");
assert(isAccentNameCorrect(acc("Prose Disjunctive", "zaqeph qaton"), "Zaqeph  Qaton"), "capitals and spacing");
assert(isAccentNameCorrect(acc("Prose Disjunctive", "zaqeph qaton"), "zaqephqaton"), "no space");
assert(!isAccentNameCorrect(acc("Prose Disjunctive", "zaqeph qaton"), "zaqeph gadol"), "a different accent is wrong");
assert(isAccentNameCorrect(acc("Prose Disjunctive", "revia"), "revia gadol") && isAccentNameCorrect(acc("Prose Disjunctive", "revia"), "revia qaton"), "revia / revia gadol / revia qaton share one mark");
assert(primaryAccentNameText(acc("Prose Disjunctive", "revia")).split(" / ").length === 3, "the revealed answer lists all three");
assert(isAccentNameCorrect(acc("Prose Disjunctive", "zarqa"), "tsinnor"), "zarqa and tsinnor share a mark");
assert(isAccentNameCorrect(acc("Poetry Conjunctive", "munakh"), "munakh"), "prose and poetry munakh");
assert(!isAccentNameCorrect(acc("Prose Disjunctive", "atnakh"), ""), "empty is wrong");
assert(getAccentRows().every((r) => isAccentNameCorrect(r, r.EnglishName)), "every accent accepts its own name");

console.log("\nThe name rule on its own");
const rows = [{ n: "ṣere" }, { n: "šin" }, { n: "śin" }];
assert(isNameAnswerCorrect("sere", [rows[0]], (r) => r.n, rows), "plain function: sere");
assert(!isNameAnswerCorrect("sere", [rows[1]], (r) => r.n, rows), "plain function: wrong row");

// ---------- the pages themselves ----------
async function openTyping(page) {
  navigateTo(document, page);
  await wait(100);
  findButtonByText(content, "Practice")?.click?.();
}
const typingText = () => content.textContent;
const setInput = (el, value) => {
  el.value = value;
  el.dispatchEvent(new document.defaultView.Event("input", { bubbles: true }));
};

for (const [page, label, shown] of [
  ["vowel-typing", "Vowel", "Vowel → type the name"],
  ["consonant-typing", "Consonant", "Consonant → type the name"],
]) {
  console.log(`\n${page} page`);
  navigateTo(document, page);
  await wait(100);
  const choices = [...content.querySelectorAll(".choice-group .choice-btn")].map((b) => b.textContent.trim());
  assert(choices[0] === `Name → type the ${label.toLowerCase()}` && choices[1] === shown, `${page}: the two prompt options`);
  assert(!/Keyboard Input|Select Keyboard/.test(typingText()), `${page}: no keyboard-shortcut option left`);

  // First option unchanged: name shown, Hebrew typed (with its keyboard button).
  findButtonByText(content, `Generate a ${label}`).click();
  await wait();
  assert(!!findButtonByText(content, label === "Vowel" ? "Vowel Keyboard" : "Hebrew Keyboard"), `${page}: first option still has the Hebrew keyboard`);

  // Second option: form shown, name typed.
  [...content.querySelectorAll(".choice-group .choice-btn")][1].click();
  await wait();
  findButtonByText(content, `Generate a ${label}`).click();
  await wait();
  const shownForm = content.querySelector(".hebrew-display [lang='he']");
  assert(!!shownForm && !findButtonByText(content, "Vowel Keyboard") && !findButtonByText(content, "Hebrew Keyboard"), `${page}: the form is shown, with no Hebrew keyboard`);
  const input = content.querySelector(".field-group input[type='text']");
  assert(!!input && input.getAttribute("dir") !== "rtl", `${page}: a plain text box for the name`);
  const set = getLetterSet(label === "Vowel" ? "vowels" : "consonants");
  const row = set.rows().find((r) => r.Form === shownForm.textContent.trim());
  const typed = row.Name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  setInput(input, typed);
  findButtonByText(content, "Check Answer").click();
  await wait();
  assert(content.querySelector(".field-label.pill-good"), `${page}: the marks-free name is marked correct`);
  const input2 = content.querySelector(".field-group input[type='text']");
  setInput(input2, "zzz");
  findButtonByText(content, "Check Answer").click();
  await wait();
  assert(content.querySelector(".field-label.pill-warn"), `${page}: a wrong name is marked wrong`);
  findButtonByText(content, "Show Answer").click();
  await wait();
  assert(typingText().includes(row.Name), `${page}: Show Answer reveals the name`);
}

console.log("\naccent-typing page");
navigateTo(document, "accent-typing");
await wait(100);
const aChoices = [...content.querySelectorAll(".choice-group .choice-btn")].map((b) => b.textContent.trim());
assert(aChoices[0] === "Hebrew/English Name → type Accent" && aChoices[1] === "Accent → type the English name", "accent-typing: the two prompt options say Accent");
assert(!/Symbol/.test(typingText()), "accent-typing: the word Symbol is gone from the page");
[...content.querySelectorAll(".choice-group .choice-btn")][1].click();
await wait();
findButtonByText(content, "Generate an Accent").click();
await wait();
const aForm = content.querySelector(".hebrew-display [lang='he']");
assert(!!aForm && !findButtonByText(content, "Accent Keyboard"), "accent-typing: the accent is shown, with no accent keyboard");
const aInput = content.querySelector(".field-group input[type='text']");
const sameMark = getAccentRows().filter((r) => r.Symbol === aForm.textContent.trim());
setInput(aInput, sameMark[0].EnglishName.toUpperCase());
findButtonByText(content, "Check Answer").click();
await wait();
assert(content.querySelector(".field-label.pill-good"), "accent-typing: the English name (any capitals) is marked correct");
findButtonByText(content, "Show Answer").click();
await wait();
assert(typingText().includes(sameMark[0].EnglishName), "accent-typing: Show Answer reveals the name");

console.log("\nQuiz on the Vowels page, name direction");
navigateTo(document, "vowel-typing");
await wait(100);
[...content.querySelectorAll(".choice-group .choice-btn")][1].click();
await wait();
[...content.querySelectorAll("input[type='radio']")].find((r) => r.value === "Quiz").click();
await wait();
findButtonByText(content, "Yes, use filters").click();
await wait();
findButtonByText(content, "Start Quiz").click();
await wait();
let guard = 0;
while (findButtonByText(content, "Next Question") && guard++ < 50) {
  const f = content.querySelector(".hebrew-display [lang='he']").textContent.trim();
  const r = vowels.rows().find((x) => x.Form === f);
  setInput(content.querySelector(".field-group input[type='text']"), r.Name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  findButtonByText(content, "Next Question").click();
  await wait(20);
}
assert(/Score: 10 \/ 10 \(100%\)/.test(typingText()), "quiz: ten marks-free names all score correct");
assert(typingText().includes("Vowel → Name"), "quiz: the summary labels the direction");

summary();
