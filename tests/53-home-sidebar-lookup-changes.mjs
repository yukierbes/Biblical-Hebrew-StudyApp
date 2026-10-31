import fs from "node:fs";
import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { resultMessage } from "../public/js/encourage.js";
import { setDotForm, fixDotsIn, isHeadingFont } from "../public/js/latin-marks.js";
import { recordItemResult } from "../public/js/srs.js";
import { getAllAreaStats } from "../public/js/home-data.js";

const { document, localStorage } = await setupApp();
const content = document.getElementById("content");
const win = document.defaultView;
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const css = fs.readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");
const keydown = (t, key) => t.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

console.log("No Hebrew messages");
const msgs = new Set();
for (let seed = 0; seed < 40; seed++) msgs.add(resultMessage(100, seed).text);
assert([...msgs].every((m) => !/[\u0590-\u05FF]/.test(m) && !/yasher|koach/i.test(m)), `a perfect score says only English (${[...msgs].join(" / ")})`);

console.log("\nHome: the Welcome guide box and the Foundations box");
navigateTo(document, "home");
await wait(200);
const guide = content.querySelector(".guide-row");
assert(!!guide && guide.classList.contains("resume-row"), "the Welcome guide is a box in the same style as 'Pick up where you left off'");
assert(guide.querySelector(".resume-title").textContent === "Welcome guide" && guide.querySelectorAll("button").length === 2, "with a title and its two buttons");
assert(!content.querySelector(".home-guide-row"), "the loose text line is gone");
const order = [...content.querySelectorAll(".area-tiles > .area-tile")].map((t) => t.dataset.homeSection);
assert(order.join() === "foundations,bible", "Foundations comes first, then Bible in Context");
const box = content.querySelector(".foundations-tile");
assert(box.querySelectorAll(".found-row").length === 5 && box.querySelectorAll(".found-row .found-bar").length === 5, "five rows, one thin bar each");
assert(/20%/.test(box.querySelector(".area-tile-pct").textContent), "each area is worth 20% of the headline");
assert(box.querySelector(".area-tile-actions").textContent.includes("See details in My Progress"), "it ends with the same two buttons as the Bible box");

// Master every consonant (34 of 34): that is the whole of its 20%, so the headline reads 20%.
const cons = getAllAreaStats().find((a) => a.area.id === "consonants");
for (const row of cons.area.pool()) for (let i = 0; i < 6; i++) recordItemResult(cons.area.statModes[0], cons.area.key(row), true);
navigateTo(document, "progress");
await wait(100);
navigateTo(document, "home");
await wait(200);
const after = content.querySelector(".foundations-tile");
assert(/^20%/.test(after.querySelector(".area-tile-pct").textContent.trim()), `all 34 consonants mastered = 100% of its 20%: the headline reads ${after.querySelector(".area-tile-pct").textContent.trim().slice(0, 4)}`);
assert(/100%/.test(after.querySelector('.found-row[data-home-section="consonants"]').textContent) && /0%/.test(after.querySelector('.found-row[data-home-section="vowels"]').textContent), "the Consonants row shows 100% and the others 0%");

console.log("\nReading: the percentage on the chosen passage");
assert(/\.choice-btn\.selected \.reading-know[\s\S]*?color:\s*inherit/.test(css), "on the selected (dark) passage button the percentage takes the button's light text colour");

console.log("\nMy Progress: Settings moved");
navigateTo(document, "progress");
await wait(150);
assert(!content.querySelector("#pm-daily-goal") && !/Display name|Daily goal/.test(content.querySelector("#pm-panel").textContent), "the Overview no longer has the Settings box");
const tab = [...content.querySelectorAll(".pm-tab")].find((t) => /Backup/.test(t.textContent));
assert(tab.textContent.trim() === "Backup & Settings", "the tab is called Backup & Settings (capital S)");
click(tab);
await wait(100);
const panel = content.querySelector("#pm-panel");
assert(!!panel.querySelector("#pm-daily-goal") && !!panel.querySelector("#confidence-setting") && /Display name|Celebration/.test(panel.textContent), "the Settings box is on that tab: daily goal, display name, celebration and the rest");
assert([...panel.querySelectorAll("h3")].map((h) => h.textContent).includes("Settings"), "under a Settings heading");
assert(panel.querySelector("#backup-file") && /Download backup/.test(panel.textContent), "alongside the backup tools");

console.log("\nSidebar: the streak and a Settings gear");
const footer = document.querySelector(".sidebar-footer");
const toggle = document.getElementById("settings-toggle");
const pop = document.getElementById("settings-popover");
assert(pop.hidden && toggle.getAttribute("aria-expanded") === "false", "the pop-over starts closed");
const visibleInFooter = [...footer.children].filter((c) => c !== pop).map((c) => c.id);
assert(visibleInFooter.join() === "streak-display,settings-toggle", "on show: just the streak and the gear");
assert(["a11y-row", "hebrew-size-row", "account-section"].every((id) => pop.querySelector("#" + id) || pop.querySelector(`.${id}`)) && pop.querySelector('[data-page="credits"]'), "behind the gear: text size, Hebrew size, Account, Sources & Credits");
assert(/Appearance/.test(pop.textContent), "and Appearance");
const { initSettingsPopover } = await import("../public/js/settings-popover.js");
initSettingsPopover();
click(toggle);
assert(!pop.hidden && toggle.getAttribute("aria-expanded") === "true" && pop.contains(document.activeElement), "the gear opens it and focus moves inside");
keydown(document.activeElement, "Escape");
assert(pop.hidden && document.activeElement === toggle, "Escape closes it and returns focus to the gear");
click(toggle);
document.body.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
assert(pop.hidden, "a click elsewhere closes it");
click(toggle);
click(pop.querySelector('[data-page="credits"]'));
assert(pop.hidden, "choosing Sources & Credits closes it");
click(toggle);
click(toggle);
assert(pop.hidden, "the gear also closes it");

console.log("\nWord Lookup");
navigateTo(document, "search");
await wait(200);
assert(content.querySelectorAll('.lookup-searchbox input[type="text"]').length === 1 && !content.querySelector('input[name="lookup-mode"]'), "one search bar, with none of the old kinds of search above it");
assert(content.querySelectorAll(".lookup-chip").length === 8 && !content.querySelector('.lookup-searchbox input[type="checkbox"]'), "the options beneath are selectable boxes (3 to match, 5 places to look)");
assert(!!content.querySelector('label[for="lookup-input"]') && document.getElementById("lookup-input"), "the search bar has its own label");
assert(!content.querySelector(".lookup-results .alert-info") && /Results will appear here/.test(content.querySelector(".lookup-hint").textContent), "the empty-state message is a quiet hint, not a box that looks like a field");
assert(/\.lookup-section-heading::before\s*\{\s*content:\s*none/.test(css), "result headings have no dot, only the arrow");

console.log("\nBible print: question count");
assert(/bp-stepper/.test(fs.readFileSync(new URL("../public/js/bible-print.js", import.meta.url), "utf8")), "the count is a stepper (covered in detail by test 50)");

console.log("\nDotted letters (ṣ ḥ ṭ)");
const composed = "Qame\u1E63-\u1E25a\u1E6Duf";
const decomposed = "Qames\u0323-h\u0323at\u0323uf";
assert(setDotForm(composed, false) === decomposed, "in body text, single characters become letter + dot (which Plex draws)");
assert(setDotForm(decomposed, true) === composed, "in headings, letter + dot becomes the single character (which Fraunces draws)");
assert(setDotForm("plain text", false) === "plain text" && setDotForm("שָׁלוֹם", true) === "שָׁלוֹם", "other text is left alone");
assert(setDotForm(composed, false).normalize("NFC") === composed, "only the form changes: the letters are the same");
const body = document.createElement("div");
body.innerHTML = `<h1>Qame\u1E63 vs</h1><p>Qame\u1E63-\u1E25a\u1E6Duf</p><textarea>\u1E63</textarea>`;
document.body.appendChild(body);
const fake = (e) => ({ fontFamily: e.tagName === "H1" ? "Fraunces, serif" : "IBM Plex Sans, sans-serif" });
const n = fixDotsIn(body, { getStyle: fake });
assert(body.querySelector("h1").textContent === "Qame\u1E63 vs" && body.querySelector("p").textContent === "Qames\u0323-h\u0323at\u0323uf", "a heading keeps the single character; body text gets letter + dot");
assert(body.querySelector("textarea").textContent === "\u1E63" && n === 1, "text boxes are not touched");
assert(isHeadingFont(document.createElement("h1"), () => ({ fontFamily: '"Fraunces", serif' })), "the heading font is recognised");
body.remove();

summary();
