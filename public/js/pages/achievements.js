import { getStreakInfo, getMasteredKeyCount } from "../srs.js";
import { loadHistory } from "../history.js";
import { getVocabRows } from "../vocab-data.js";
import { getCategoriesForRow, getCustomCategoryCount } from "../vocab-overrides.js";
import { getAllHighScores } from "./vocab-games.js";
import { getAllHighScores as getAllAccentHighScores } from "./accent-games.js";

const VOCAB_SRS_MODES = [
  "vocab-typing-hebrew",
  "vocab-typing-english",
  "vocab-flashcards-hebrew",
  "vocab-flashcards-english",
  "vocab-games-hebrew",
  "vocab-games-english",
];

const VERB_SRS_MODES = ["parsing", "construction", "verb-flashcards-hebrew", "verb-flashcards-english"];

const ACCENT_SRS_MODES = [
  "accent-typing-names",
  "accent-typing-symbol",
  "accent-flashcards",
  "accent-games-names",
  "accent-games-symbol",
];

const QUIZ_HISTORY_MODES = ["parsing", "construction", "vocab-typing", "accent-typing"];

export const ACHIEVEMENTS = [
  // ---- Consistency ----
  {
    id: "streak-1",
    section: "Consistency",
    icon: "🔥",
    title: "First Steps",
    desc: "Practice on any day",
    target: 1,
    progress: (ctx) => ctx.longestStreak,
  },
  {
    id: "streak-3",
    section: "Consistency",
    icon: "🔥",
    title: "Consistent",
    desc: "Reach a 3-day streak",
    target: 3,
    progress: (ctx) => ctx.longestStreak,
  },
  {
    id: "streak-7",
    section: "Consistency",
    icon: "🔥",
    title: "Week Warrior",
    desc: "Reach a 7-day streak",
    target: 7,
    progress: (ctx) => ctx.longestStreak,
  },
  {
    id: "streak-30",
    section: "Consistency",
    icon: "🔥",
    title: "Iron Will",
    desc: "Reach a 30-day streak",
    target: 30,
    progress: (ctx) => ctx.longestStreak,
  },

  // ---- Vocabulary mastery ----
  {
    id: "vocab-mastery-10",
    section: "Vocabulary Mastery",
    icon: "📖",
    title: "Word Learner",
    desc: "Master 10 vocabulary words",
    target: 10,
    progress: (ctx) => ctx.masteredVocab,
  },
  {
    id: "vocab-mastery-50",
    section: "Vocabulary Mastery",
    icon: "📖",
    title: "Word Scholar",
    desc: "Master 50 vocabulary words",
    target: 50,
    progress: (ctx) => ctx.masteredVocab,
  },
  {
    id: "vocab-mastery-150",
    section: "Vocabulary Mastery",
    icon: "📖",
    title: "Word Master",
    desc: "Master 150 vocabulary words",
    target: 150,
    progress: (ctx) => ctx.masteredVocab,
  },

  // ---- Verb mastery ----
  {
    id: "verb-mastery-10",
    section: "Verb Mastery",
    icon: "📜",
    title: "Verb Novice",
    desc: "Master 10 verb forms",
    target: 10,
    progress: (ctx) => ctx.masteredVerbs,
  },
  {
    id: "verb-mastery-50",
    section: "Verb Mastery",
    icon: "📜",
    title: "Verb Adept",
    desc: "Master 50 verb forms",
    target: 50,
    progress: (ctx) => ctx.masteredVerbs,
  },
  {
    id: "verb-mastery-150",
    section: "Verb Mastery",
    icon: "📜",
    title: "Verb Sage",
    desc: "Master 150 verb forms",
    target: 150,
    progress: (ctx) => ctx.masteredVerbs,
  },

  // ---- Quizzes ----
  {
    id: "quiz-1",
    section: "Quizzes",
    icon: "📝",
    title: "Quiz Taker",
    desc: "Complete a quiz",
    target: 1,
    progress: (ctx) => ctx.totalQuizzes,
  },
  {
    id: "quiz-10",
    section: "Quizzes",
    icon: "📝",
    title: "Quiz Regular",
    desc: "Complete 10 quizzes",
    target: 10,
    progress: (ctx) => ctx.totalQuizzes,
  },
  {
    id: "quiz-30",
    section: "Quizzes",
    icon: "📝",
    title: "Quiz Veteran",
    desc: "Complete 30 quizzes",
    target: 30,
    progress: (ctx) => ctx.totalQuizzes,
  },
  {
    id: "quiz-perfect",
    section: "Quizzes",
    icon: "💯",
    title: "Perfectionist",
    desc: "Score 100% on a quiz",
    target: 1,
    progress: (ctx) => ctx.perfectQuizzes,
  },

  // ---- Organization ----
  {
    id: "org-custom-category",
    section: "Organization",
    icon: "🗂️",
    title: "Organizer",
    desc: "Create a custom category",
    target: 1,
    progress: (ctx) => ctx.customCategories,
  },
  {
    id: "org-cataloger",
    section: "Organization",
    icon: "🗂️",
    title: "Cataloger",
    desc: "Have 50 words assigned to a category",
    target: 50,
    progress: (ctx) => ctx.categorizedWords,
  },

  // ---- Accents mastery ----
  {
    id: "accent-mastery-10",
    section: "Accents Mastery",
    icon: "🎵",
    title: "Accent Learner",
    desc: "Master 10 accents",
    target: 10,
    progress: (ctx) => ctx.masteredAccents,
  },
  {
    id: "accent-mastery-25",
    section: "Accents Mastery",
    icon: "🎵",
    title: "Accent Scholar",
    desc: "Master 25 accents",
    target: 25,
    progress: (ctx) => ctx.masteredAccents,
  },
  {
    id: "accent-mastery-40",
    section: "Accents Mastery",
    icon: "🎵",
    title: "Accent Master",
    desc: "Master 40 accents",
    target: 40,
    progress: (ctx) => ctx.masteredAccents,
  },

  // ---- Games ----
  {
    id: "game-survivor",
    section: "Games",
    icon: "🎮",
    title: "Survivor",
    desc: "Score 10 in Survival Sprint",
    target: 10,
    progress: (ctx) => Math.max(ctx.gameScores["sprint-hebrew"] ?? 0, ctx.gameScores["sprint-english"] ?? 0),
  },
  {
    id: "game-speed-demon",
    section: "Games",
    icon: "🎮",
    title: "Speed Demon",
    desc: "Score 30 in Beat the Clock",
    target: 30,
    progress: (ctx) => Math.max(ctx.gameScores["clock-hebrew"] ?? 0, ctx.gameScores["clock-english"] ?? 0),
  },
  {
    id: "game-sharp-shooter",
    section: "Games",
    icon: "🎮",
    title: "Sharp Shooter",
    desc: "Score 12 or higher in Lightning Round",
    target: 12,
    progress: (ctx) => Math.max(ctx.gameScores["lightning-hebrew"] ?? 0, ctx.gameScores["lightning-english"] ?? 0),
  },
  {
    id: "game-sorter",
    section: "Games",
    icon: "🎮",
    title: "Sorter",
    desc: "Score 10 in Category Sort",
    target: 10,
    progress: (ctx) => ctx.gameScores["sort"] ?? 0,
  },
  {
    id: "game-memory",
    section: "Games",
    icon: "🎮",
    title: "Memory Master",
    desc: "Complete a Memory Match round",
    target: 1,
    progress: (ctx) => (ctx.hasMemoryScore ? 1 : 0),
  },

  // ---- Accents games ----
  {
    id: "accent-game-sprint",
    section: "Accents Games",
    icon: "🎮",
    title: "Accent Sprinter",
    desc: "Score 10 in Accents Survival Sprint",
    target: 10,
    progress: (ctx) => Math.max(ctx.accentGameScores["sprint-names"] ?? 0, ctx.accentGameScores["sprint-symbol"] ?? 0),
  },
  {
    id: "accent-game-clock",
    section: "Accents Games",
    icon: "🎮",
    title: "Accent Speedster",
    desc: "Score 20 in Accents Beat the Clock",
    target: 20,
    progress: (ctx) => Math.max(ctx.accentGameScores["clock-names"] ?? 0, ctx.accentGameScores["clock-symbol"] ?? 0),
  },
  {
    id: "accent-game-lightning",
    section: "Accents Games",
    icon: "🎮",
    title: "Accent Sharp Eye",
    desc: "Score 10 or higher in Accents Lightning Round",
    target: 10,
    progress: (ctx) =>
      Math.max(ctx.accentGameScores["lightning-names"] ?? 0, ctx.accentGameScores["lightning-symbol"] ?? 0),
  },
  {
    id: "accent-game-sort",
    section: "Accents Games",
    icon: "🎮",
    title: "Accent Sorter",
    desc: "Score 10 in Type Sort",
    target: 10,
    progress: (ctx) => ctx.accentGameScores["sort"] ?? 0,
  },
  {
    id: "accent-game-memory",
    section: "Accents Games",
    icon: "🎮",
    title: "Accent Memory Master",
    desc: "Complete an Accents Memory Match round",
    target: 1,
    progress: (ctx) => (ctx.hasAccentMemoryScore ? 1 : 0),
  },
];

export function buildContext() {
  const streak = getStreakInfo();
  const masteredVocab = getMasteredKeyCount(VOCAB_SRS_MODES);
  const masteredVerbs = getMasteredKeyCount(VERB_SRS_MODES);
  const masteredAccents = getMasteredKeyCount(ACCENT_SRS_MODES);

  let totalQuizzes = 0;
  let perfectQuizzes = 0;
  for (const mode of QUIZ_HISTORY_MODES) {
    const hist = loadHistory(mode);
    totalQuizzes += hist.length;
    perfectQuizzes += hist.filter((h) => h.percent === 100).length;
  }

  const allVocabRows = getVocabRows();
  const categorizedWords = allVocabRows.filter((r) => getCategoriesForRow(r).length > 0).length;
  const customCategories = getCustomCategoryCount();

  const gameScores = getAllHighScores();
  const hasMemoryScore = Object.keys(gameScores).some((k) => k.startsWith("memory-"));

  const accentGameScores = getAllAccentHighScores();
  const hasAccentMemoryScore = Object.keys(accentGameScores).some((k) => k.startsWith("memory-"));

  return {
    longestStreak: streak.longestStreak,
    masteredVocab,
    masteredVerbs,
    masteredAccents,
    totalQuizzes,
    perfectQuizzes,
    categorizedWords,
    customCategories,
    gameScores,
    hasMemoryScore,
    accentGameScores,
    hasAccentMemoryScore,
  };
}

// ============ Progress-toward-achievement notifications ============
// Not just "unlocked" — also a nudge the first time a locked
// achievement crosses a meaningful fraction of its target, so working
// toward one feels like it's actually going somewhere.

const NOTIFY_TIERS_KEY = "hebrewVerbApp:achievementTiers";
const MILESTONES = [
  { at: 0.5, label: (a, cur, tgt) => `Halfway to "${a.title}" — ${cur} / ${tgt}` },
  { at: 0.8, label: (a, cur, tgt) => `Almost there! "${a.title}" — ${cur} / ${tgt}` },
];

function loadNotifyTiers() {
  try {
    const raw = localStorage.getItem(NOTIFY_TIERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveNotifyTiers(tiers) {
  try {
    localStorage.setItem(NOTIFY_TIERS_KEY, JSON.stringify(tiers));
  } catch (e) {
    /* ignore */
  }
}

/**
 * Compares current achievement progress against what's already been
 * notified about, and returns any newly-crossed events (a milestone
 * fraction, or full completion) as `{ achievement, kind, current,
 * target }` — `kind` is `"milestone"` or `"unlocked"`. Records what it
 * returns so the same crossing is never reported twice. Cheap enough
 * to call often (e.g. on every navigation, or on an interval).
 */
export function checkAchievementProgress() {
  const ctx = buildContext();
  const tiers = loadNotifyTiers();
  const events = [];

  for (const a of ACHIEVEMENTS) {
    const current = Math.min(a.progress(ctx), a.target);
    const prevTier = tiers[a.id] ?? -1;

    if (current >= a.target) {
      if (prevTier < MILESTONES.length) {
        events.push({ achievement: a, kind: "unlocked", current, target: a.target });
        tiers[a.id] = MILESTONES.length;
      }
      continue;
    }

    for (let i = MILESTONES.length - 1; i >= 0; i--) {
      if (current / a.target >= MILESTONES[i].at && prevTier < i) {
        events.push({ achievement: a, kind: "milestone", current, target: a.target, tier: i });
        tiers[a.id] = i;
        break;
      }
    }
  }

  if (events.length) saveNotifyTiers(tiers);
  return events;
}

export function mount({ content, sidebarExtra, navigate }) {
  sidebarExtra.innerHTML = "";
  render(content, navigate);
}

export function unmount() {}

function renderAchievementCard(achievement, ctx) {
  const rawProgress = achievement.progress(ctx);
  const progress = Math.min(rawProgress, achievement.target);
  const unlocked = progress >= achievement.target;

  const card = document.createElement("div");
  card.className = "achievement-card" + (unlocked ? " achievement-unlocked" : " achievement-locked");

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.gap = "8px";
  const icon = document.createElement("div");
  icon.className = "achievement-icon";
  icon.textContent = achievement.icon;
  const title = document.createElement("div");
  title.className = "achievement-title";
  title.textContent = achievement.title;
  top.appendChild(icon);
  top.appendChild(title);
  if (unlocked) {
    const check = document.createElement("span");
    check.className = "pill pill-good";
    check.style.marginLeft = "auto";
    check.textContent = "Unlocked";
    top.appendChild(check);
  }
  card.appendChild(top);

  const desc = document.createElement("div");
  desc.className = "achievement-desc";
  desc.textContent = achievement.desc;
  card.appendChild(desc);

  if (!unlocked) {
    const bar = document.createElement("div");
    bar.className = "progress-bar-outer";
    bar.style.marginTop = "6px";
    bar.innerHTML = `<div class="progress-bar-inner" style="width:${(progress / achievement.target) * 100}%"></div>`;
    card.appendChild(bar);

    const progressCaption = document.createElement("div");
    progressCaption.className = "caption";
    progressCaption.textContent = `${progress} / ${achievement.target}`;
    card.appendChild(progressCaption);
  }

  return card;
}

function render(content, navigate) {
  content.innerHTML = "";

  const ctx = buildContext();

  const unlockedCount = ACHIEVEMENTS.filter((a) => a.progress(ctx) >= a.target).length;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Achievements</h1>
    <div class="info-box">
      <b>About this page</b><br>
      Badges for the goals you reach across the whole app — streaks, mastery, quizzes, categories, and games.<br>
      This is stored in your browser only; it won't follow you to a different browser or device.
    </div>
  `;
  content.appendChild(wrap);

  const summaryBox = document.createElement("div");
  summaryBox.className = "info-box";
  summaryBox.innerHTML = `<b>${unlockedCount} / ${ACHIEVEMENTS.length} unlocked</b>`;
  const summaryBar = document.createElement("div");
  summaryBar.className = "progress-bar-outer";
  summaryBar.style.marginTop = "8px";
  summaryBar.innerHTML = `<div class="progress-bar-inner" style="width:${(unlockedCount / ACHIEVEMENTS.length) * 100}%"></div>`;
  summaryBox.appendChild(summaryBar);
  content.appendChild(summaryBox);

  // "Almost there" — the locked achievements closest to completion, to
  // give something concrete to aim for right now.
  const almostThere = ACHIEVEMENTS.filter((a) => a.progress(ctx) < a.target)
    .map((a) => ({ a, ratio: a.progress(ctx) / a.target }))
    .sort((x, y) => y.ratio - x.ratio)
    .slice(0, 3)
    .filter((x) => x.ratio > 0);

  if (almostThere.length > 0) {
    const heading = document.createElement("h3");
    heading.textContent = "Almost There";
    content.appendChild(heading);
    const grid = document.createElement("div");
    grid.className = "achievement-grid";
    for (const { a } of almostThere) grid.appendChild(renderAchievementCard(a, ctx));
    content.appendChild(grid);
  }

  const sections = [...new Set(ACHIEVEMENTS.map((a) => a.section))];
  for (const section of sections) {
    const heading = document.createElement("h3");
    heading.textContent = section;
    content.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "achievement-grid";
    for (const a of ACHIEVEMENTS.filter((x) => x.section === section)) {
      grid.appendChild(renderAchievementCard(a, ctx));
    }
    content.appendChild(grid);
  }

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => navigate("home"));
  content.appendChild(homeBtn);
}
