import { setupApp, assert, summary, navigateTo, findButtonByText, click } from "./helpers.mjs";
import { recordItemResult, recordStreakActivity, getActivityLog } from "../public/js/srs.js";
import { recordAttempt } from "../public/js/history.js";
import { getLetterSet } from "../public/js/letter-sets.js";
import { getAreas, getAllAreaStats, totalDue, getWeakSpots } from "../public/js/home-data.js";
import {
  getAreaSplit,
  getAreaBreakdown,
  getItemMap,
  getGroupMastery,
  getAccuracyGroups,
  getQuizTrends,
  getReviewForecast,
  getActivityGrid,
  activityLevel,
  getOverview,
  getWeakList,
  strongestAndWeakest,
  modeLabel,
  GROUPINGS,
} from "../public/js/progress-data.js";

// My Progress: the numbers behind it (progress-data.js) and the tabbed page.

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const area = (id) => getAreas().find((a) => a.id === id);
const vowels = getLetterSet("vowels");
const consonants = getLetterSet("consonants");
const vk = (i) => vowels.rowKey(vowels.rows()[i]);
const ck = (i) => consonants.rowKey(consonants.rows()[i]);
const answer = (mode, key, n, correct) => {
  for (let i = 0; i < n; i++) recordItemResult(mode, key, correct);
};

console.log("\nBefore any practice");
{
  const o = getOverview();
  assert(o.streak === 0 && o.mastered === 0 && o.due === 0 && o.activeDays30 === 0, "overview numbers are all zero");
  assert(o.total === getAllAreaStats().reduce((n, { stats }) => n + stats.total, 0) && o.total > 2000, "total covers every area");
  for (const a of getAreas()) {
    const s = getAreaSplit(a);
    assert(s.mastered === 0 && s.learning === 0 && s.new === s.total && s.total > 0, `${a.id}: everything is new`);
  }
  assert(getQuizTrends().length === 0, "no quiz trends yet");
  const fc = getReviewForecast();
  assert(fc.days.length === 7 && fc.dueNow === 0 && fc.days.every((d) => d.count === 0), "an empty forecast");
  assert(fc.days[0].label === "Today" && fc.days[1].label === "Tomorrow", "forecast starts Today, Tomorrow");
  const g = getActivityGrid(26);
  assert(g.cells.length === 26 * 7 && g.activeDays === 0 && g.firstLogged === null, "an empty calendar of 26 weeks");
}

console.log("\nMastery: new / learning / mastered");
// Vowel 0 is mastered (right 5 times in a row climbs to the top box), 1 is learning,
// 2 is missed over and over (a weak spot).
answer("vowel-typing-names", vk(0), 6, true);
answer("vowel-typing-names", vk(1), 2, true);
answer("vowel-typing-names", vk(2), 1, true);
answer("vowel-typing-names", vk(2), 4, false);
answer("vowel-flashcards", vk(1), 1, true);
{
  const v = area("vowels");
  const s = getAreaSplit(v);
  assert(s.mastered === 1 && s.learning === 2 && s.new === s.total - 3, `vowels split ${JSON.stringify(s)}`);
  const home = getAllAreaStats().find((x) => x.area.id === "vowels").stats;
  assert(home.mastered === s.mastered && home.tracked === s.mastered + s.learning, "agrees with the Home page's numbers");
  const { modes } = getAreaBreakdown(v);
  const labels = modes.map((m) => m.label);
  assert(labels.includes("Typing: Name → Vowel") && labels.includes("Flashcards"), "per-mode lines for the modes used");
  assert(!labels.some((l) => /Games/.test(l)), "modes never used are left out");
  const typing = modes.find((m) => m.mode === "vowel-typing-names");
  assert(typing.mastered === 1 && typing.learning === 2, "the Typing line counts its own items");

  const map = getItemMap(v);
  assert(map.length === v.pool().length, "one tile per vowel");
  assert(map[0].status === "mastered" && map[1].status === "learning" && map[3].status === "new", "tile statuses");
  assert(map[2].weak && !map[0].weak && !map[1].weak, "only the often-missed vowel is flagged weak");
  assert(map[2].seen === 5 && map[2].correct === 1, "tile carries its answer counts");
  assert(map[0].group === `Class ${vowels.rows()[0].Class}`, "vowel tiles are grouped by class");
  assert(getItemMap(area("accents"))[0].group.includes("Prose"), "accent tiles are grouped by type");
  assert(getItemMap(area("consonants"))[0].group === null, "consonant tiles have no group");
}

console.log("\nAccuracy by category");
{
  const v = area("vowels");
  const byClass = getAccuracyGroups(v, GROUPINGS.vowels[0]);
  const total = byClass.reduce((n, g) => n + g.seen, 0);
  assert(total === 6 + 2 + 5 + 1, `all answers are counted once (${total})`);
  const cls2 = `Class ${vowels.rows()[2].Class}`;
  const g2 = byClass.find((g) => g.label === cls2);
  assert(g2.seen >= 5 && g2.pct !== null, "a class with answers has a percent");
  assert(byClass.some((g) => g.pct === null), "a class never practised has no percent");
  const forced = [
    { label: "A", seen: 10, correct: 9, pct: 90 },
    { label: "B", seen: 10, correct: 5, pct: 50 },
    { label: "C", seen: 2, correct: 0, pct: 0 },
  ];
  const sw = strongestAndWeakest(forced);
  assert(sw.best.label === "A" && sw.worst.label === "B", "strongest/weakest ignore categories with too few answers");
  assert(strongestAndWeakest([forced[0]]) === null, "one category is not enough to compare");
  const verbs = area("verbs");
  assert(GROUPINGS.verbs.map((g) => g.id).join() === "binyan,mode,person,verb", "verbs group by binyan, form, person and verb");
  const people = getGroupMastery(verbs, GROUPINGS.verbs[2]).map((g) => g.label);
  assert(people.join("|") === "1st person|2nd person|3rd person|No person (participles, infinitives)", `person order: ${people}`);
  const lessons = getGroupMastery(area("vocabulary"), GROUPINGS.vocabulary[0]);
  assert(lessons.length >= 10 && lessons.every((g) => g.total > 0), "vocabulary has a group per lesson");
  assert(lessons.reduce((n, g) => n + g.total, 0) === area("vocabulary").pool().length, "lesson groups add up to every word");
  const cats = getGroupMastery(area("consonants"), GROUPINGS.consonants[0]).map((g) => g.label);
  assert(cats.includes("Guttural") && cats.includes("Matres Lectionis") && !cats.some((c) => c.includes(",")), "a consonant in two categories counts in each");
}

console.log("\nWeak spots");
{
  const all = getWeakList();
  assert(all.length === getWeakSpots(Infinity).length && all.length >= 1, "the full weak list");
  assert(all[0].key === vk(2) && all[0].areaId === "vowels", "the often-missed vowel is on it");
  assert(getWeakList("consonants").length === 0 && getWeakList("vowels").length === all.filter((w) => w.areaId === "vowels").length, "filter by area");
}

console.log("\nQuiz trends");
for (const p of [50, 60, 70, 90, 95]) recordAttempt("vowel-typing", { score: p / 10, total: 10, percent: p, datasets: ["Vowels"] });
{
  const t = getQuizTrends();
  assert(t.length === 1 && t[0].mode === "vowel-typing" && t[0].label === "Vowels Typing", "one quiz has been taken");
  assert(t[0].attempts.join() === "50,60,70,90,95", "attempts run oldest to newest");
  assert(t[0].best === 95 && t[0].latest === 95 && t[0].average === 73, "best, latest, average");
  assert(t[0].trend === "up", "an improving quiz is marked up");
}

console.log("\nReview forecast");
{
  const f = getReviewForecast();
  // Vowel 2 was missed last → due now (box 1). Vowel 1 climbed to box 3 (3 days), so it is not due now.
  assert(f.dueNow >= 1, `something is due right now (${f.dueNow})`);
  assert(f.dueNow === totalDue(getAllAreaStats()), "due now matches the Home page's due count");
  assert(f.days[0].count >= f.dueNow, "today's bar includes everything overdue");
  assert(f.days.reduce((n, d) => n + d.count, 0) + f.later === f.days[0].count + f.days.slice(1).reduce((n, d) => n + d.count, 0) + f.later, "bars and 'later' hold the rest");
  const withDays = f.days.slice(1).some((d) => d.count > 0) || f.later > 0;
  assert(withDays, "items scheduled for later days show up in later bars");
}

console.log("\nActivity calendar");
{
  recordStreakActivity();
  recordStreakActivity();
  const log = getActivityLog();
  const today = Object.keys(log)[0];
  assert(Object.keys(log).length === 1 && log[today] === 2, "each answer is tallied for the day");
  const g = getActivityGrid(26);
  const cell = g.cells.find((c) => c.date === today);
  assert(cell && cell.count === 2 && !cell.future, "today's square has the count");
  assert(g.activeDays === 1 && g.answers === 2 && g.firstLogged === today, "calendar totals");
  assert(g.cells.filter((c) => c.future).length < 7, "only the rest of this week is in the future");
  assert(g.months.length >= 5 && g.months.length <= 7 && g.months.every((m, i) => i === 0 || m.col - g.months[i - 1].col >= 3), "month labels for 26 weeks, none crowded together");
  assert(activityLevel(0, 15) === 0 && activityLevel(1, 15) === 1 && activityLevel(4, 15) === 2 && activityLevel(8, 15) === 3 && activityLevel(15, 15) === 4, "five shades relative to the goal");
  const o = getOverview();
  assert(o.activeDays30 === 1 && o.answers7 === 2 && o.today.count === 2, "overview picks up the activity");
  assert(o.streak === 1, "and the streak");
}
assert(modeLabel(area("accents"), "accent-typing-form") === "Typing: Accent → Name", "mode labels read naturally");
assert(modeLabel(area("vocabulary"), "vocab-games-english") === "Games: English → Hebrew", "...for vocabulary too");

// ---------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------
const tabs = () => [...content.querySelectorAll(".pm-tab")];
const tab = (name) => tabs().find((t) => t.textContent.trim() === name);
const panel = () => content.querySelector("#pm-panel");
const pill = (id) => content.querySelector(`[data-pill="${id}"]`);

console.log("\nThe page");
navigateTo(document, "home");
await wait();
navigateTo(document, "progress");
await wait(120);
assert(content.querySelector(".page-title").textContent === "My Progress", "title");
assert(tabs().map((t) => t.textContent.trim()).join() === "Overview,Mastery,Strengths,Quizzes,Bible in Context,Achievements", "six tabs");
assert(tab("Overview").getAttribute("aria-selected") === "true" && panel().getAttribute("aria-labelledby") === "pm-tab-overview", "opens on Overview");
assert(!/stored in your browser only/i.test(content.textContent), "no stale 'browser only' note");
assert(!document.querySelector('.nav-btn[data-page="achievements"]'), "Achievements has no sidebar button of its own");

console.log("\nOverview tab");
{
  const t = panel().textContent;
  assert(content.querySelectorAll(".pm-stat").length === 4, "four headline numbers");
  assert(content.querySelectorAll(".pm-area-row").length === 6, "a mastery bar for each of the five areas and Bible in Context");
  assert(/1 of 16 mastered/.test(content.querySelector('[data-area="vowels"]').textContent), "the Vowels bar says 1 of 16 mastered");
  assert(!!content.querySelector(".pm-chart") && /Reviews coming up/.test(t), "the review forecast chart");
  assert(!!content.querySelector(".pm-heatmap") && content.querySelectorAll(".pm-heatmap rect").length >= 26 * 7 - 6, "the calendar draws a square per day");
  assert(/Recorded from/.test(t), "the calendar says when recording began");
  click(content.querySelector('[data-open-mastery="vowels"]'));
  await wait();
  assert(tab("Mastery").getAttribute("aria-selected") === "true", "Details opens the Mastery tab...");
  assert(pill("area-vowels").getAttribute("aria-pressed") === "true", "...on that area");
}

console.log("\nMastery tab");
{
  assert(content.querySelectorAll(".pm-tile").length === 16, "a tile for every vowel");
  assert(content.querySelectorAll(".pm-tile-group").length === 5, "grouped under five classes");
  assert(content.querySelectorAll(".pm-tile-mastered").length >= 1 && content.querySelector(".pm-tile-weak"), "mastered and often-missed tiles are marked");
  assert(!!content.querySelector(".pm-tile[lang], .pm-tile [lang='he']"), "tile forms are wrapped as Hebrew");
  const t0 = content.querySelectorAll(".pm-tile")[0];
  click(t0);
  assert(t0.getAttribute("aria-pressed") === "true" && /Mastered/.test(content.querySelector(".pm-tile-detail").textContent), "selecting a tile shows its detail");
  assert(/right 6 of 6/.test(content.querySelector(".pm-tile-detail").textContent), "...with its answer counts");
  click(pill("area-vocabulary"));
  await wait();
  assert(document.activeElement === pill("area-vocabulary"), "focus stays on the pill after switching area");
  assert(content.querySelectorAll(".pm-group-row").length >= 10 && !content.querySelector(".pm-tile"), "Vocabulary shows mastery by lesson, not tiles");
  click(pill("group-1"));
  await wait();
  assert(/part of speech/i.test(panel().textContent) && content.querySelectorAll(".pm-group-row").length >= 10, "...and can switch to part of speech");
  click(pill("area-verbs"));
  await wait();
  assert(/By binyan/.test(panel().textContent) && /By verb\b/.test(panel().textContent), "Verbs offer binyan, form, person and verb");
  click(pill("area-accents"));
  await wait();
  assert(content.querySelectorAll(".pm-tile").length === 51 && content.querySelectorAll(".pm-tile-group").length === 4, "51 accent tiles in 4 types");
}

console.log("\nStrengths tab");
{
  click(tab("Strengths"));
  await wait();
  assert(/Weak spots/.test(panel().textContent) && /Accuracy by category/.test(panel().textContent), "weak spots and accuracy sections");
  assert(content.querySelectorAll(".pm-weak-list li").length >= 1, "the weak list has an entry");
  assert(pill("weak-all").textContent.includes("All (") && /Vowels \(\d+\)/.test(pill("weak-vowels").textContent), "filter pills show counts");
  click(pill("weak-consonants"));
  await wait();
  assert(/No weak spots in this area/.test(panel().textContent) && !findButtonByText(content, "Drill the worst 1"), "an area with none says so and has no drill");
  click(pill("weak-vowels"));
  await wait();
  assert(content.querySelectorAll(".pm-weak-list li").length >= 1 && !!content.querySelector("[data-drill]"), "filtering to Vowels shows them with a drill button");
  assert(content.querySelectorAll(".pm-acc-row").length === 9, "accuracy rows for the one area with answers (5 classes + 4 lengths)");
  assert(content.querySelector(".pm-acc-faint"), "categories with too few answers are greyed");
  assert(/No answers recorded yet/.test(panel().textContent), "areas with no answers say so");
  click(content.querySelector("[data-drill]"));
  await wait(120);
  assert(content.querySelector(".page-title").textContent === "Weak-Spot Drill", "Drill opens the weak-spot drill on the Daily Challenge page");
}

console.log("\nQuizzes tab");
{
  navigateTo(document, "progress");
  await wait(120);
  click(tab("Quizzes"));
  await wait();
  assert(content.querySelectorAll(".pm-quiz").length === 1, "one chart for the one quiz taken");
  assert(content.querySelectorAll(".pm-quiz .pm-dot").length === 5 && !!content.querySelector(".pm-quiz .pm-line"), "five points joined by a line");
  assert(/Improving/.test(panel().textContent) && /Best 95%/.test(panel().textContent) && /Average 73%/.test(panel().textContent), "trend, best and average");
  assert(!!content.querySelector(".pm-quiz .history-panel"), "recent attempts are there (inside a fold-out)");
  click(findButtonByText(content, "Clear history"));
  await wait();
  assert(/No quiz attempts recorded yet/.test(panel().textContent), "clearing history empties the tab");
}

console.log("\nAchievements tab");
{
  click(tab("Achievements"));
  await wait();
  assert(content.querySelectorAll(".achievement-card").length >= 20, "the achievement cards are inside the tab");
  assert(/\d+ \/ \d+ unlocked/.test(panel().textContent), "with the unlocked count");
  assert(content.querySelectorAll(".page-title").length === 1, "still one page title");
  navigateTo(document, "home");
  await wait();
  document.defaultView.location.hash = "#achievements";
  await wait(120);
  assert(tab("Achievements").getAttribute("aria-selected") === "true", "the old #achievements address opens this tab");
  assert(document.querySelector(".nav-btn.active")?.dataset.page === "progress", "and lights up My Progress");
}

console.log("\nTabs by keyboard");
{
  const t = tab("Achievements");
  t.focus();
  t.dispatchEvent(new document.defaultView.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await wait();
  assert(tab("Overview").getAttribute("aria-selected") === "true" && document.activeElement === tab("Overview"), "ArrowRight wraps to the first tab and keeps focus");
  assert(tab("Overview").tabIndex === 0 && tab("Quizzes").tabIndex === -1, "only the open tab is in the tab order");
}

console.log("\nHome page");
{
  navigateTo(document, "home");
  await wait(120);
  const home = document.getElementById("home-page");
  assert(!home.querySelector(".mode-cards"), "the three shortcut cards are gone from the bottom of Home");
  for (const label of ["My Progress", "Achievements", "Word Lookup"]) assert(!findButtonByText(home, label), `no ${label} card button on Home`);
  assert(!!document.querySelector('.nav-btn[data-page="progress"]') && !!document.querySelector('.nav-btn[data-page="search"]'), "My Progress and Word Lookup are still in the sidebar");
  assert(!!home.querySelector(".verse") && !!home.querySelector(".feedback-line"), "the verse and feedback line remain");
  click(home.querySelector('[data-progress-tab="strengths"]'));
  await wait(120);
  assert(tab("Strengths").getAttribute("aria-selected") === "true", "'See all weak spots' opens My Progress on Strengths");
}

summary();
