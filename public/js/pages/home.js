import { setDeepLink } from "../deep-link.js";
import { wrapHebrewSpans } from "../helpers.js";
import { getLastVisit } from "../session.js";
import {
  getAllAreaStats,
  totalDue,
  getStudySuggestion,
  getStreakStatus,
  getWeakSpots,
  getWordOfTheDay,
  getRecentActivity,
  timeAgo,
  dayAgo,
} from "../home-data.js";

// The Home page: what to do next (Today), where you left off, one tile per
// study area with its progress, your weak spots, a verb form of the day, and
// shortcuts to Progress, Achievements and Word Lookup. All the numbers come
// from home-data.js.

const FEATURED_MODES = [
  {
    label: "My Progress",
    desc: "See your streak, spaced-repetition mastery, and recent quiz scores across the whole app",
    key: "progress",
    buttonLabel: "My Progress",
  },
  {
    label: "Achievements",
    desc: "Badges and goals for streaks, mastery, quizzes, categories, and games — see what you're closest to earning",
    key: "achievements",
    buttonLabel: "Achievements",
  },
  {
    label: "Word Lookup",
    desc: "Quickly search for a Hebrew word or English gloss to see how it parses",
    key: "search",
    buttonLabel: "Word Lookup",
  },
];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n, one, many) => (n === 1 ? one : many);

/** The label the sidebar uses for a page ("Vowels Typing"), or null if there is no such page. */
function pageLabel(page) {
  const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  return btn ? btn.textContent.trim() : null;
}

// ---------------- Today card ----------------

function streakLineHtml(s) {
  const freeze = s.freezes > 0 ? ` <span title="${s.freezes} streak freeze${s.freezes === 1 ? "" : "s"} available">🧊×${s.freezes}</span>` : "";
  if (s.streak === 0) {
    return `<div class="today-streak"><span class="today-streak-count">Practice today to start a streak.</span></div>`;
  }
  let nudge;
  if (s.atRisk) nudge = `One answer today keeps it going.`;
  else if (s.remainingToGoal > 0) nudge = `Kept for today — ${s.remainingToGoal} more to reach your daily goal.`;
  else nudge = `Kept for today, and your daily goal is done ✓`;
  return `<div class="today-streak${s.atRisk ? " today-streak-risk" : ""}">
    <span class="today-streak-count">🔥 ${s.streak}-day streak</span>${freeze}
    <span class="today-streak-nudge">${nudge}</span>
  </div>`;
}

function todayCardHtml(due, suggestion, streak) {
  const pct = Math.min(100, Math.round((streak.count / streak.goal) * 100));
  let studyLabel;
  let studySub;
  if (suggestion.kind === "due") {
    studyLabel = "Study now";
    studySub = `${suggestion.count} due in ${suggestion.area.title} · ${suggestion.dueMode.label}`;
  } else if (suggestion.kind === "start") {
    studyLabel = "Start here";
    studySub = `${suggestion.area.title} Flashcards — you haven't practised these yet`;
  } else {
    studyLabel = "Start Daily Challenge";
    studySub = "You're all caught up — a quick mixed round keeps it fresh";
  }
  return `
    <div class="today-card">
      <div class="today-card-main">
        <div class="today-card-title">Today</div>
        <div class="today-card-due">${due > 0 ? `${due} ${plural(due, "item", "items")} due for review` : "You're all caught up"}</div>
        ${streakLineHtml(streak)}
        <div class="daily-goal" style="max-width: 260px;">
          <div class="daily-goal-bar"><div class="daily-goal-fill" style="width:${pct}%"></div></div>
          <div class="daily-goal-label">${streak.count} / ${streak.goal} today</div>
        </div>
      </div>
      <div class="today-card-actions">
        <button class="btn" data-study-now>${esc(studyLabel)}</button>
        <div class="caption today-card-sub">${esc(studySub)}</div>
        ${suggestion.kind === "daily" ? "" : `<button class="btn btn-outline" data-goto="daily-challenge">Daily Challenge</button>`}
      </div>
    </div>
  `;
}

// ---------------- Pick up where you left off ----------------

function resumeHtml(lastVisit, recent) {
  const label = lastVisit ? pageLabel(lastVisit.page) : null;
  const bits = [];
  const practised = dayAgo(recent.lastPracticeDate);
  if (practised) bits.push(`Last practised ${practised}`);
  if (recent.lastQuiz) {
    const q = recent.lastQuiz;
    bits.push(`Last quiz: ${esc(q.label)} — ${q.score}/${q.total} (${q.percent}%), ${timeAgo(q.timestamp)}`);
  }
  if (!label && bits.length === 0) return "";
  return `
    <div class="resume-row">
      ${
        label
          ? `<div class="resume-main">
               <div class="resume-title">Pick up where you left off</div>
               <div class="resume-page">${esc(label)} <span class="caption">· ${timeAgo(lastVisit.ts)}</span></div>
             </div>
             <button class="btn btn-outline" data-goto="${esc(lastVisit.page)}">Resume</button>`
          : ""
      }
      ${bits.length ? `<div class="resume-activity caption">${bits.join(" · ")}</div>` : ""}
    </div>
  `;
}

// ---------------- Area tiles ----------------

function tileHtml({ area, stats }) {
  const fresh = stats.tracked === 0 && stats.total > 0;
  const learning = Math.max(0, stats.tracked - stats.mastered);
  const status = fresh
    ? `<span class="area-tile-flag">Start here</span>`
    : stats.due > 0
      ? `<span class="pill pill-warn area-tile-due">${stats.due} due</span>`
      : `<span class="pill pill-good area-tile-due">Caught up</span>`;
  const caption = fresh
    ? `Nothing practised yet — ${stats.total.toLocaleString()} ${esc(area.noun)} to learn`
    : `${stats.mastered.toLocaleString()} of ${stats.total.toLocaleString()} mastered · ${learning.toLocaleString()} learning`;
  const buttons = area.buttons
    .map((b) => {
      // On a brand-new area, Flashcards is the suggested first step.
      const primary = fresh && b.label === "Flashcards";
      return `<button class="btn btn-sm ${primary ? "" : "btn-outline"}" data-goto="${b.page}" title="${esc(b.tip)}">${b.label}</button>`;
    })
    .join("");
  return `
    <div class="area-tile${fresh ? " area-tile-new" : ""}" data-home-section="${area.id}">
      <div class="area-tile-head"><h2>${area.title}</h2>${status}</div>
      <div class="area-tile-pct">${stats.pct}%<span> mastered</span></div>
      <div class="daily-goal-bar" role="img" aria-label="${stats.pct}% of ${esc(area.noun)} mastered"><div class="daily-goal-fill" style="width:${stats.pct}%"></div></div>
      <div class="caption area-tile-caption">${caption}</div>
      <div class="area-tile-actions">${buttons}</div>
    </div>
  `;
}

// ---------------- Weak spots and word of the day ----------------

function weakCardHtml(weak) {
  if (weak.length === 0) {
    return `
      <div class="home-card">
        <h3>Weak spots</h3>
        <p class="caption">Nothing here yet. Items you miss more than once show up here, ready for a quick drill.</p>
      </div>`;
  }
  const items = weak
    .map(
      (w) => `<li><span class="weak-label">${wrapHebrewSpans(w.label)}</span>
        <span class="caption">${esc(w.areaTitle)} · missed ${w.missed} of ${w.seen}</span></li>`
    )
    .join("");
  return `
    <div class="home-card">
      <h3>Weak spots</h3>
      <ol class="weak-list">${items}</ol>
      <button class="btn btn-block" data-drill>Drill these</button>
    </div>`;
}

function wotdCardHtml(w) {
  if (!w) return "";
  const p = w.parsing;
  return `
    <div class="home-card">
      <h3>Verb of the day</h3>
      <div class="wotd-form" lang="he" dir="rtl">${esc(w.form)}</div>
      <div class="wotd-parse" hidden>
        <div><b>${esc(p.binyan)} ${esc(p.mode)}${p.pgn ? " · " + esc(p.pgn) : ""}</b></div>
        <div class="caption">${wrapHebrewSpans(p.verb)}</div>
        ${w.gloss ? `<div class="wotd-gloss">${esc(w.gloss)}</div>` : ""}
      </div>
      <button class="btn btn-outline btn-block" data-wotd-toggle>Show parsing</button>
    </div>`;
}

// ---------------- Cards for the shortcut row ----------------

function cardsHtml(modes) {
  return modes
    .map(
      (m) => `
        <div class="mode-card">
          <div>
            <h2>${m.label}</h2>
            <p>${m.desc}</p>
          </div>
          <button class="btn btn-block" data-goto="${m.key}">${m.buttonLabel}</button>
        </div>`
    )
    .join("");
}

export function mount({ content, navigate }) {
  const allStats = getAllAreaStats();
  const due = totalDue(allStats);
  const suggestion = getStudySuggestion(allStats);
  const streak = getStreakStatus();
  const weak = getWeakSpots(5);
  const wotd = getWordOfTheDay();
  const lastVisit = getLastVisit();
  const recent = getRecentActivity();

  const wrap = document.createElement("div");
  wrap.id = "home-page";
  wrap.className = "home-bg";

  wrap.innerHTML = `
    <h1 class="page-title">Biblical Hebrew Study App</h1>
    ${todayCardHtml(due, suggestion, streak)}
    ${resumeHtml(lastVisit, recent)}

    <div class="area-tiles">${allStats.map(tileHtml).join("")}</div>

    <div class="home-duo">
      ${weakCardHtml(weak)}
      ${wotdCardHtml(wotd)}
    </div>

    <div class="mode-cards">${cardsHtml(FEATURED_MODES)}</div>

    <div class="verse">
      וְאָהַבְתָּ אֵת יְהוָה אֱלֹהֶיךָ בְּכָל&#8209;לְבָבְךָ<br/>
      וּבְכָל&#8209;נַפְשְׁךָ וּבְכָל&#8209;מְאֹדֶךָ
    </div>

    <div class="feedback-line">
      Found a mistake or have a suggestion?
      <a href="https://forms.gle/abrMxJfCp6mpLH9y6" target="_blank" rel="noopener">Send feedback</a>
    </div>
  `;

  wrap.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.goto));
  });

  // "Study now": straight to the right page, already set to the right mode.
  const studyBtn = wrap.querySelector("[data-study-now]");
  if (studyBtn) {
    studyBtn.addEventListener("click", () => {
      if (suggestion.kind === "due") {
        if (suggestion.dueMode.link) setDeepLink(suggestion.dueMode.link);
        navigate(suggestion.dueMode.page);
      } else if (suggestion.kind === "start") {
        const flash = suggestion.area.buttons.find((b) => b.label === "Flashcards") || suggestion.area.buttons[0];
        navigate(flash.page);
      } else {
        navigate("daily-challenge");
      }
    });
  }

  // "Drill these": a short quiz on exactly the weak items.
  const drillBtn = wrap.querySelector("[data-drill]");
  if (drillBtn) {
    drillBtn.addEventListener("click", () => {
      setDeepLink({
        type: "weak-drill",
        items: weak.map((w) => ({ areaId: w.areaId, key: w.key, direction: w.direction })),
      });
      navigate("daily-challenge");
    });
  }

  const wotdBtn = wrap.querySelector("[data-wotd-toggle]");
  if (wotdBtn) {
    wotdBtn.addEventListener("click", () => {
      const panel = wrap.querySelector(".wotd-parse");
      const show = panel.hasAttribute("hidden");
      if (show) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
      wotdBtn.textContent = show ? "Hide parsing" : "Show parsing";
    });
  }

  content.appendChild(wrap);
}

export function unmount() {}
