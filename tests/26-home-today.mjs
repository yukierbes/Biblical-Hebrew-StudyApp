import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { recordItemResult } from "../public/js/srs.js";
import { getLetterSet } from "../public/js/letter-sets.js";
import { getAccentRows } from "../public/js/accent-data.js";
import { accentRowKey } from "../public/js/accent-filters.js";
import { readFileSync } from "fs";

// The Home page's "Today" card must count the typing modes that exist now
// (Name → letter, and Letter → name), not the old keyboard-shortcut mode, and
// the Typing cards must describe what Typing does today.

const { document, window } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const due = () => {
  const txt = content.querySelector(".today-card-due").textContent;
  const m = txt.match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
};
const show = async () => {
  navigateTo(document, "progress");
  await wait();
  navigateTo(document, "home");
  await wait(100);
};

console.log("\nDue count");
await show();
const start = due();
const vowels = getLetterSet("vowels");
const consonants = getLetterSet("consonants");

// A miss makes an item due again straight away.
recordItemResult("vowel-typing-form", vowels.rowKey(vowels.rows()[0]), false);
await show();
assert(due() === start + 1, "a missed Vowel → name question counts as due");

recordItemResult("consonant-typing-form", consonants.rowKey(consonants.rows()[0]), false);
await show();
assert(due() === start + 2, "a missed Consonant → name question counts as due");

recordItemResult("accent-typing-form", accentRowKey(getAccentRows()[0]), false);
await show();
assert(due() === start + 3, "a missed Accent → name question counts as due");

recordItemResult("vowel-typing-symbol", vowels.rowKey(vowels.rows()[1]), false);
await show();
assert(due() === start + 3, "the old keyboard-shortcut mode is no longer counted");

console.log("\nTyping cards");
const cards = [...content.querySelectorAll(".mode-card")].map((c) => c.textContent);
assert(!cards.some((t) => /keyboard shortcut/i.test(t)), "no Typing card mentions a keyboard shortcut");
assert(cards.some((t) => /name of the letter shown/.test(t)), "Consonants Typing card describes Letter → name");
assert(cards.some((t) => /name of the vowel shown/.test(t)), "Vowels Typing card describes Vowel → name");
assert(cards.some((t) => /English name of the accent shown/.test(t)), "Accents Typing card describes Accent → name");

console.log("\nInstalled-app name");
const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf-8"));
assert(manifest.name === "Biblical Hebrew Study App", "the manifest uses the app's name");
assert(!/verb/i.test(manifest.short_name), "the short name no longer says Verbs");

summary();
