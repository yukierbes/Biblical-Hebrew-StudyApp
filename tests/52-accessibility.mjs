import fs from "node:fs";
import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");
const win = document.defaultView;
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const css = fs.readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");

// ---- colour contrast, worked out from the stylesheet itself (WCAG: 4.5:1 for normal text) ----
const rgb = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lum = (h) => {
  const [r, g, b] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
console.log("Contrast of the muted text colour in every palette");
const blocks = [...css.matchAll(/(?::root|html\[data-theme="dark"\]|html\[data-palette="(\w+)"\](?:\[data-theme="dark"\])?)\s*(?:,[^{]*)?\{([^}]*)\}/g)];
let checked = 0;
for (const m of blocks) {
  const vars = Object.fromEntries([...m[0].matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((x) => [x[1], x[2]]));
  if (!vars["ink-faint"] || !vars.paper) continue;
  checked++;
  const bgs = [vars.paper, vars["paper-raised"] || vars.paper, ...(vars["accent-soft"] ? [vars["accent-soft"]] : [])];
  const worst = Math.min(...bgs.map((b) => ratio(vars["ink-faint"], b)));
  const name = (m[1] || (m[0].startsWith(":root") ? "classic" : "dark")) + (m[0].includes('data-theme="dark"') && m[1] ? " dark" : "");
  assert(worst >= 4.5, `${name}: muted text ${vars["ink-faint"]} is ${worst.toFixed(2)}:1 on its backgrounds`);
  if (vars["accent-text"]) assert(Math.min(...bgs.map((b) => ratio(vars["accent-text"], b))) >= 4.5, `${name}: accent text is readable too`);
}
assert(checked >= 12, `all ${checked} palette blocks were checked (6 palettes, light and dark)`);

// ---- spoken names that contain the visible text (WCAG 2.5.3) ----
console.log("\nButtons whose spoken name contains their visible text");
for (const id of ["zoom-out", "zoom-reset", "zoom-in", "hebrew-zoom-out", "hebrew-zoom-reset", "hebrew-zoom-in"]) {
  const b = document.getElementById(id);
  const visible = b.textContent.trim();
  assert(!!b && b.getAttribute("aria-label").includes(visible), `#${id}: "${b.getAttribute("aria-label")}" contains "${visible}"`);
}
navigateTo(document, "consonant-flashcards");
await wait(300);
const card = content.querySelector(".flashcard-interactive");
assert(!card || !card.hasAttribute("aria-label"), "a flashcard is named by what is on it, not by a different label");

// ---- the new Reading controls ----
console.log("\nReading");
navigateTo(document, "bible-reading");
await wait(700);
const passageBtns = [...content.querySelectorAll(".reading-passages .choice-btn")];
assert(passageBtns.every((b) => b.hasAttribute("aria-pressed")), "each passage button says whether it is chosen");
assert(passageBtns.some((b) => /You know about \d+ percent/.test(b.getAttribute("aria-label") || "")), "and its name includes how much of it you know, in words");
const divBox = [...document.querySelectorAll("#sidebar-extra input[type=checkbox]")].find((c) => /accent divisions/.test(c.parentElement.textContent));
divBox.checked = true;
divBox.dispatchEvent(new win.Event("change", { bubbles: true }));
await wait(100);
assert(!!content.querySelector(".reading-divisions") && /Main division/.test(content.querySelector(".reading-divisions").textContent), "accent divisions are also stated in words under the verse");
assert([...content.querySelectorAll(".accent-pause")].every((n) => n.title && n.dataset.accentLabel), "each marked word has a title and a strength");
click([...content.querySelectorAll(".reading-verse button")].find((b) => b.textContent === "Show English"));
await wait(80);
const groups = [...content.querySelectorAll(".reading-selfcheck-buttons")];
assert(groups.length > 0 && groups.every((g) => g.getAttribute("role") === "group" && /Did you know the word/.test(g.getAttribute("aria-label"))), "each Got it / Missed it pair is a labelled group");
assert([...content.querySelectorAll(".reading-selfcheck-buttons button")].every((b) => b.hasAttribute("aria-pressed")), "and each button reports whether it is chosen");
assert(!!content.querySelector(".reading-selfcheck-summary[role=status]") && !!content.querySelector(".reading-selfcheck-msg[role=status]"), "results are announced");
const offline = content.querySelector(".reading-offline-status");
assert(offline && offline.getAttribute("role") === "status", "the offline save progress is announced");

// ---- other new controls ----
console.log("\nOther new controls");
navigateTo(document, "progress");
await wait(150);
click([...content.querySelectorAll(".pm-tab")].find((t) => /Backup/.test(t.textContent)));
await wait(100);
assert(!!content.querySelector('label[for], label input') && content.querySelector("#backup-file").closest("label"), "the backup file chooser has a label");
assert(!!content.querySelector(".backup-status[role=status]"), "'backup downloaded' is announced");
navigateTo(document, "daily-challenge");
await wait(150);
assert(content.querySelector(".daily-calendar-grid") ? content.querySelector(".daily-calendar-grid").getAttribute("role") !== "grid" : true, "the month calendar is not declared a data grid");
assert([...content.querySelectorAll(".daily-calendar-cell:not(.daily-calendar-empty)")].every((c) => c.getAttribute("role") === "img" && c.getAttribute("aria-label")), "each day is read out as a sentence");
navigateTo(document, "bible-dagesh");
await wait(400);
click([...content.querySelectorAll(".bible-tabs .choice-btn")].find((b) => b.textContent.trim() === "Print"));
await wait(100);
for (const id of ["bp-passage-select", "bp-count-select"]) {
  assert(!!document.querySelector(`label[for="${id}"]`), `the ${id.replace("bp-", "").replace("-select", "")} drop-down has a label`);
}
assert(!!content.querySelector('fieldset.bp-fieldset legend'), "the answer-style choice is a fieldset with a legend");
const root = fs.readFileSync(new URL("../public/js/root-step.js", import.meta.url), "utf8");
assert(/aria-live/.test(root) && /for="\$\{id\}"/.test(root) && /aria-describedby/.test(root), "the root box has a label, help text and an announced result");

summary();
