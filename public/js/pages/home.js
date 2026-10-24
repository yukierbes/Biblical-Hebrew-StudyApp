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
  getVocabOfTheDay,
  getClosestAchievements,
  getRecentActivity,
  timeAgo,
  dayAgo,
} from "../home-data.js";
import { getDisplayName, setDisplayName, isNamePromptDismissed, dismissNamePrompt, MAX_NAME_LENGTH } from "../profile.js";
import { homeMessage, seedFromDate } from "../encourage.js";
import { getQuizTrends } from "../progress-data.js";
import { ymd } from "../daily-history.js";
import { BIBLE_GROUPS, getAllBibleStats, getBibleSummary, PASS_PERCENT } from "../bible-areas.js";

// The Home page: what to do next (Today), where you left off, one tile per
// study area with its progress, your weak spots, and a verb form of the day.
// (My Progress, Achievements and Word Lookup are in the sidebar; Achievements
// now lives inside My Progress.) All the numbers come from home-data.js.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n, one, many) => (n === 1 ? one : many);

/** The label the sidebar uses for a page ("Vowels Typing"), or null if there is no such page. */
function pageLabel(page) {
  const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  return btn ? btn.textContent.trim() : null;
}

// ---------------- Greeting and encouragement ----------------

/** What the encouragement line needs to know, gathered from the saved practice data. */
function encouragementFacts(streak, due, recent, todayStr) {
  const trends = getQuizTrends();
  const latest = [];
  for (const t of trends) latest.push(...t.attempts.slice(-3));
  const recentAvg = latest.length >= 2 ? latest.reduce((a, b) => a + b, 0) / latest.length : null;
  const trend = trends.some((t) => t.trend === "down") ? "down" : trends.some((t) => t.trend === "up") ? "up" : null;
  const last = recent.lastPracticeDate;
  const daysAway = last ? Math.round((Date.parse(todayStr) - Date.parse(last)) / 86400000) : null;
  return {
    isNew: !last && trends.length === 0,
    streak: streak.streak,
    practisedToday: streak.practisedToday,
    atRisk: streak.atRisk,
    count: streak.count,
    goal: streak.goal,
    due,
    daysAway,
    recentAvg,
    trend,
  };
}

function greetingHtml(name, message, showPrompt) {
  const prompt = showPrompt
    ? `<form class="home-name-prompt" id="home-name-form">
         <label for="home-name-input">What should we call you?</label>
         <input id="home-name-input" type="text" maxlength="${MAX_NAME_LENGTH}" autocomplete="given-name" placeholder="Your first name" />
         <button type="submit" class="btn btn-sm btn-primary">Save</button>
         <button type="button" class="btn btn-sm btn-outline" id="home-name-skip">Not now</button>
       </form>`
    : "";
  return `
    <div class="home-greeting">
      <div class="home-greeting-hello">Shalom${name ? `, ${esc(name)}` : ""}.</div>
      <p class="encourage-line encourage-${message.tone}" id="home-encourage">${esc(message.text)}</p>
      ${prompt}
    </div>`;
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

// ---------------- Bible in Context ----------------

/** One page's button in the Bible tile: its name, and its latest quiz score (or "New"). */
function bibleButtonHtml(p) {
  const chip =
    p.attempts > 0
      ? `<span class="bible-home-chip${p.passed ? " is-passed" : ""}" title="Latest quiz score${p.passed ? " · best " + p.best + "%, passed" : ""}">${p.latest}%</span>`
      : p.tracked > 0
        ? `<span class="bible-home-chip" title="Practised, no quiz taken yet">started</span>`
        : `<span class="bible-home-chip is-new">New</span>`;
  return `<button class="bible-home-page" data-goto="${p.page}" type="button"><span class="bible-home-name">${esc(p.label)}</span>${chip}</button>`;
}

/** The Bible in Context tile: how many of the 15 pages are passed, and every page grouped like the sidebar. */
function bibleTileHtml(all, summary) {
  const fresh = summary.practised === 0;
  const status = fresh
    ? `<span class="area-tile-flag">Start here</span>`
    : `<span class="pill ${summary.passed === summary.pages ? "pill-good" : "pill-warn"} area-tile-due">${summary.passed} of ${summary.pages} passed</span>`;
  const caption = fresh
    ? `Nothing practised yet — ${summary.pages} pages that use real verses of Genesis`
    : `${summary.practised} of ${summary.pages} pages practised · ${summary.mastered.toLocaleString()} ${plural(summary.mastered, "word", "words")} mastered · ${summary.learning.toLocaleString()} still learning`;
  const groups = BIBLE_GROUPS.map((g) => {
    const pages = g.pages.map((gp) => all.find((a) => a.page === gp.page)).filter(Boolean);
    return `<div class="bible-home-group"><h3>${esc(g.title)}</h3><div class="bible-home-pages">${pages.map(bibleButtonHtml).join("")}</div></div>`;
  }).join("");
  const next = summary.next
    ? `<button class="btn btn-sm" data-goto="${summary.next.page}" title="${summary.next.attempts === 0 && summary.next.tracked === 0 ? "A page you have not tried yet" : "The page with the lowest recent score"}">${fresh ? "Start with" : "Next up:"} ${esc(summary.next.label)}</button>`
    : "";
  return `
    <div class="area-tile bible-home-tile${fresh ? " area-tile-new" : ""}" data-home-section="bible">
      <div class="area-tile-head"><h2>Bible in Context</h2>${status}</div>
      <div class="area-tile-pct">${summary.pct}%<span> of pages passed (quiz score ${PASS_PERCENT}% or more)</span></div>
      <div class="daily-goal-bar" role="img" aria-label="${summary.passed} of ${summary.pages} Bible pages passed"><div class="daily-goal-fill" style="width:${summary.pct}%"></div></div>
      <div class="caption area-tile-caption">${caption}</div>
      ${groups}
      <div class="area-tile-actions">${next}<button class="btn btn-sm btn-outline" data-progress-tab="bible" type="button">See details in My Progress</button></div>
    </div>`;
}

// ---------------- Weak spots and word of the day ----------------

function weakCardHtml(weak) {
  if (weak.length === 0) {
    return `
      <div class="home-card">
        <h3>Weak spots</h3>
        <p class="caption">Nothing here yet. Items you miss more than once show up here, ready for a quick drill.</p>
        <div class="home-card-foot">
          <button type="button" class="pm-link" data-progress-tab="strengths">See weak spots in My Progress →</button>
        </div>
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
      <div class="home-card-foot">
        <button class="btn btn-block" data-drill>Drill these</button>
        <button type="button" class="pm-link" data-progress-tab="strengths">See all weak spots in My Progress →</button>
      </div>
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
      <div class="home-card-foot">
        <button class="btn btn-outline btn-block" data-wotd-toggle>Show parsing</button>
      </div>
    </div>`;
}

function votdCardHtml(v) {
  if (!v) return "";
  const bits = [];
  if (v.lesson) bits.push(`Lesson ${esc(v.lesson)}`);
  if (v.frequency !== undefined && v.frequency !== "") bits.push(`Frequency ${esc(Number(v.frequency).toLocaleString())}`);
  if (v.pos) bits.push(esc(v.pos));
  return `
    <div class="home-card">
      <h3>Vocabulary of the day</h3>
      <div class="wotd-form" lang="he" dir="rtl">${wrapHebrewSpans(v.hebrew)}</div>
      <div class="votd-answer" hidden>
        <div class="wotd-gloss">${esc(v.english)}</div>
        <div class="caption">${bits.join(" · ")}</div>
      </div>
      <div class="home-card-foot">
        <button class="btn btn-outline btn-block" data-votd-toggle>Show definition</button>
      </div>
    </div>`;
}

function achievementsCardHtml({ items, allUnlocked }) {
  const body = items.length
    ? `<ul class="goal-list">${items
        .map(
          (a) => `<li>
            <span class="goal-icon" aria-hidden="true">${esc(a.icon)}</span>
            <div class="goal-main">
              <div class="goal-title">${esc(a.title)} <span class="caption">· ${a.progress.toLocaleString()} / ${a.target.toLocaleString()}</span></div>
              <div class="caption goal-desc">${esc(a.desc)}</div>
              <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${Math.round(a.ratio * 100)}%"></div></div>
            </div>
          </li>`
        )
        .join("")}</ul>`
    : `<p class="caption">${allUnlocked ? "Every achievement is unlocked — well done!" : "Practice a little and the goals you are closest to will show up here."}</p>`;
  return `
    <div class="home-card">
      <h3>Closest achievements</h3>
      ${body}
      <div class="home-card-foot">
        <button type="button" class="pm-link" data-progress-tab="achievements">See all achievements in My Progress →</button>
      </div>
    </div>`;
}

export function mount({ content, navigate }) {
  const allStats = getAllAreaStats();
  const due = totalDue(allStats);
  const suggestion = getStudySuggestion(allStats);
  const streak = getStreakStatus();
  const weak = getWeakSpots(5);
  const wotd = getWordOfTheDay();
  const votd = getVocabOfTheDay();
  const goals = getClosestAchievements(4);
  const lastVisit = getLastVisit();
  const recent = getRecentActivity();
  const bibleAll = getAllBibleStats();
  const bibleSummary = getBibleSummary(bibleAll);

  const wrap = document.createElement("div");
  wrap.id = "home-page";
  wrap.className = "home-bg";

  const todayStr = ymd();
  const message = homeMessage(encouragementFacts(streak, due, recent, todayStr), seedFromDate(todayStr));
  const displayName = getDisplayName();
  const showNamePrompt = !displayName && !isNamePromptDismissed();

  wrap.innerHTML = `
    <h1 class="page-title">Biblical Hebrew Study App</h1>
    <div id="home-greeting-slot">${greetingHtml(displayName, message, showNamePrompt)}</div>
    ${todayCardHtml(due, suggestion, streak)}
    ${resumeHtml(lastVisit, recent)}

    <div class="area-tiles">${allStats.map(tileHtml).join("")}</div>
    <div class="area-tiles bible-home-row">${bibleTileHtml(bibleAll, bibleSummary)}</div>

    <div class="home-duo">
      ${votdCardHtml(votd)}
      ${wotdCardHtml(wotd)}
      ${weakCardHtml(weak)}
      ${achievementsCardHtml(goals)}
    </div>

    <div class="verse">
      וְאָהַבְתָּ אֵת יְהוָה אֱלֹהֶיךָ בְּכָל&#8209;לְבָבְךָ<br/>
      וּבְכָל&#8209;נַפְשְׁךָ וּבְכָל&#8209;מְאֹדֶךָ
    </div>

    <div class="feedback-line">
      Found a mistake or have a suggestion?
      <a href="https://forms.gle/abrMxJfCp6mpLH9y6" target="_blank" rel="noopener">Send feedback</a>
    </div>
  `;

  // The name prompt: save a name, or decline once and never be asked again on this account.
  const slot = wrap.querySelector("#home-greeting-slot");
  const redrawGreeting = (promptStill) => {
    slot.innerHTML = greetingHtml(getDisplayName(), message, promptStill);
    bindNamePrompt();
  };
  function bindNamePrompt() {
    const form = slot.querySelector("#home-name-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (setDisplayName(form.querySelector("input").value)) redrawGreeting(false);
    });
    slot.querySelector("#home-name-skip").addEventListener("click", () => {
      dismissNamePrompt();
      redrawGreeting(false);
    });
  }
  bindNamePrompt();

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

  wrap.querySelectorAll("[data-progress-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDeepLink({ type: "progress-tab", tab: btn.dataset.progressTab });
      navigate("progress");
    });
  });

  const votdBtn = wrap.querySelector("[data-votd-toggle]");
  if (votdBtn) {
    votdBtn.addEventListener("click", () => {
      const panel = wrap.querySelector(".votd-answer");
      const show = panel.hasAttribute("hidden");
      if (show) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
      votdBtn.textContent = show ? "Hide definition" : "Show definition";
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
