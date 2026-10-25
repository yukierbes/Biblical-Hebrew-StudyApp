import { setDeepLink, consumeDeepLink } from "../deep-link.js";
import { wrapHebrewSpans } from "../helpers.js";
import { getAreas, getAllAreaStats } from "../home-data.js";
import { renderHistoryPanel } from "../history-ui.js";
import { getDailyGoal, setDailyGoal, resetAllProgress } from "../srs.js";
import { renderAchievementsInto } from "./achievements.js";
import { BIBLE_GROUPS, getAllBibleStats, getBibleSummary, PASS_PERCENT } from "../bible-areas.js";
import { timeAgo } from "../home-data.js";
import { createBackup, backupFileName, parseBackup, restoreBackup, collectProgress } from "../backup.js";
import { isConfidencePromptOn, setConfidencePromptOn } from "../confidence.js";
import { syncNow } from "../cloud-sync.js";
import {
  MIN_ANSWERS,
  GROUPINGS,
  getOverview,
  getAreaSplit,
  getAreaBreakdown,
  getItemMap,
  getItemStatusMap,
  getGroupMastery,
  getAccuracyGroups,
  strongestAndWeakest,
  getWeakList,
  getQuizTrends,
  getReviewForecast,
  getActivityGrid,
} from "../progress-data.js";
import { esc, stackedBar, stackLegend, accuracyRow, barChartSvg, lineChartSvg, heatmapSvg, heatLegend } from "../progress-charts.js";

import { getDisplayName, setDisplayName, getCelebrationStyle, setCelebrationStyle, CELEBRATION_STYLES, MAX_NAME_LENGTH } from "../profile.js";
import { celebrate } from "../celebrate.js";
// My Progress: how you are doing over time. (The Home page is for "what should I
// do now"; this page is for looking back.) Six tabs:
//   Overview      streak, mastery by area, reviews coming up, practice calendar
//   Mastery       one area at a time: a map of every item, or mastery by lesson/binyan
//   Strengths     weak spots (with a drill) and accuracy by category
//   Quizzes       quiz scores over time
//   Bible in Context   all 15 Bible pages: quiz scores, words mastered, what to do next
//   Achievements  badges and goals
// Every number comes from progress-data.js and home-data.js.

const TABS = [
  ["overview", "Overview"],
  ["mastery", "Mastery"],
  ["strengths", "Strengths"],
  ["quizzes", "Quizzes"],
  ["bible", "Bible in Context"],
  ["achievements", "Achievements"],
  ["backup", "Backup & settings"],
];

const WEAK_DRILL_SIZE = 15;
const WEAK_SHOWN = 12;
const DRILL_AREAS = ["consonants", "vowels", "vocabulary", "accents", "bible"];

// What was open last. Kept in memory so that moving between pages (or clicking a
// filter) doesn't snap you back to the first tab; a fresh app load starts on Overview.
let activeTab = "overview";
let masteryAreaId = "consonants";
let weakFilter = "all";
let weakShowAll = false;
const groupingIndex = {}; // area id -> which grouping is showing

/** Opens the page on a given tab (used by the Achievements shortcut and by links from Home). */
export function openTab(tab, extra = {}) {
  if (TABS.some(([id]) => id === tab)) activeTab = tab;
  if (extra.area && getAreas().some((a) => a.id === extra.area)) masteryAreaId = extra.area;
  if (extra.weakFilter) weakFilter = extra.weakFilter;
}

export function mount({ content, sidebarExtra, navigate }) {
  sidebarExtra.innerHTML = "";
  const link = consumeDeepLink();
  if (link && link.type === "progress-tab") openTab(link.tab, link);
  render(content, navigate);
}

export function unmount() {}

/** The old Achievements page address now opens this page on its Achievements tab. */
export const achievementsRoute = {
  mount(ctx) {
    openTab("achievements");
    mount(ctx);
  },
  unmount,
};

const plural = (n, one, many) => (n === 1 ? one : many);
const fmt = (n) => Number(n).toLocaleString();
const formatDate = (ymd) => new Date(ymd + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// ---------------------------------------------------------------------
// The page frame and tabs
// ---------------------------------------------------------------------

function render(content, navigate) {
  content.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.id = "progress-page";
  wrap.innerHTML = `
    <h1 class="page-title">My Progress</h1>
    <p class="caption pm-intro">How you're doing over time. Your progress is saved in this browser and synced to your account, so it follows you to your other devices.</p>
    <div class="pm-tabs" role="tablist" aria-label="Progress sections"></div>
    <div class="pm-panel" id="pm-panel" role="tabpanel"></div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  const tabsEl = wrap.querySelector(".pm-tabs");
  const panel = wrap.querySelector("#pm-panel");
  let pendingFocus = null;

  const ctx = {
    navigate,
    panel,
    /** Redraws the open tab; `focusId` is the control (data-pill) to put focus back on. */
    rerender(focusId = null) {
      pendingFocus = focusId;
      drawPanel();
    },
    openTab(tab, extra) {
      openTab(tab, extra);
      drawTabs();
      drawPanel();
    },
  };

  function drawTabs() {
    tabsEl.innerHTML = "";
    for (const [id, label] of TABS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pm-tab" + (id === activeTab ? " pm-tab-on" : "");
      b.id = `pm-tab-${id}`;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(id === activeTab));
      b.setAttribute("aria-controls", "pm-panel");
      b.tabIndex = id === activeTab ? 0 : -1;
      b.textContent = label;
      b.addEventListener("click", () => {
        activeTab = id;
        drawTabs();
        drawPanel();
      });
      b.addEventListener("keydown", (e) => {
        const i = TABS.findIndex(([t]) => t === id);
        let next = null;
        if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
        else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = TABS.length - 1;
        if (next === null) return;
        e.preventDefault();
        activeTab = TABS[next][0];
        drawTabs();
        drawPanel();
        tabsEl.querySelector(".pm-tab-on").focus();
      });
      tabsEl.appendChild(b);
    }
    panel.setAttribute("aria-labelledby", `pm-tab-${activeTab}`);
  }

  function drawPanel() {
    panel.innerHTML = "";
    RENDERERS[activeTab](panel, ctx);
    if (pendingFocus) {
      const el = panel.querySelector(`[data-pill="${pendingFocus}"]`);
      if (el) el.focus();
      pendingFocus = null;
    }
  }

  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => navigate("home"));
  wrap.appendChild(homeBtn);

  drawTabs();
  drawPanel();
}

/** A row of choice buttons ("pills"); the one matching `current` is on. */
function pillsHtml(prefix, options, current) {
  return `<div class="pm-pills" role="group">${options
    .map(
      ([id, label]) =>
        `<button type="button" class="pm-pill${id === current ? " pm-pill-on" : ""}" aria-pressed="${id === current}" data-pill="${prefix}-${id}">${esc(label)}</button>`
    )
    .join("")}</div>`;
}

/** Wires pills made by pillsHtml: calls onPick(id) for the clicked one. */
function wirePills(root, prefix, onPick) {
  root.querySelectorAll(`[data-pill^="${prefix}-"]`).forEach((btn) => {
    btn.addEventListener("click", () => onPick(btn.dataset.pill.slice(prefix.length + 1)));
  });
}

// ---------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------

function statCard(value, label, extra = "") {
  return `<div class="pm-stat"><div class="pm-stat-value">${value}</div><div class="pm-stat-label">${label}</div>${extra}</div>`;
}

function renderOverview(panel, ctx) {
  const o = getOverview();
  const grid = getActivityGrid(26);
  const fc = getReviewForecast();
  const goalPct = Math.min(100, Math.round((o.today.count / o.today.goal) * 100));

  const weekNote =
    o.answersPrev7 > 0 || o.answers7 > 0
      ? `${fmt(o.answers7)} ${plural(o.answers7, "answer", "answers")} in the last 7 days` +
        (o.answersPrev7 > 0 ? ` (${fmt(o.answersPrev7)} the week before)` : "")
      : "No practice recorded this week";

  const stats = `
    <div class="pm-stats">
      ${statCard(o.streak ? `🔥 ${o.streak}` : "—", "day streak", `<div class="caption">${o.streak ? `Best: ${o.bestStreak}` : "Practise today to start one"}</div>`)}
      ${statCard(`${o.today.count}<span class="pm-stat-of"> / ${o.today.goal}</span>`, "answers today", `<div class="daily-goal-bar" role="img" aria-label="${goalPct}% of today's goal"><div class="daily-goal-fill" style="width:${goalPct}%"></div></div>`)}
      ${statCard(fmt(o.mastered), "items mastered", `<div class="caption">of ${fmt(o.total)} (${o.pct}%)</div>`)}
      ${statCard(o.activeDays30, `active ${plural(o.activeDays30, "day", "days")} in 30`, `<div class="caption">${weekNote}</div>`)}
    </div>`;

  const allStats = getAllAreaStats();
  const areaRows = allStats
    .map(({ area, stats }) => {
      const split = getAreaSplit(area);
      const due = stats.due > 0 ? `<span class="pill pill-warn">${stats.due} due</span>` : "";
      return `
      <div class="pm-area-row" data-area="${area.id}">
        <div class="pm-area-head"><b>${esc(area.title)}</b>
          <span class="caption">${fmt(split.mastered)} of ${fmt(split.total)} mastered (${stats.pct}%)</span>${due}</div>
        ${stackedBar(split, area.title)}
        <div class="pm-area-foot caption">${fmt(split.learning)} learning · ${fmt(split.new)} new
          <button type="button" class="pm-link" data-open-mastery="${area.id}">Details →</button></div>
      </div>`;
    })
    .join("");

  const hasForecast = fc.dueNow > 0 || fc.later > 0 || fc.days.some((d) => d.count > 0);
  const forecast = hasForecast
    ? `${barChartSvg(fc.days, `Reviews due over the next 7 days: ${fc.days.map((d) => `${d.label} ${d.count}`).join(", ")}`)}
       <div class="caption">${fc.dueNow > 0 ? `${fmt(fc.dueNow)} due right now` : "Nothing overdue"}${fc.later > 0 ? ` · ${fmt(fc.later)} more after this week` : ""}. Counts the Typing, Flashcards, Parsing and Construction review queues.</div>`
    : `<p class="caption">Nothing scheduled yet. As you practise, the reviews coming up each day show here.</p>`;

  const calNote = grid.firstLogged
    ? `Recorded from ${formatDate(grid.firstLogged)} on — earlier days aren't shown. The darkest squares are days you reached your goal of ${grid.goal}.`
    : "Nothing recorded yet — the calendar fills in as you practise, one square per day.";

  panel.innerHTML = `
    ${stats}
    <h3>Mastery by area</h3>
    ${stackLegend()}
    <div class="pm-area-rows">${areaRows}${bibleOverviewRow()}</div>
    <h3>Reviews coming up</h3>
    <div class="pm-card">${forecast}</div>
    <h3>Activity</h3>
    <div class="pm-card">
      <div class="pm-scroll">${heatmapSvg(grid)}</div>
      ${heatLegend(grid.goal)}
      <div class="caption">${fmt(grid.activeDays)} active ${plural(grid.activeDays, "day", "days")} · ${fmt(grid.answers)} ${plural(grid.answers, "answer", "answers")} in the last ${grid.weeks} weeks. ${calNote}</div>
    </div>
    <h3>Settings</h3>
    <div class="pm-card pm-settings">
      <div class="pm-setting-row">
        <div><label for="pm-daily-goal"><b>Daily goal</b></label>
          <div class="caption">Practice answers per day. Fills the bar on the Home page and in the sidebar.</div></div>
        <input id="pm-daily-goal" type="number" min="1" max="200" class="daily-goal-input" value="${getDailyGoal()}" />
      </div>
      <div class="pm-setting-row">
        <div><label for="pm-name"><b>Display name</b></label>
          <div class="caption">Shown in the greeting on the Home page. Leave it empty if you'd rather not.</div></div>
        <input id="pm-name" type="text" maxlength="${MAX_NAME_LENGTH}" class="pm-name-input" autocomplete="given-name" value="${esc(getDisplayName())}" />
      </div>
      <div class="pm-setting-row pm-celebrate-row">
        <div><b>Celebration style</b>
          <div class="caption">How the app marks reaching your daily goal, a streak milestone, an achievement or a strong score.</div></div>
        <div class="pm-celebrate-controls">
          <div class="choice-group" id="pm-celebrate" role="group" aria-label="Celebration style">
            ${CELEBRATION_STYLES.map((st) => `<button type="button" class="choice-btn${getCelebrationStyle() === st.id ? " selected" : ""}" data-style="${st.id}" aria-pressed="${getCelebrationStyle() === st.id}" title="${esc(st.desc)}">${esc(st.label)}</button>`).join("")}
          </div>
          <button type="button" id="pm-celebrate-preview" class="btn btn-outline btn-sm">Preview</button>
        </div>
      </div>
      <div class="pm-setting-row">
        <div><b>Reset progress</b>
          <div class="caption">Clears your streak, daily goal, activity calendar and every review schedule. This can't be undone.</div></div>
        <button type="button" id="pm-reset" class="btn btn-outline btn-sm pm-danger">Reset progress…</button>
      </div>
    </div>`;

  const goalInput = panel.querySelector("#pm-daily-goal");
  goalInput.addEventListener("change", () => {
    const n = parseInt(goalInput.value, 10);
    if (Number.isFinite(n) && n > 0) setDailyGoal(n);
    ctx.rerender();
  });
  const nameInput = panel.querySelector("#pm-name");
  nameInput.addEventListener("change", () => {
    nameInput.value = setDisplayName(nameInput.value);
  });
  panel.querySelectorAll("#pm-celebrate [data-style]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setCelebrationStyle(btn.dataset.style);
      ctx.rerender();
      celebrate("goal", { force: true }); // show the choice straight away
    });
  });
  panel.querySelector("#pm-celebrate-preview").addEventListener("click", () => celebrate("goal", { force: true }));
  panel.querySelector("#pm-reset").addEventListener("click", () => {
    if (window.confirm("Reset your streak and spaced-repetition progress? This can't be undone.")) {
      resetAllProgress();
      ctx.rerender();
    }
  });

  // On a narrow screen the calendar scrolls sideways; start at the newest weeks.
  panel.querySelectorAll(".pm-scroll").forEach((el) => {
    el.scrollLeft = el.scrollWidth;
  });

  panel.querySelectorAll("[data-open-mastery]").forEach((btn) => {
    btn.addEventListener("click", () => ctx.openTab("mastery", { area: btn.dataset.openMastery }));
  });
  panel.querySelectorAll("[data-open-tab]").forEach((btn) => {
    btn.addEventListener("click", () => ctx.openTab(btn.dataset.openTab));
  });
}

// ---------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------

const STATUS_TEXT = { mastered: "Mastered", learning: "Learning", new: "Not practised yet" };

function tileMapHtml(items) {
  // Keep the data's order, with a heading wherever the group changes.
  let html = "";
  let current = Symbol("none");
  let open = false;
  items.forEach((it, i) => {
    if (it.group !== current) {
      if (open) html += "</div>";
      if (it.group) html += `<div class="pm-tile-group">${esc(it.group)}</div>`;
      html += `<div class="pm-tiles">`;
      open = true;
      current = it.group;
    }
    const mark = it.weak ? "!" : it.status === "mastered" ? "✓" : "";
    const label = `${it.name} — ${STATUS_TEXT[it.status].toLowerCase()}${it.weak ? ", often missed" : ""}`;
    html += `<button type="button" class="pm-tile pm-tile-${it.status}${it.weak ? " pm-tile-weak" : ""}" data-tile="${i}" aria-pressed="false" aria-label="${esc(label)}" title="${esc(it.name)}">
      <span class="pm-tile-form">${wrapHebrewSpans(it.form)}</span><span class="pm-tile-mark" aria-hidden="true">${mark}</span></button>`;
  });
  if (open) html += "</div>";
  return html;
}

function tileDetailText(it) {
  const pct = it.seen ? Math.round((it.correct / it.seen) * 100) : null;
  const parts = [`<b>${esc(it.name)}</b> ${wrapHebrewSpans(it.form)}`, STATUS_TEXT[it.status]];
  if (it.seen) parts.push(`right ${it.correct} of ${it.seen} ${plural(it.seen, "answer", "answers")} (${pct}%)`);
  if (it.weak) parts.push("you often miss this one");
  return parts.join(" · ");
}

function renderMastery(panel, ctx) {
  const areas = getAreas();
  const area = areas.find((a) => a.id === masteryAreaId) || areas[0];
  const statusMap = getItemStatusMap(area);
  const { split, modes } = getAreaBreakdown(area);
  const pct = split.total ? Math.round((split.mastered / split.total) * 100) : 0;

  const modeRows = modes.length
    ? modes
        .map(
          (m) => `<div class="pm-mode-row"><span>${esc(m.label)}</span>
            <span class="caption">${fmt(m.mastered)} mastered · ${fmt(m.learning)} learning · ${fmt(m.newCount)} new</span></div>`
        )
        .join("")
    : `<p class="caption">Nothing practised in ${esc(area.title)} yet.</p>`;

  let detail = "";
  let items = null;
  if (["consonants", "vowels", "accents"].includes(area.id)) {
    items = getItemMap(area);
    detail = `
      <h3>Every ${area.id === "accents" ? "accent" : area.id === "vowels" ? "vowel" : "consonant"}</h3>
      <div class="pm-tile-key caption" aria-hidden="true">
        <span><i class="pm-key pm-tile-mastered">✓</i> Mastered</span>
        <span><i class="pm-key pm-tile-learning"></i> Learning</span>
        <span><i class="pm-key pm-tile-new"></i> Not practised yet</span>
        <span><i class="pm-key pm-tile-weak pm-tile-new">!</i> Often missed</span>
      </div>
      ${tileMapHtml(items)}
      <div class="pm-tile-detail" aria-live="polite">Select one to see how you're doing with it.</div>`;
  } else {
    const groupings = GROUPINGS[area.id] || [];
    const gi = Math.min(groupingIndex[area.id] || 0, groupings.length - 1);
    const grouping = groupings[gi];
    const rows = getGroupMastery(area, grouping, statusMap)
      .map(
        (g) => `<div class="pm-group-row">
          <div class="pm-group-label">${wrapHebrewSpans(g.label)}</div>
          ${stackedBar(g, g.label)}
          <div class="pm-group-note caption">${fmt(g.mastered)} / ${fmt(g.total)}</div>
        </div>`
      )
      .join("");
    detail = `
      <h3>Mastery ${esc(grouping.title.toLowerCase())}</h3>
      ${groupings.length > 1 ? pillsHtml("group", groupings.map((g, i) => [String(i), g.title]), String(gi)) : ""}
      ${stackLegend()}
      <div class="pm-group-rows">${rows}</div>`;
  }

  panel.innerHTML = `
    ${pillsHtml("area", areas.map((a) => [a.id, a.title]), area.id)}
    <div class="pm-card pm-area-summary">
      <div class="pm-big">${pct}%<span> mastered</span></div>
      ${stackedBar(split, area.title)}
      ${stackLegend()}
      <div class="caption">${fmt(split.mastered)} mastered · ${fmt(split.learning)} learning · ${fmt(split.new)} new — of ${fmt(split.total)} ${esc(area.noun)}.
        An item is mastered once it reaches the top review box in at least one mode.</div>
    </div>
    <h3>By practice mode</h3>
    <div class="pm-card">${modeRows}</div>
    ${detail}`;

  wirePills(panel, "area", (id) => {
    masteryAreaId = id;
    ctx.rerender(`area-${id}`);
  });
  wirePills(panel, "group", (i) => {
    groupingIndex[area.id] = Number(i);
    ctx.rerender(`group-${i}`);
  });

  if (items) {
    const detailEl = panel.querySelector(".pm-tile-detail");
    panel.querySelectorAll(".pm-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        panel.querySelectorAll(".pm-tile").forEach((t) => t.setAttribute("aria-pressed", "false"));
        tile.setAttribute("aria-pressed", "true");
        detailEl.innerHTML = tileDetailText(items[Number(tile.dataset.tile)]);
      });
    });
  }
}

// ---------------------------------------------------------------------
// Strengths
// ---------------------------------------------------------------------

function weakSectionHtml(allWeak) {
  const counts = Object.fromEntries(DRILL_AREAS.map((id) => [id, allWeak.filter((w) => w.areaId === id).length]));
  const titles = { ...Object.fromEntries(getAreas().map((a) => [a.id, a.title])), bible: "Bible in Context" };
  const options = [["all", `All (${allWeak.length})`], ...DRILL_AREAS.map((id) => [id, `${titles[id]} (${counts[id]})`])];
  const filter = options.some(([id]) => id === weakFilter) ? weakFilter : "all";
  const shown = filter === "all" ? allWeak : allWeak.filter((w) => w.areaId === filter);
  const visible = weakShowAll ? shown : shown.slice(0, WEAK_SHOWN);

  let body;
  if (shown.length === 0) {
    body = `<p class="caption">${
      allWeak.length === 0
        ? "Nothing here yet. An item shows up once you've missed it at least twice and get it right less than 80% of the time."
        : "No weak spots in this area right now."
    }</p>`;
  } else {
    const items = visible
      .map((w) => {
        const pct = Math.round(((w.seen - w.missed) / w.seen) * 100);
        return `<li><span class="weak-label">${wrapHebrewSpans(w.label)}</span>
          <span class="caption">${esc(w.areaTitle)} · missed ${w.missed} of ${w.seen} (${pct}% right)</span></li>`;
      })
      .join("");
    const drillN = Math.min(WEAK_DRILL_SIZE, shown.length);
    body = `<ol class="weak-list pm-weak-list">${items}</ol>
      ${shown.length > WEAK_SHOWN ? `<button type="button" class="pm-link" data-weak-more>${weakShowAll ? "Show fewer" : `Show all ${shown.length}`}</button>` : ""}
      <button type="button" class="btn" data-drill>Drill the worst ${drillN}</button>`;
  }

  return `
    <h3>Weak spots</h3>
    ${pillsHtml("weak", options, filter)}
    <div class="pm-card">${body}
      <p class="caption pm-note">Verb forms aren't listed here because the drill quiz has no verb questions — see the verb breakdown below instead.</p>
    </div>`;
}

function accuracySectionHtml() {
  let html = `<h3>Accuracy by category</h3>
    <p class="caption">The share of your answers that were right, over every practice mode. Categories with fewer than ${MIN_ANSWERS} answers are greyed out — too early to say.</p>`;
  for (const area of getAreas()) {
    const statusMap = getItemStatusMap(area);
    const answers = [...statusMap.values()].reduce((n, s) => n + s.seen, 0);
    html += `<div class="pm-acc-area"><h4>${esc(area.title)}</h4>`;
    if (answers === 0) {
      html += `<p class="caption">No answers recorded yet.</p></div>`;
      continue;
    }
    for (const grouping of GROUPINGS[area.id] || []) {
      const groups = getAccuracyGroups(area, grouping, statusMap);
      const sw = strongestAndWeakest(groups);
      html += `<div class="pm-card pm-acc-card"><div class="pm-acc-title">${esc(grouping.title)}</div>
        ${
          sw
            ? `<div class="caption pm-acc-summary">Strongest: <b>${wrapHebrewSpans(sw.best.label)}</b> (${sw.best.pct}%) · Weakest: <b>${wrapHebrewSpans(sw.worst.label)}</b> (${sw.worst.pct}%)</div>`
            : ""
        }
        ${groups.map((g) => accuracyRow({ label: g.label, pct: g.pct, seen: g.seen, minAnswers: MIN_ANSWERS })).join("")}
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderStrengths(panel, ctx) {
  const allWeak = getWeakList();
  panel.innerHTML = weakSectionHtml(allWeak) + accuracySectionHtml();

  wirePills(panel, "weak", (id) => {
    weakFilter = id;
    weakShowAll = false;
    ctx.rerender(`weak-${id}`);
  });
  const more = panel.querySelector("[data-weak-more]");
  if (more) {
    more.addEventListener("click", () => {
      weakShowAll = !weakShowAll;
      ctx.rerender();
    });
  }
  const drill = panel.querySelector("[data-drill]");
  if (drill) {
    drill.addEventListener("click", () => {
      const shown = weakFilter === "all" ? allWeak : allWeak.filter((w) => w.areaId === weakFilter);
      setDeepLink({
        type: "weak-drill",
        items: shown.slice(0, WEAK_DRILL_SIZE).map((w) => ({ areaId: w.areaId, key: w.key, direction: w.direction, page: w.page })),
      });
      ctx.navigate("daily-challenge");
    });
  }
}

// ---------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------

const TREND_PILL = {
  up: `<span class="pill pill-good">↑ Improving</span>`,
  down: `<span class="pill pill-warn">↓ Slipping</span>`,
  flat: `<span class="pill">→ Steady</span>`,
};

function renderQuizzes(panel, ctx) {
  const trends = getQuizTrends().filter((t) => !t.mode.startsWith("bible-")); // the Bible pages have their own tab
  if (trends.length === 0) {
    panel.innerHTML = `<p class="caption">No quiz attempts recorded yet. Take a quiz in Parsing, Construction or any Typing page and your scores will chart here. (Bible in Context quizzes have their own tab.)</p>`;
    return;
  }
  panel.innerHTML = `<p class="caption">Your last 20 attempts at each quiz, oldest on the left. Bible in Context quizzes are on their own tab.</p>
    <div class="pm-quizzes">${trends
      .map(
        (t) => `
      <div class="pm-card pm-quiz" data-quiz="${t.mode}">
        <div class="pm-quiz-head"><b>${esc(t.label)}</b>${t.trend ? TREND_PILL[t.trend] : ""}</div>
        ${lineChartSvg(t.attempts, `${t.label} scores, oldest to newest: ${t.attempts.map((p) => p + "%").join(", ")}`)}
        <div class="caption">Latest ${t.latest}% · Average ${t.average}% · Best ${t.best}% · ${t.attempts.length} ${plural(t.attempts.length, "attempt", "attempts")}</div>
        <details class="pm-details"><summary>Recent attempts</summary><div data-history></div></details>
      </div>`
      )
      .join("")}</div>`;

  panel.querySelectorAll(".pm-quiz").forEach((card) => {
    renderHistoryPanel(card.querySelector("[data-history]"), card.dataset.quiz, { onClear: () => ctx.rerender() });
  });
}

// ---------------------------------------------------------------------
// Bible in Context
// ---------------------------------------------------------------------

/** The Overview row for the Bible pages: pages passed / practised / new, as the same kind of bar the areas use. */
function bibleOverviewRow() {
  const all = getAllBibleStats();
  const b = getBibleSummary(all);
  const split = { mastered: b.passed, learning: b.practised - b.passed, new: b.pages - b.practised, total: b.pages };
  return `
      <div class="pm-area-row" data-area="bible">
        <div class="pm-area-head"><b>Bible in Context</b>
          <span class="caption">${b.passed} of ${b.pages} pages passed (${b.pct}%)</span></div>
        ${stackedBar(split, "Bible in Context pages")}
        <div class="pm-area-foot caption">${split.learning} practised, not yet passed · ${split.new} not started · ${fmt(b.mastered)} ${plural(b.mastered, "word", "words")} mastered
          <button type="button" class="pm-link" data-open-tab="bible">Details →</button></div>
      </div>`;
}

const hasShown = (p) => p.attempts > 0 || p.tracked > 0;

function renderBible(panel, ctx) {
  const all = getAllBibleStats();
  const b = getBibleSummary(all);

  const stats = `
    <div class="pm-stats">
      ${statCard(`${b.passed}<span class="pm-stat-of"> / ${b.pages}</span>`, "pages passed", `<div class="caption">A quiz score of ${PASS_PERCENT}% or more</div>`)}
      ${statCard(fmt(b.practised), plural(b.practised, "page practised", "pages practised"), `<div class="caption">${b.pages - b.practised} not started</div>`)}
      ${statCard(fmt(b.mastered), plural(b.mastered, "word mastered", "words mastered"), `<div class="caption">${fmt(b.learning)} still learning</div>`)}
      ${statCard(fmt(b.answered), plural(b.answered, "answer given", "answers given"), `<div class="caption">on the Bible pages</div>`)}
    </div>`;

  const next = b.next
    ? `<p class="caption">${hasShown(b.next) ? "Suggested next:" : "Not tried yet:"} <button type="button" class="pm-link" data-open-page="${b.next.page}">${esc(b.next.label)} →</button></p>`
    : "";

  const groups = BIBLE_GROUPS.map((g) => {
    const rows = g.pages
      .map((gp) => all.find((a) => a.page === gp.page))
      .filter(Boolean)
      .map((p) => {
        if (!hasShown(p)) {
          return `<div class="pm-card pm-quiz" data-bible-page="${p.page}">
            <div class="pm-quiz-head"><b>${esc(p.label)}</b><span class="pill">Not started</span></div>
            <div class="caption">No answers yet. <button type="button" class="pm-link" data-open-page="${p.page}">Open this page →</button></div>
          </div>`;
        }
        const chart = p.scores.length >= 2 ? lineChartSvg(p.scores, `${p.label} scores, oldest to newest: ${p.scores.map((x) => x + "%").join(", ")}`) : "";
        const quizLine =
          p.attempts > 0
            ? `Latest ${p.latest}% · Average ${p.average}% · Best ${p.best}% · ${p.attempts} ${plural(p.attempts, "attempt", "attempts")}${p.lastTimestamp ? " · " + timeAgo(p.lastTimestamp) : ""}`
            : "No quiz taken yet";
        const itemLine = `${fmt(p.mastered)} mastered · ${fmt(p.learning)} learning · ${fmt(p.answered)} ${plural(p.answered, "answer", "answers")}${p.answered ? ` (${Math.round(((p.answered - p.missed) / p.answered) * 100)}% right)` : ""}`;
        return `<div class="pm-card pm-quiz" data-quiz="${p.page}">
            <div class="pm-quiz-head"><b>${esc(p.label)}</b>${p.passed ? `<span class="pill pill-good">Passed</span>` : ""}${p.trend ? TREND_PILL[p.trend] : ""}</div>
            ${chart}
            <div class="caption">${quizLine}</div>
            <div class="caption">${itemLine}</div>
            ${p.attempts > 0 ? `<details class="pm-details"><summary>Recent attempts</summary><div data-history></div></details>` : ""}
            <button type="button" class="pm-link" data-open-page="${p.page}">Practise →</button>
          </div>`;
      })
      .join("");
    return `<h3>${esc(g.title)}</h3><div class="pm-quizzes">${rows}</div>`;
  }).join("");

  panel.innerHTML = `<p class="caption">Every answer on a Bible in Context page counts here, in the guided passage or the quiz. Quiz scores show your last 20 attempts, oldest on the left.</p>
    ${stats}${next}${groups}`;

  panel.querySelectorAll(".pm-quiz[data-quiz]").forEach((card) => {
    const host = card.querySelector("[data-history]");
    if (host) renderHistoryPanel(host, card.dataset.quiz, { onClear: () => ctx.rerender() });
  });
  panel.querySelectorAll("[data-open-page]").forEach((btn) => {
    btn.addEventListener("click", () => ctx.navigate(btn.dataset.openPage));
  });
}

// ---------------------------------------------------------------------
// Backup & settings
// ---------------------------------------------------------------------

function renderBackup(panel, ctx) {
  panel.innerHTML = "";
  const intro = document.createElement("p");
  intro.className = "caption";
  intro.textContent =
    "Your progress is saved in this browser and synced to your account. A backup file is a copy you keep yourself: use it to move to a new device, or as a safety net.";
  panel.appendChild(intro);

  // ---- Back up ----
  const count = Object.keys(collectProgress()).length;
  const sec1 = document.createElement("section");
  sec1.className = "pm-card backup-card";
  sec1.innerHTML = `<h3>Back up</h3>
    <p>One file with all of your progress: review schedules, quiz history, streaks, stars and notes, roots and categories, saved filters, and your Bible answers and reading log. (${count} saved ${count === 1 ? "item" : "items"} on this device.)</p>
    <p class="caption">Display settings that belong to one device (theme, pattern, Hebrew size) are not included.</p>`;
  const dl = document.createElement("button");
  dl.type = "button";
  dl.className = "btn";
  dl.textContent = "Download backup";
  dl.addEventListener("click", () => {
    const backup = createBackup();
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    status.textContent = `Backup downloaded (${backup.keyCount} saved items).`;
  });
  sec1.appendChild(dl);
  const status = document.createElement("p");
  status.className = "caption backup-status";
  status.setAttribute("role", "status");
  sec1.appendChild(status);
  panel.appendChild(sec1);

  // ---- Restore ----
  const sec2 = document.createElement("section");
  sec2.className = "pm-card backup-card";
  sec2.innerHTML = `<h3>Restore from a backup</h3>
    <p>Choose a backup file you downloaded earlier. You will see what it contains before anything changes.</p>`;
  const fileLabel = document.createElement("label");
  fileLabel.className = "caption";
  fileLabel.textContent = "Backup file ";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.id = "backup-file";
  fileLabel.appendChild(file);
  sec2.appendChild(fileLabel);
  const result = document.createElement("div");
  result.className = "backup-result";
  result.setAttribute("aria-live", "polite");
  sec2.appendChild(result);
  file.addEventListener("change", async () => {
    result.innerHTML = "";
    const f = file.files && file.files[0];
    if (!f) return;
    const parsed = parseBackup(await f.text());
    if (!parsed.ok) {
      const bad = document.createElement("div");
      bad.className = "alert alert-warning";
      bad.textContent = parsed.error;
      result.appendChild(bad);
      return;
    }
    const when = parsed.createdAt ? new Date(parsed.createdAt).toLocaleString() : "an unknown date";
    const info = document.createElement("p");
    info.innerHTML = `<b>This backup has ${parsed.keyCount} saved ${parsed.keyCount === 1 ? "item" : "items"}</b>, made ${esc(when)}.`;
    result.appendChild(info);
    const modes = document.createElement("div");
    modes.className = "backup-modes";
    modes.innerHTML = `
      <label class="bible-check"><input type="radio" name="backup-mode" value="overwrite" checked> Restore everything in the file (replaces what is here for those items; anything not in the file is kept)</label>
      <label class="bible-check"><input type="radio" name="backup-mode" value="fill"> Only add what is missing on this device (nothing here is replaced)</label>`;
    result.appendChild(modes);
    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn";
    go.textContent = "Restore";
    go.addEventListener("click", async () => {
      const mode = modes.querySelector("input:checked").value;
      if (mode === "overwrite" && !window.confirm("Replace the progress on this device with the backup? This cannot be undone.")) return;
      const { written, skipped } = restoreBackup(parsed.backup, { mode });
      result.innerHTML = "";
      const done = document.createElement("div");
      done.className = "alert alert-success";
      done.setAttribute("role", "status");
      done.textContent = `Restored ${written} ${written === 1 ? "item" : "items"}${skipped ? ` (${skipped} left as they were)` : ""}. Refreshing your progress…`;
      result.appendChild(done);
      try {
        await syncNow();
      } catch (e) {
        /* the sync will catch up on its own */
      }
      ctx.rerender();
    });
    result.appendChild(go);
  });
  panel.appendChild(sec2);

  // ---- Settings ----
  const sec3 = document.createElement("section");
  sec3.className = "pm-card backup-card";
  sec3.innerHTML = `<h3>Settings</h3>`;
  const label = document.createElement("label");
  label.className = "bible-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = isConfidencePromptOn();
  cb.id = "confidence-setting";
  cb.addEventListener("change", () => setConfidencePromptOn(cb.checked));
  label.appendChild(cb);
  label.appendChild(document.createTextNode(" After a right answer, ask “How sure were you?”"));
  sec3.appendChild(label);
  const note = document.createElement("p");
  note.className = "caption";
  note.textContent = "An answer you were unsure of comes back sooner than one you were sure of. It appears on the Bible pages, the Daily Challenge and the Study Session.";
  sec3.appendChild(note);
  panel.appendChild(sec3);
}

// ---------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------

function renderAchievements(panel, ctx) {
  renderAchievementsInto(panel, ctx.navigate);
}

const RENDERERS = {
  overview: renderOverview,
  mastery: renderMastery,
  strengths: renderStrengths,
  quizzes: renderQuizzes,
  bible: renderBible,
  achievements: renderAchievements,
  backup: renderBackup,
};
