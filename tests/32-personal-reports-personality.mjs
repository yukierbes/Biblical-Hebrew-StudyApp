import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";
import { cleanName, getDisplayName, setDisplayName, getCelebrationStyle, setCelebrationStyle, CELEBRATION_STYLES } from "../public/js/profile.js";
import {
  isStarred, toggleStar, getNote, setNote, getCounts, getListMode, setListMode, applyPersonalFilter, emptyListMessage, MAX_NOTE_LENGTH,
} from "../public/js/personal.js";
import { homeMessage, resultMessage, celebrationForPercent, streakMilestoneMessage, STREAK_MILESTONES } from "../public/js/encourage.js";
import { sanitizeReport, isAdmin, checkReportLimit, MAX_REPORTS_PER_DAY, MAX_REPORTS_TOTAL } from "../netlify/functions/report-logic.js";
import { groupReports, reportsToCsv, queuedReportCount, flushReportQueue } from "../public/js/reports.js";
import { recordStreakActivity, setDailyGoal } from "../public/js/srs.js";

// Mistake reports, personal lists and notes, the display name, encouragement,
// and celebrations.

const { document, window } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const goto = async (page) => {
  navigateTo(document, page);
  await wait(150);
};

// ---------------------------------------------------------------- profile
console.log("\nProfile: display name and celebration style");
assert(cleanName("  Dana   <b>Levi</b> ") === "Dana bLevi/b", "angle brackets and extra spaces are stripped from a name");
assert(cleanName("x".repeat(80)).length === 30, "a name is capped at 30 characters");
assert(getDisplayName() === "", "no name to begin with");
setDisplayName("Dana");
assert(getDisplayName() === "Dana", "a saved name is returned");
setDisplayName("   ");
assert(getDisplayName() === "", "saving an empty name clears it");
assert(getCelebrationStyle() === "sparkle", "the default celebration is the gentle sparkle");
setCelebrationStyle("confetti");
assert(getCelebrationStyle() === "confetti", "a chosen style is kept");
setCelebrationStyle("nonsense");
assert(getCelebrationStyle() === "sparkle", "an unknown style falls back to the default");
assert(
  CELEBRATION_STYLES.map((s) => s.id).join() === "sparkle,confetti,chime,off",
  "styles offered: sparkle, confetti, chime, quiet"
);
assert(localStorage.getItem("hebrewVerbApp:profile") !== null, "the profile is saved under the synced hebrewVerbApp: prefix");

// ---------------------------------------------------------------- personal lists
console.log("\nPersonal lists and notes");
assert(isStarred("vocab", "k1") === false, "nothing is starred at first");
assert(toggleStar("vocab", "k1") === true && isStarred("vocab", "k1"), "starring an item");
assert(toggleStar("vocab", "k1") === false && !isStarred("vocab", "k1"), "starring again removes it");
setNote("vocab", "k2", "  looks like a house  ");
assert(getNote("vocab", "k2") === "looks like a house", "a note is saved and trimmed");
assert(setNote("vocab", "k3", "y".repeat(900)).length === MAX_NOTE_LENGTH, "a note is capped in length");
setNote("vocab", "k3", "");
assert(getNote("vocab", "k3") === "", "an emptied note is removed");
toggleStar("vocab", "k1");
const counts = getCounts("vocab");
assert(counts.starred === 1 && counts.noted === 1, "counts: one starred, one with a note");
assert(isStarred("consonants", "k1") === false, "areas are kept separate");
assert(localStorage.getItem("hebrewVerbApp:personal:vocab") !== null, "each area is saved under the synced prefix");

const rows = [{ id: "k1" }, { id: "k2" }, { id: "k9" }];
const keyOf = (r) => r.id;
assert(applyPersonalFilter("vocab", rows, keyOf).length === 3, "Everything: nothing is filtered");
setListMode("vocab", "starred");
assert(applyPersonalFilter("vocab", rows, keyOf).map(keyOf).join() === "k1", "Starred keeps only starred items");
setListMode("vocab", "noted");
assert(applyPersonalFilter("vocab", rows, keyOf).map(keyOf).join() === "k2", "With my note keeps only noted items");
assert(emptyListMessage("vocab").includes("memory trick"), "an empty noted list explains itself");
assert(localStorage.getItem("hebrewVerbApp:personalMode") !== null, "the list choice is saved under the synced prefix, so it follows the student between devices");
setListMode("vocab", "all");
assert(getListMode("vocab") === "all" && localStorage.getItem("hebrewVerbApp:personalMode") === null, "back to Everything clears the saved choice");

// Clear the stand-in items used above, so the next checks start from an empty list.
toggleStar("vocab", "k1");
setNote("vocab", "k2", "");
assert(getCounts("vocab").starred === 0 && getCounts("vocab").noted === 0, "the list is empty again");

// The shared filter functions feed every page.
await goto("vocabulary");
const firstRowsKeys = [...content.querySelectorAll("table.custom-table tbody tr")].length;
assert(firstRowsKeys > 100, "the vocabulary table lists the words");
assert(content.querySelector("th.tray-col") && content.querySelector("td.tray-col .item-star"), "every word row has the star, note and report buttons");
assert(content.querySelector("th.note-col"), "there is a My note column");

// Star the first word through the table's own button, then filter to Starred.
const firstStar = content.querySelector("td.tray-col .item-star");
click(firstStar);
assert(firstStar.classList.contains("is-on") && firstStar.textContent === "★", "clicking ☆ in a table row stars the word");
assert(getCounts("vocab").starred === 1, "and it is saved to the list");
const starredRow = content.querySelector("table.custom-table tbody tr");
const sidebar = document.getElementById("sidebar-extra");
click(sidebar.querySelector('[data-list-mode="starred"]'));
await wait(150);
const filteredRows = content.querySelectorAll("table.custom-table tbody tr");
assert(filteredRows.length === 1, "the My list > Starred filter narrows the review table to the one starred word");
assert(sidebar.querySelector('[data-list-mode="starred"]').classList.contains("selected"), "the chosen My list option is highlighted");

// It also feeds flashcards.
await goto("vocab-flashcards");
assert(/\(of 1\)/.test(content.textContent), "Flashcards study only the starred list (a pool of one)");
assert(content.querySelector(".item-tray .item-star"), "the flashcard has the star / note / report tray");
assert(content.querySelector(".item-tray .item-report"), "…including the report button");

// A note, written through the dialog.
click(content.querySelector(".item-tray .item-notebtn"));
await wait();
const dialog = document.querySelector(".item-dialog");
assert(dialog && dialog.textContent.includes("My note"), "the note button opens the note dialog");
dialog.querySelector("textarea").value = "like a tent peg";
click(findButtonByText(dialog, "Save"));
await wait();
assert(!document.querySelector(".item-dialog"), "saving closes the dialog");
assert(getCounts("vocab").noted === 1, "the note is saved to the list");
assert(content.querySelector(".item-note-line").hidden, "…and stays hidden on the front of the card, so it can't give the answer away");

// Reset Filters also resets My list.
click(findButtonByText(sidebar, "Reset Filters"));
await wait(150);
assert(getListMode("vocab") === "all", "Reset Filters puts My list back to Everything");

// ---------------------------------------------------------------- reports
console.log("\nReport a mistake");
let captured = null;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes("/.netlify/functions/report") && opts && opts.method === "POST") {
    captured = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true }) };
  }
  return realFetch(url, opts);
};
await goto("vocab-flashcards");
click(content.querySelector(".item-tray .item-report"));
await wait();
const rd = document.querySelector(".item-dialog");
assert(rd && rd.textContent.includes("Report a mistake"), "the ⚑ button opens the report dialog");
click(findButtonByText(rd, "Send report"));
await wait();
assert(rd.querySelector(".item-dialog-error").textContent.includes("choose"), "sending with no reason chosen asks for one");
const radios = rd.querySelectorAll('input[type="radio"]');
assert(radios.length >= 3, "the dialog offers the reasons for this kind of item");
radios[1].checked = true;
rd.querySelector("textarea").value = "should be plural";
click(findButtonByText(rd, "Send report"));
await wait(150);
assert(captured && captured.area === "vocab" && captured.reason === radios[1].value && captured.note === "should be plural", "the report is sent with the area, reason and note");
assert(captured && captured.itemKey && captured.itemLabel, "…and names the item");
assert(!document.querySelector(".item-dialog"), "the dialog closes after sending");

// Offline: the report waits in a queue and goes out later.
global.fetch = async () => {
  throw new Error("offline");
};
click(content.querySelector(".item-tray .item-report"));
await wait();
const rd2 = document.querySelector(".item-dialog");
rd2.querySelector('input[type="radio"]').checked = true;
click(findButtonByText(rd2, "Send report"));
await wait(150);
assert(queuedReportCount() === 1, "a report that can't be sent is kept in a queue");
captured = null;
global.fetch = async (url, opts) => {
  captured = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ ok: true }) };
};
assert((await flushReportQueue()) === 1 && queuedReportCount() === 0 && captured, "the queue is sent when the connection returns");
// A report over the limit is final, not queued forever.
global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: "daily limit" }) });
click(content.querySelector(".item-tray .item-report"));
await wait();
const rd3 = document.querySelector(".item-dialog");
rd3.querySelector('input[type="radio"]').checked = true;
click(findButtonByText(rd3, "Send report"));
await wait(150);
assert(queuedReportCount() === 0, "a report refused for being over the limit is not queued");
assert(rd3.querySelector(".item-dialog-error").textContent === "daily limit", "the student sees the server's message");
click(findButtonByText(rd3, "Cancel"));
global.fetch = realFetch;

// Server-side rules (pure logic)
assert(sanitizeReport({ area: "nope", itemKey: "x" }).error, "an unknown area is refused");
assert(sanitizeReport({ area: "vocab", itemKey: "" }).error, "a report with no item is refused");
const clean = sanitizeReport({ area: "vocab", itemKey: "k", note: "n".repeat(2000), extra: "x" }).report;
assert(clean.note.length === 600 && !("extra" in clean), "notes are capped and unknown fields are dropped");
assert(isAdmin({ email: "Me@x.com" }, { Owner_Email: "me@x.com" }), "the owner is recognised however OWNER_EMAIL is capitalised, and email case doesn't matter");
assert(!isAdmin({ email: "student@x.com" }, { OWNER_EMAIL: "me@x.com" }), "a student is not the owner");
assert(!isAdmin({ email: "me@x.com" }, {}), "with OWNER_EMAIL unset, nobody is the owner");
assert(isAdmin({ email: "a@b.c", app_metadata: { roles: ["Admin"] } }, {}), "the Identity role 'admin' also counts, in any capitalisation");
let counter = null;
let accepted = 0;
for (let i = 0; i < 15; i++) {
  const r = checkReportLimit(counter, "item" + i, "2026-10-17");
  if (r.ok) {
    accepted++;
    counter = r.counter;
  }
}
assert(accepted === MAX_REPORTS_PER_DAY, `a student can send ${MAX_REPORTS_PER_DAY} reports a day`);
assert(!checkReportLimit(counter, "item0", "2026-10-18").ok === false, "the next day they can report again");
assert(checkReportLimit(counter, "item0", "2026-10-17").error.includes("already"), "the same item can't be reported twice in a day");
let total = { day: "2026-10-20", today: 0, total: MAX_REPORTS_TOTAL, recent: [] };
assert(!checkReportLimit(total, "z", "2026-10-20").ok, "there is a lifetime cap too");

const grouped = groupReports([
  { id: "1", area: "vocab", itemKey: "a", itemLabel: "A", status: "open", createdAt: 1 },
  { id: "2", area: "vocab", itemKey: "a", itemLabel: "A", status: "open", createdAt: 2 },
  { id: "3", area: "vocab", itemKey: "b", itemLabel: "B", status: "fixed", createdAt: 3 },
]);
assert(grouped.length === 2 && grouped[0].itemKey === "a" && grouped[0].openCount === 2, "the owner page groups reports by item, most open reports first");
assert(reportsToCsv([{ area: "vocab", itemLabel: 'say "hi"', reason: "r", note: "", reporter: "s@x", createdAt: 0, status: "open" }]).includes('"say ""hi"""'), "CSV export escapes quotes");

// The owner link stays hidden for students
await wait();
assert(document.getElementById("nav-reports").hidden === true, "the Mistake Reports link is hidden for a student");

// ---------------------------------------------------------------- the other study areas
console.log("\nTray on the other screens");
for (const [page, label] of [
  ["consonant-flashcards", "consonant flashcards"],
  ["accent-flashcards", "accent flashcards"],
  ["verb-flashcards", "verb flashcards"],
]) {
  await goto(page);
  assert(content.querySelector(".item-tray .item-star") && content.querySelector(".item-tray .item-report"), `${label} have the tray`);
}
await goto("consonant-review");
assert(content.querySelector("td.tray-col .item-report"), "the consonant table has the tray column");
await goto("accent-review");
assert(content.querySelector("td.tray-col .item-report"), "the accent table has the tray column");
await goto("review");
assert(content.querySelector("td.tray-col .item-report") || content.querySelector(".verb-tables-tray"), "the verb review has trays");

// Verb root stars filter the verb pages
toggleStar("verbs", "Strong Verb (קטל)");
setListMode("verbs", "starred");
await goto("verb-flashcards");
assert(/Strong/.test(document.getElementById("sidebar-extra").textContent) || content.querySelector(".item-tray"), "verb flashcards still work with only the starred roots");
setListMode("verbs", "all");

// ---------------------------------------------------------------- encouragement
console.log("\nEncouragement");
assert(/welcome/i.test(homeMessage({ isNew: true }).text) && homeMessage({ isNew: true }).tone === "welcome", "a brand-new student is welcomed");
assert(/welcome back/i.test(homeMessage({ daysAway: 5, streak: 0 }).text), "a student back after days away is welcomed back");
const met = homeMessage({ practisedToday: true, count: 15, goal: 15, streak: 4 });
assert(met.tone === "cheer" && /4 days/.test(met.text), "goal met today: cheers and names the streak");
const struggling = homeMessage({ recentAvg: 45, count: 0, goal: 15 });
assert(struggling.tone === "gentle" && /mistakes/i.test(struggling.text) && /Weak spots/.test(struggling.text), "a struggling student gets reassurance and a next step");
assert(/streak/i.test(homeMessage({ atRisk: true, streak: 6, count: 0, goal: 15 }).text), "a streak at risk is mentioned");
assert(/5 more answers/.test(homeMessage({ practisedToday: true, count: 10, goal: 15 }).text), "partway to the goal: how many are left");
assert(/92%/.test(homeMessage({ recentAvg: 92, count: 0, goal: 15, trend: "up" }).text), "a strong student hears what is working");
assert(/12 items are/.test(homeMessage({ due: 12, count: 0, goal: 15 }).text), "otherwise: how many items are due");
assert(resultMessage(100).text.includes("Perfect") && resultMessage(95).tone === "cheer", "top scores are cheered");
assert(resultMessage(30).tone === "gentle" && /mistakes|miss/i.test(resultMessage(30).text), "low scores are met kindly");
assert(celebrationForPercent(100) === "perfect" && celebrationForPercent(85) === "quiz" && celebrationForPercent(60) === null, "only strong results are celebrated");
assert(STREAK_MILESTONES.includes(7) && streakMilestoneMessage(30).includes("30"), "streak milestones have their own message");

// ---------------------------------------------------------------- Home and Settings
console.log("\nHome greeting and settings");
setDisplayName("");
await goto("progress");
await goto("home");
assert(content.querySelector(".home-greeting-hello").textContent === "Shalom.", "Home says just 'Shalom.' with no name");
assert(content.querySelector("#home-name-form"), "Home gently asks for a name");
content.querySelector("#home-name-input").value = "Dana";
content.querySelector("#home-name-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await wait();
assert(content.querySelector(".home-greeting-hello").textContent === "Shalom, Dana.", "after saving a name, Home says 'Shalom, Dana.'");
assert(!content.querySelector("#home-name-form"), "the name prompt goes away");
assert(content.querySelector("#home-encourage").textContent.length > 10, "there is an encouragement line under the greeting");
assert(content.querySelector(".page-title").textContent === "Biblical Hebrew Study App", "the page title is unchanged");

await goto("progress");
const settingsTab = [...content.querySelectorAll(".pm-tab")].find((t) => /Settings/.test(t.textContent)); // the Settings box is on the Backup & Settings tab
if (settingsTab) click(settingsTab);
await wait();
const nameInput = content.querySelector("#pm-name");
assert(nameInput && nameInput.value === "Dana", "Settings shows the display name");
nameInput.value = "Dani";
nameInput.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(getDisplayName() === "Dani", "changing the name saves it");
const styleBtns = [...content.querySelectorAll("#pm-celebrate [data-style]")];
assert(styleBtns.map((b) => b.dataset.style).join() === "sparkle,confetti,chime,off", "Settings offers the four celebration styles");
click(styleBtns.find((b) => b.dataset.style === "confetti"));
await wait();
assert(getCelebrationStyle() === "confetti", "choosing a style saves it");
assert(document.querySelectorAll("#celebrate-layer .celebrate-confetti").length > 10, "choosing a style shows it straight away");

// ---------------------------------------------------------------- celebrations
console.log("\nCelebrations");
const { celebrate, resetCelebrationCooldown } = await import("../public/js/celebrate.js");
document.getElementById("celebrate-layer")?.remove();
resetCelebrationCooldown();
setCelebrationStyle("sparkle");
assert(celebrate("goal") === "sparkle" && document.querySelector("#celebrate-layer .celebrate-glow") && document.querySelectorAll(".celebrate-star").length > 5, "sparkle: a glow and twinkling stars");
assert(celebrate("goal") === null, "a second celebration right away is skipped");
resetCelebrationCooldown();
setCelebrationStyle("off");
const before = document.getElementById("celebrate-layer").children.length;
assert(celebrate("goal", { force: true }) === null && document.getElementById("celebrate-layer").children.length === before, "Quiet: nothing is shown");
setCelebrationStyle("chime");
let threw = false;
try {
  celebrate("quiz", { force: true });
} catch (e) {
  threw = true;
}
assert(!threw, "chime never errors, even where the browser has no audio");
assert(document.getElementById("celebrate-layer").getAttribute("aria-hidden") === "true", "the celebration layer is hidden from screen readers");

// The daily goal fires a celebration and a toast on the answer that reaches it.
resetCelebrationCooldown();
setCelebrationStyle("sparkle");
document.getElementById("celebrate-layer")?.remove();
setDailyGoal(2);
recordStreakActivity();
assert(!document.getElementById("celebrate-layer"), "no celebration before the goal is reached");
recordStreakActivity();
assert(document.querySelector("#celebrate-layer .celebrate-glow"), "reaching the daily goal celebrates");
assert(/goal/i.test(document.body.textContent), "…and says so");

// ---------------------------------------------------------------- the owner's page
console.log("\nOwner page: Mistake Reports");
const posted = [];
let serverReports = [
  { id: "r-1", area: "vocab", itemKey: "L1||אֶל||unto", itemLabel: "אֶל — unto", reason: "The English meaning is wrong", note: "should be 'to'", reporter: "s1@x.com", createdAt: 2, status: "open" },
  { id: "r-2", area: "vocab", itemKey: "L1||אֶל||unto", itemLabel: "אֶל — unto", reason: "Something else", note: "", reporter: "s2@x.com", createdAt: 3, status: "open" },
  { id: "r-3", area: "accents", itemKey: "a", itemLabel: "Zaqef", reason: "The name is wrong", note: "", reporter: "s3@x.com", createdAt: 1, status: "fixed" },
];
global.fetch = async (url, opts) => {
  if (String(url).includes("/.netlify/functions/report")) {
    if (opts && opts.method === "POST") {
      const body = JSON.parse(opts.body);
      posted.push(body);
      if (body.action === "status") serverReports.find((r) => r.id === body.id).status = body.status;
      if (body.action === "delete") serverReports = serverReports.filter((r) => r.id !== body.id);
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ reports: serverReports }) };
  }
  return realFetch(url, opts);
};
await goto("reports");
await wait(200);
assert(content.querySelector(".page-title").textContent === "Mistake Reports", "the owner page opens");
assert(content.querySelectorAll(".rep-group").length === 1, "open reports are grouped by item: two reports on one word make one group");
assert(content.textContent.includes("2 reports, 2 open") && content.textContent.includes("data-source/vocabulary.csv"), "the group shows its count and which file to fix");
click(findButtonByText(content, "Mark fixed"));
await wait(150);
assert(posted.length === 1 && posted[0].action === "status" && posted[0].status === "fixed", "Mark fixed tells the server");
assert(content.querySelectorAll(".rep-report").length === 1, "the fixed report leaves the Open list");
click(content.querySelector('[data-filter="all"]'));
await wait();
assert(content.querySelectorAll(".rep-report").length === 3, "All shows every report");
// Leaving the page must remove its click handler from the shared content area.
await goto("home");
const before2 = posted.length;
const stray = document.createElement("button");
stray.dataset.act = "delete";
content.appendChild(stray);
click(stray);
await wait();
assert(posted.length === before2, "after leaving, the page's click handler is gone (no stray requests)");
// A student (server says 403) just sees a message.
global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: "Only the owner can open the reports." }) });
await goto("reports");
await wait(150);
assert(content.textContent.includes("Only the owner"), "a student who opens the address sees only that it is for the owner");
global.fetch = realFetch;
await goto("home");

summary();
