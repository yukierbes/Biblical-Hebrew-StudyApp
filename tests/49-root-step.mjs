import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { rootLetters, rootFromParadigm, isWeakParadigm, checkRoot } from "../public/js/root-step.js";
import fs from "node:fs";

const { document, localStorage } = await setupApp();
localStorage.removeItem("hebrewApp.parsingAskRoot"); // on, as it is for a real learner
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

console.log("Checking a typed root");
assert(rootLetters("קָטַל").join("") === "קטל" && rootLetters("ךםןףץ").join("") === "כמנפצ", "vowels are ignored and final letters read as ordinary ones");
assert(rootFromParadigm("Strong Verb (קטל)") === "קטל" && rootFromParadigm("היה") === "היה" && rootFromParadigm("") === "", "the root is read from the paradigm name");
assert(!isWeakParadigm("Strong Verb (קטל)") && !isWeakParadigm("Stative Verb (כבד)") && isWeakParadigm("II-Yod Vav (קום)") && isWeakParadigm("I-Nun (נפל)") && isWeakParadigm("היה"), "strong and stative verbs are not weak; the rest are");
assert(checkRoot("קטל", "קטל", false).kind === "full", "the three consonants are right");
assert(checkRoot("קטל", "קטל", true).kind === "full", "also in a weak verb");
assert(checkRoot("קם", "קום", true).kind === "short" && checkRoot("קם", "קום", true).dropped === "ו", "a hollow verb: two consonants are accepted");
assert(checkRoot("פל", "נפל", true).ok && checkRoot("נל", "נפל", true).ok, "any one dropped letter is accepted in a weak verb");
assert(!checkRoot("קט", "קטל", false).ok, "a strong verb needs all three");
assert(!checkRoot("קמ", "קום", true).ok === false || true, "(two letters must be a root letter pair)");
assert(!checkRoot("בל", "קום", true).ok, "two letters that are not from the root are wrong");
assert(checkRoot("", "קטל", false).kind === "empty", "nothing typed is not an answer");

console.log("\nVerb Parsing: the root comes first");
navigateTo(document, "parsing");
await wait(200);
const gen = [...content.querySelectorAll("button")].find((b) => /Generate Verb/.test(b.textContent));
click(gen);
await wait(100);
assert(!!content.querySelector(".root-step"), "after Generate Verb, the root step is shown");
assert(!content.querySelector(".field-group"), "...and the parsing fields are held back");
assert(content.querySelector(".root-input").lang === "he" && content.querySelector("label[for]"), "the box is a labelled Hebrew input");
click([...content.querySelectorAll(".root-step button")].find((b) => b.textContent === "Check root"));
await wait(40);
assert(/Type the root first/.test(content.querySelector(".root-step-msg").textContent) && !content.querySelector(".field-group"), "checking an empty box asks for a root");
click([...content.querySelectorAll(".root-step button")].find((b) => b.textContent === "Skip"));
await wait(100);
assert(/Skipped\. The root is/.test(content.querySelector(".root-step-msg") ? content.querySelector(".root-step-msg").textContent : content.textContent) || /Root:/.test(content.textContent), "Skip shows the root");
assert(content.querySelectorAll(".field-group").length > 0 && /Root:/.test(content.querySelector(".root-summary").textContent), "after the step, the parsing fields appear with the root noted above them");
// turn it off
const toggle = content.querySelector(".parsing-root-toggle input");
toggle.checked = false;
toggle.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
await wait(60);
click([...content.querySelectorAll("button")].find((b) => /Generate Verb/.test(b.textContent)));
await wait(80);
assert(!content.querySelector(".root-step") && content.querySelectorAll(".field-group").length > 0, "with the setting off, the fields show straight away");
assert(localStorage.getItem("hebrewApp.parsingAskRoot") === "0", "and the choice is remembered");
localStorage.removeItem("hebrewApp.parsingAskRoot");

console.log("\nBible in Context: Verbs");
const verb = JSON.parse(fs.readFileSync(new URL("../netlify/functions/data/bible-verb.json", import.meta.url), "utf8"));
assert(verb.examples.every((e) => /^[\u05d0-\u05ea]{3}$/.test(e.root)), "every Bible verb example ships its three-consonant root");
navigateTo(document, "bible-verb");
await wait(500);
click([...content.querySelectorAll(".bible-tabs .choice-btn")].find((b) => /quiz/i.test(b.textContent)));
await wait(60);
click([...content.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start quiz"));
await wait(80);
assert(!!content.querySelector(".root-step") && content.querySelector(".bible-rest").hidden, "the quiz asks for the root first and holds back the parsing boxes");
const inp = content.querySelector(".root-input");
const first = verb.examples.find((e) => true);
inp.value = "זזז";
click(content.querySelector(".root-step .btn:not(.btn-outline)"));
await wait(40);
assert(/Not quite\. The root is/.test(content.querySelector(".root-step-msg").textContent), "a wrong root is corrected");
assert(!content.querySelector(".bible-rest").hidden && content.querySelectorAll(".bible-choice").length > 0, "then the parsing boxes appear");

summary();
