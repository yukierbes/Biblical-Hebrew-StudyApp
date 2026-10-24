import { getStreakInfo, getMasteredKeyCount, getActivityLog } from "../srs.js";
import { loadHistory } from "../history.js";
import { getStats as getDailyStats } from "../daily-history.js";
import { getVocabRows } from "../vocab-data.js";
import { getCategoriesForRow, getCustomCategoryCount, hasCategoryOverride } from "../vocab-overrides.js";
import { getConsonantRows, getVowelRows } from "../letter-data.js";
import { getAccentRows } from "../accent-data.js";
import { BIBLE_GROUPS, BIBLE_PAGES, getAllBibleStats } from "../bible-areas.js";
import { getSecrets, getReadingStats } from "../bible-insights.js";
import { getAllHighScores } from "./vocab-games.js";
import { getAllHighScores as getAllAccentHighScores } from "./accent-games.js";
import { getAllHighScores as getAllConsonantHighScores } from "./consonant-games.js";
import { getAllHighScores as getAllVowelHighScores } from "./vowel-games.js";

// ---------------------------------------------------------------------------------------------
// Badges
//
// A BADGE is one thing to work toward, usually with three levels — Bronze, Silver and Gold — so one card shows a
// whole path ("Dagesh: 80%, 90%, 100%") instead of three separate one-offs. Badges reward what you can DO
// (master every consonant, pass every Prefixes page, turn a weak page around) more than how much you click.
//
// ACHIEVEMENTS is the same list flattened to one entry per level (id, title, target, progress), which is what the
// unlock notices, Home and the tests read. Where a level existed before, it keeps its old id so nothing that was
// already earned is announced a second time.
// ---------------------------------------------------------------------------------------------

export const TIER_NAMES = ["Bronze", "Silver", "Gold"];
export const TIER_ICONS = ["🥉", "🥈", "🥇"];

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
  "accent-typing-symbol", // (still written by the Daily Challenge's "copy the accent" questions)
  "accent-typing-form",
  "accent-flashcards",
  "accent-games-names",
  "accent-games-symbol",
];

const letterSrsModes = (prefix) => [
  `${prefix}-typing-names`,
  `${prefix}-typing-symbol`, // (the old keyboard-shortcut option; kept so earlier practice still counts)
  `${prefix}-typing-form`,
  `${prefix}-flashcards`,
  `${prefix}-games-names`,
  `${prefix}-games-symbol`,
];
const CONSONANT_SRS_MODES = letterSrsModes("consonant");
const VOWEL_SRS_MODES = letterSrsModes("vowel");

/** The quizzes whose scores are kept (the Bible pages keep theirs under their own page names). */
const FOUNDATION_QUIZ_MODES = ["parsing", "construction", "vocab-typing", "accent-typing", "consonant-typing", "vowel-typing"];
const ALL_QUIZ_MODES = [...FOUNDATION_QUIZ_MODES, ...BIBLE_PAGES.map((p) => p.page)];

/** A quiz at or above this score is a "pass". */
export const PASS_SCORE = 80;

// --- Where each badge's "Go" button leads ---
// (Every badge names the page where its progress is made; a few work it out from what you have done so far.)

const bibleGroupTitle = { marks: "Pointing Pro", words: "Word Wise", prefixes: "Prefix Pro", verbs: "Verb Voyager" };

export const BADGES = [];

/**
 * Adds a badge.
 *   id, section, icon, title
 *   tiers      [bronze, silver, gold] targets (numbers), or null for a one-level badge (then `target`)
 *   ids        optional: the ids of the levels, to keep earlier ids (otherwise "<id>:bronze" …)
 *   unit       what the numbers count ("%", "words"…), shown after a progress figure
 *   desc       (target, tierIndex) -> text for that level
 *   progress   (ctx) -> number
 *   page       a route name, or (ctx) -> route name: where the "Go" button leads
 *   hidden     a secret badge: shown only as a mystery until earned
 */
function badge(def) {
  BADGES.push(def);
  return def;
}

// ---- Consistency ----
badge({
  id: "streak-first", section: "Consistency", icon: "🔥", title: "First Steps", tiers: null, target: 1, ids: ["streak-1"],
  desc: () => "Practice on any day", progress: (ctx) => ctx.longestStreak, page: "daily-challenge",
});
badge({
  id: "streak", section: "Consistency", icon: "🔥", title: "Streak", tiers: [3, 7, 30], ids: ["streak-3", "streak-7", "streak-30"], unit: "days",
  desc: (t) => `Reach a ${t}-day streak`, progress: (ctx) => ctx.longestStreak, page: "daily-challenge",
});

// ---- Mastery (what you actually know) ----
badge({
  id: "vocab-mastery", section: "Vocabulary Mastery", icon: "📖", title: "Vocabulary Mastery", tiers: [10, 50, 150], ids: ["vocab-mastery-10", "vocab-mastery-50", "vocab-mastery-150"], unit: "words",
  desc: (t) => `Master ${t} vocabulary words`, progress: (ctx) => ctx.masteredVocab, page: "vocab-flashcards",
});
badge({
  id: "verb-mastery", section: "Verb Mastery", icon: "📜", title: "Verb Mastery", tiers: [10, 50, 150], ids: ["verb-mastery-10", "verb-mastery-50", "verb-mastery-150"], unit: "forms",
  desc: (t) => `Master ${t} verb forms`, progress: (ctx) => ctx.masteredVerbs, page: "parsing",
});
badge({
  id: "accent-mastery", section: "Accents Mastery", icon: "🎵", title: "Accent Mastery", tiers: [10, 25, (ctx) => ctx.totals.accents], ids: ["accent-mastery-10", "accent-mastery-25", "accent-mastery-all"], unit: "accents",
  desc: (t, i, ctx) => (i === 2 ? `Master all ${t} accents` : `Master ${t} accents`), progress: (ctx) => ctx.masteredAccents, page: "accent-flashcards",
});
badge({
  id: "consonant-mastery", section: "Consonants Mastery", icon: "🔤", title: "Alef-Bet Mastery", tiers: [10, 20, (ctx) => ctx.totals.consonants], ids: ["consonant-mastery-10", "consonant-mastery-20", "consonant-mastery-all"], unit: "consonants",
  desc: (t, i) => (i === 2 ? `Master all ${t} consonants` : `Master ${t} consonants`), progress: (ctx) => ctx.masteredConsonants, page: "consonant-flashcards",
});
badge({
  id: "vowel-mastery", section: "Vowels Mastery", icon: "🔡", title: "Vowel Mastery", tiers: [6, 12, (ctx) => ctx.totals.vowels], ids: ["vowel-mastery-6", "vowel-mastery-12", "vowel-mastery-all"], unit: "vowels",
  desc: (t, i) => (i === 2 ? `Master all ${t} vowels` : `Master ${t} vowels`), progress: (ctx) => ctx.masteredVowels, page: "vowel-flashcards",
});

// ---- Quizzes (passing, not just taking) ----
badge({
  id: "quiz-pass", section: "Quizzes", icon: "📝", title: "Quiz Passer", tiers: [1, 10, 30], ids: ["quizpass-1", "quizpass-10", "quizpass-30"], unit: "quizzes",
  desc: (t) => `Score ${PASS_SCORE}% or better on ${t === 1 ? "a quiz" : `${t} quizzes`}`, progress: (ctx) => ctx.passedQuizzes, page: "parsing",
});
badge({
  id: "quiz-perfect-tier", section: "Quizzes", icon: "💯", title: "Perfectionist", tiers: [1, 5, 15], ids: ["quiz-perfect", "quizperfect-5", "quizperfect-15"], unit: "quizzes",
  desc: (t) => `Score 100% on ${t === 1 ? "a quiz" : `${t} quizzes`}`, progress: (ctx) => ctx.perfectQuizzes, page: "parsing",
});

// ---- Organization ----
badge({
  id: "org-custom", section: "Organization", icon: "🗂️", title: "Organizer", tiers: [1, 3, 5], ids: ["org-custom-category", "org-custom-category-3", "org-custom-category-5"], unit: "categories",
  desc: (t) => `Create ${t === 1 ? "a custom category" : `${t} custom categories`}`, progress: (ctx) => ctx.customCategories, page: "vocabulary",
});
badge({
  id: "org-catalog", section: "Organization", icon: "🗂️", title: "Cataloger", tiers: [10, 25, 50], ids: ["org-cataloger-10", "org-cataloger-25", "org-cataloger"], unit: "words",
  desc: (t) => `Put ${t} words into categories yourself`, progress: (ctx) => ctx.categorizedWords, page: "vocabulary",
});

// ---- Games: one badge per area; each level is how many of its five games you have beaten the target in ----
const gameSets = [
  { key: "vocab", Name: "Vocabulary", icon: "🎮", page: "vocab-games", sprint: 10, clock: 30, lightning: 12, sort: 10, scores: (ctx) => ctx.gameScores, names: ["hebrew", "english"] },
  { key: "accent", Name: "Accents", icon: "🎮", page: "accent-games", sprint: 10, clock: 20, lightning: 10, sort: 10, scores: (ctx) => ctx.accentGameScores, names: ["names", "symbol"] },
  { key: "consonant", Name: "Consonants", icon: "🎮", page: "consonant-games", sprint: 10, clock: 20, lightning: 10, sort: 10, scores: (ctx) => ctx.consonantGameScores, names: ["names", "symbol"] },
  { key: "vowel", Name: "Vowels", icon: "🎮", page: "vowel-games", sprint: 10, clock: 20, lightning: 10, sort: 10, scores: (ctx) => ctx.vowelGameScores, names: ["names", "symbol"] },
];
/** How many of an area's five games have reached their target score (0–5). */
export function gamesBeaten(g, ctx) {
  const sc = g.scores(ctx) || {};
  const best = (game) => Math.max(...g.names.map((n) => sc[`${game}-${n}`] ?? 0), 0);
  let n = 0;
  if (best("sprint") >= g.sprint) n++;
  if (best("clock") >= g.clock) n++;
  if (best("lightning") >= g.lightning) n++;
  if ((sc["sort"] ?? 0) >= g.sort) n++;
  if (Object.keys(sc).some((k) => k.startsWith("memory-"))) n++;
  return n;
}
for (const g of gameSets) {
  badge({
    id: `${g.key}-games`, section: "Games", icon: g.icon, title: `${g.Name} Games`, tiers: [1, 3, 5], unit: "of 5 games",
    desc: (t) => `Reach the target score in ${t === 5 ? "all 5" : t} of the 5 ${g.Name} games (Survival Sprint ${g.sprint}, Beat the Clock ${g.clock}, Lightning Round ${g.lightning}, Sort ${g.sort}, finish a Memory Match)`,
    progress: (ctx) => gamesBeaten(g, ctx), page: g.page,
  });
}

// ---- Daily Challenge ----
badge({
  id: "daily-days", section: "Daily Challenge", icon: "📅", title: "Daily Challenger", tiers: [1, 7, 30], ids: ["daily-first", "daily-week", "daily-month"], unit: "days",
  desc: (t) => (t === 1 ? "Finish your first Daily Challenge" : `Finish the Daily Challenge on ${t} different days`), progress: (ctx) => ctx.dailyStats.days, page: "daily-challenge",
});
badge({
  id: "daily-run", section: "Daily Challenge", icon: "🔁", title: "On a Roll", tiers: [3, 7, 14], ids: ["daily-run-3", "daily-run-7", "daily-run-14"], unit: "days in a row",
  desc: (t) => `Finish the Daily Challenge ${t} days in a row`, progress: (ctx) => ctx.dailyStats.bestRun, page: "daily-challenge",
});
badge({
  id: "daily-flawless", section: "Daily Challenge", icon: "💯", title: "Flawless", tiers: [1, 3, 10], ids: ["daily-perfect", "daily-perfect-3", "daily-perfect-10"], unit: "days",
  desc: (t) => `Get every question right in a Daily Challenge${t === 1 ? "" : ` on ${t} days`}`, progress: (ctx) => ctx.dailyStats.perfectDays, page: "daily-challenge",
});
badge({
  id: "daily-stars", section: "Daily Challenge", icon: "🌟", title: "Star Collector", tiers: [3, 10, 25], ids: ["daily-stars-3", "daily-stars", "daily-stars-25"], unit: "days",
  desc: (t) => `Earn 3 stars on ${t} different days`, progress: (ctx) => ctx.dailyStats.threeStarDays, page: "daily-challenge",
});
badge({
  id: "daily-hard", section: "Daily Challenge", icon: "⌨️", title: "Hard Mode", tiers: [1, 5, 15], ids: ["daily-hard-1", "daily-hard", "daily-hard-15"], unit: "days",
  desc: (t) => `Finish the Daily Challenge in Hard mode on ${t} ${t === 1 ? "day" : "days"}`, progress: (ctx) => ctx.dailyStats.hardDays, page: "daily-challenge",
});

// ---- Bible in Context: one badge per page (pass at 80%, 90%, 100%), one per group, one for all 15 ----
const bestOf = (ctx, page) => ctx.bibleBest[page] ?? 0;
const worst = (ctx, pages) => (pages.length ? Math.min(...pages.map((p) => bestOf(ctx, p))) : 0);
const nextToImprove = (ctx, pages) => {
  const list = pages.slice().sort((a, b) => bestOf(ctx, a) - bestOf(ctx, b));
  return list[0];
};

for (const p of BIBLE_PAGES) {
  badge({
    id: `bible-page-${p.page}`, section: "Bible in Context", icon: "📜", title: p.label, tiers: [80, 90, 100], unit: "%",
    desc: (t) => `Score ${t}% or better on the ${p.label} quiz`, progress: (ctx) => bestOf(ctx, p.page), page: p.page,
  });
}
for (const g of BIBLE_GROUPS) {
  if (g.pages.length < 2) continue; // a group of one page is that page's own badge
  const pages = g.pages.map((p) => p.page);
  badge({
    id: `bible-group-${g.id}`, section: "Bible in Context", icon: "🏛️", title: bibleGroupTitle[g.id] || g.title, tiers: [80, 90, 100], unit: "% on every page",
    desc: (t) => `Score ${t}% or better on every ${g.title} page (${g.pages.map((p) => p.label).join(", ")})`,
    progress: (ctx) => worst(ctx, pages), page: (ctx) => nextToImprove(ctx, pages),
  });
}
badge({
  id: "bible-all", section: "Bible in Context", icon: "👑", title: "Context Champion", tiers: [80, 90, 100], unit: "% on every page",
  desc: (t) => `Score ${t}% or better on all ${BIBLE_PAGES.length} Bible in Context pages`,
  progress: (ctx) => worst(ctx, BIBLE_PAGES.map((p) => p.page)), page: (ctx) => nextToImprove(ctx, BIBLE_PAGES.map((p) => p.page)),
});

// ---- Reading ----
badge({
  id: "reading-verses", section: "Reading", icon: "📚", title: "Reader", tiers: [5, 25, 100], unit: "verses",
  desc: (t) => `Mark ${t} different verses as read on the Reading page`, progress: (ctx) => ctx.reading.verses, page: "bible-reading",
});
badge({
  id: "reading-streak", section: "Reading", icon: "🕯️", title: "Daily Reader", tiers: [3, 7, 30], unit: "days in a row",
  desc: (t) => `Read a verse on ${t} days in a row`, progress: (ctx) => ctx.reading.best, page: "bible-reading",
});

// ---- Comebacks (recovery counts as much as streaks) ----
badge({
  id: "comeback-break", section: "Comebacks", icon: "🌱", title: "Welcome Back", tiers: [7, 14, 30], unit: "days away",
  desc: (t) => `Come back and practise after being away for ${t} days or more`, progress: (ctx) => ctx.longestBreakReturned, page: "daily-challenge",
});
badge({
  id: "comeback-turnaround", section: "Comebacks", icon: "📈", title: "Turnaround", tiers: [1, 3, 6], unit: "quizzes turned around",
  desc: (t) => `Raise a quiz score by 20 points or more after a score under ${PASS_SCORE}% — on ${t === 1 ? "one quiz" : `${t} different quizzes`}`,
  progress: (ctx) => ctx.turnarounds, page: (ctx) => ctx.weakestQuizPage || "daily-challenge",
});

// ---- Your path: four chapters, each unlocking a note about what you can now do ----
export const CHAPTERS = [
  {
    id: "path-letters", number: 1, title: "Letters", icon: "🔤", page: "consonant-flashcards",
    goal: (ctx) => `Master all ${ctx.totals.consonants} consonants`, target: (ctx) => ctx.totals.consonants, progress: (ctx) => ctx.masteredConsonants,
    note: "You can now recognise and name every letter of the alef-bet.",
  },
  {
    id: "path-vowels", number: 2, title: "Vowels", icon: "🔡", page: "vowel-flashcards",
    goal: (ctx) => `Master all ${ctx.totals.vowels} vowels`, target: (ctx) => ctx.totals.vowels, progress: (ctx) => ctx.masteredVowels,
    note: "You can now sound out any pointed word.",
  },
  {
    id: "path-words", number: 3, title: "Words", icon: "📖", page: "vocab-flashcards",
    goal: () => "Master 150 vocabulary words", target: () => 150, progress: (ctx) => ctx.masteredVocab,
    note: "You now know enough everyday vocabulary to recognise many of the words you meet in a verse.",
  },
  {
    id: "path-reading", number: 4, title: "Reading", icon: "📜", page: (ctx) => nextToImprove(ctx, BIBLE_PAGES.map((p) => p.page)) || "bible-article",
    goal: () => `Pass all ${BIBLE_PAGES.length} Bible in Context pages`, target: () => BIBLE_PAGES.length, progress: (ctx) => ctx.biblePassed,
    note: "You can now take apart a verse of Genesis and say what each piece of each word is doing.",
  },
];
for (const c of CHAPTERS) {
  badge({
    id: c.id, section: "Your Path", icon: c.icon, title: `Chapter ${c.number}: ${c.title}`, tiers: null, target: (ctx) => c.target(ctx), chapter: c,
    desc: (t, i, ctx) => `${c.goal(ctx)}. ${c.note}`, progress: c.progress, page: c.page,
  });
}

// ---- Secret badges: a few surprises, shown as a mystery until earned ----
badge({
  id: "secret-pausal", section: "Secret Badges", icon: "🕊️", title: "Pausal Pro", tiers: null, target: 1, hidden: true,
  desc: () => "Get every Pausal Lengthening example in the Definite Article page right", progress: (ctx) => ctx.secretFlags.pausal, page: "bible-article",
});
badge({
  id: "secret-needle", section: "Secret Badges", icon: "🔍", title: "Needle in a Haystack", tiers: null, target: 1, hidden: true,
  desc: () => "Find every example of three different rare patterns in Genesis", progress: (ctx) => (ctx.secretFlags.rarePatterns >= 3 ? 1 : 0), page: "bible-article",
});
badge({
  id: "secret-hattrick", section: "Secret Badges", icon: "🎩", title: "Hat Trick", tiers: null, target: 1, hidden: true,
  desc: () => "Score 100% on three quizzes in a row", progress: (ctx) => (ctx.secretFlags.perfectRun >= 3 ? 1 : 0), page: "parsing",
});
badge({
  id: "secret-earlybird", section: "Secret Badges", icon: "🐦", title: "Early Bird", tiers: null, target: 1, hidden: true,
  desc: () => "Finish a quiz between 4 and 7 in the morning", progress: (ctx) => (ctx.secretFlags.earlyBird ? 1 : 0), page: "daily-challenge",
});

// ---------------------------------------------------------------------------------------------
// Flattening: every level of every badge as an "achievement" (what unlock notices and the tests read)
// ---------------------------------------------------------------------------------------------

/** The target of one level of a badge, given the numbers it may depend on (e.g. "all 34 consonants"). */
export function levelTarget(b, i, ctx = defaultTotalsCtx()) {
  if (b.tiers) {
    const t = b.tiers[i];
    return typeof t === "function" ? t(ctx) : t;
  }
  return typeof b.target === "function" ? b.target(ctx) : b.target;
}

function defaultTotalsCtx() {
  return { totals: computeTotals() };
}

export const ACHIEVEMENTS = [];
for (const b of BADGES) {
  const count = b.tiers ? b.tiers.length : 1;
  for (let i = 0; i < count; i++) {
    const id = b.ids ? b.ids[i] : b.tiers ? `${b.id}:${TIER_NAMES[i].toLowerCase()}` : b.id;
    ACHIEVEMENTS.push({
      id,
      badgeId: b.id,
      tier: b.tiers ? i : null,
      tierName: b.tiers ? TIER_NAMES[i] : null,
      section: b.section,
      icon: b.icon,
      title: b.tiers ? `${b.title} · ${TIER_NAMES[i]}` : b.title,
      hidden: !!b.hidden,
      // targets and descriptions can depend on how big a data set is, so they are worked out when asked
      get target() {
        return levelTarget(b, i);
      },
      get desc() {
        return b.desc(levelTarget(b, i), i, defaultTotalsCtx());
      },
      progress: (ctx) => b.progress(ctx),
      page: b.page,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Context: every number the badges read, worked out once per look
// ---------------------------------------------------------------------------------------------

function computeTotals() {
  const count = (fn, fallback) => {
    try {
      const n = fn().length;
      return n > 0 ? n : fallback;
    } catch (e) {
      return fallback;
    }
  };
  return {
    consonants: count(getConsonantRows, 34),
    vowels: count(getVowelRows, 16),
    accents: count(getAccentRows, 51),
  };
}

const ymdToNum = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86400000);

/** The longest stretch of days with no practice that you then came back from: days away (0 if you never took a break). */
export function longestBreakReturned(activityLog) {
  const days = Object.keys(activityLog || {})
    .filter((d) => activityLog[d] > 0)
    .sort();
  let longest = 0;
  for (let i = 1; i < days.length; i++) {
    const away = ymdToNum(days[i]) - ymdToNum(days[i - 1]) - 1; // whole days with nothing in between
    if (away > longest) longest = away;
  }
  return longest;
}

/** How many quizzes show a turnaround: a score 20 or more points above an earlier score that was under the pass mark. */
export function countTurnarounds(scoresByMode) {
  let n = 0;
  for (const scores of scoresByMode) {
    let turned = false;
    for (let i = 0; i < scores.length && !turned; i++) {
      if (scores[i] >= PASS_SCORE) continue;
      for (let j = i + 1; j < scores.length; j++) {
        if (scores[j] - scores[i] >= 20) {
          turned = true;
          break;
        }
      }
    }
    if (turned) n += 1;
  }
  return n;
}

export function buildContext() {
  const streak = getStreakInfo();
  const masteredVocab = getMasteredKeyCount(VOCAB_SRS_MODES);
  const masteredVerbs = getMasteredKeyCount(VERB_SRS_MODES);
  const masteredAccents = getMasteredKeyCount(ACCENT_SRS_MODES);
  const masteredConsonants = getMasteredKeyCount(CONSONANT_SRS_MODES);
  const masteredVowels = getMasteredKeyCount(VOWEL_SRS_MODES);

  let passedQuizzes = 0;
  let perfectQuizzes = 0;
  const everyQuiz = []; // { t, percent }
  const scoresByMode = []; // oldest first, for each quiz taken at all
  let weakestQuizPage = null;
  for (const mode of ALL_QUIZ_MODES) {
    const hist = loadHistory(mode); // newest first
    passedQuizzes += hist.filter((h) => h.percent >= PASS_SCORE).length;
    perfectQuizzes += hist.filter((h) => h.percent === 100).length;
    for (const h of hist) everyQuiz.push({ t: h.timestamp || 0, percent: h.percent });
    if (hist.length) scoresByMode.push(hist.map((h) => h.percent).reverse());
  }
  const turnarounds = countTurnarounds(scoresByMode);

  // "Hat Trick" and "Early Bird" read the quiz times.
  everyQuiz.sort((a, b) => a.t - b.t);
  let run = 0;
  let perfectRun = 0;
  let earlyBird = false;
  for (const q of everyQuiz) {
    run = q.percent === 100 ? run + 1 : 0;
    perfectRun = Math.max(perfectRun, run);
    if (q.t) {
      const hour = new Date(q.t).getHours();
      if (hour >= 4 && hour < 7) earlyBird = true;
    }
  }

  const bible = getAllBibleStats();
  const bibleBest = {};
  for (const p of bible) bibleBest[p.page] = p.best ?? 0;
  const biblePassed = bible.filter((p) => p.passed).length;
  const weakPages = bible.filter((p) => p.attempts > 0 && p.latest < PASS_SCORE).sort((a, b) => a.latest - b.latest);
  weakestQuizPage = weakPages.length ? weakPages[0].page : null;

  const secrets = getSecrets();
  const rare = secrets.rare || {};
  const rareDone = Object.values(rare).filter((r) => r.total > 0 && r.keys.length >= r.total).length;
  const pausal = rare["bible-article:pausal"];

  // Words the learner put into a category themselves — the dataset's own categories do not count.
  const allVocabRows = getVocabRows();
  const categorizedWords = allVocabRows.filter((r) => hasCategoryOverride(r) && getCategoriesForRow(r).length > 0).length;
  const customCategories = getCustomCategoryCount();

  const gameScores = getAllHighScores();
  const accentGameScores = getAllAccentHighScores();

  return {
    dailyStats: getDailyStats(),
    longestStreak: streak.longestStreak,
    masteredVocab,
    masteredVerbs,
    masteredAccents,
    masteredConsonants,
    masteredVowels,
    consonantGameScores: getAllConsonantHighScores(),
    vowelGameScores: getAllVowelHighScores(),
    passedQuizzes,
    perfectQuizzes,
    totalQuizzes: everyQuiz.length,
    categorizedWords,
    customCategories,
    gameScores,
    accentGameScores,
    hasMemoryScore: Object.keys(gameScores).some((k) => k.startsWith("memory-")),
    hasAccentMemoryScore: Object.keys(accentGameScores).some((k) => k.startsWith("memory-")),
    totals: computeTotals(),
    bibleBest,
    biblePassed,
    reading: getReadingStats(),
    longestBreakReturned: longestBreakReturned(getActivityLog()),
    turnarounds,
    weakestQuizPage,
    secretFlags: {
      pausal: pausal && pausal.total > 0 && pausal.keys.length >= pausal.total ? 1 : 0,
      rarePatterns: rareDone,
      perfectRun,
      earlyBird,
    },
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

    if (a.hidden && current < a.target) continue; // a secret badge says nothing until it is earned

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

// ---------------------------------------------------------------------------------------------
// What each badge looks like right now
// ---------------------------------------------------------------------------------------------

/** The badge as a learner sees it: its levels, which are earned, and the next one to aim for. */
export function badgeStatus(b, ctx) {
  const current = Math.max(0, Number(b.progress(ctx)) || 0);
  const count = b.tiers ? b.tiers.length : 1;
  const levels = [];
  for (let i = 0; i < count; i++) {
    const target = levelTarget(b, i, ctx);
    levels.push({ index: i, name: b.tiers ? TIER_NAMES[i] : null, icon: b.tiers ? TIER_ICONS[i] : null, target, earned: target > 0 && current >= target });
  }
  const next = levels.find((l) => !l.earned) || null;
  return {
    badge: b,
    current,
    levels,
    earnedCount: levels.filter((l) => l.earned).length,
    next,
    complete: !next,
    page: typeof b.page === "function" ? b.page(ctx) : b.page,
  };
}

/**
 * The three badges closest to their next level — each with the page that earns it:
 *   [{ id, badgeId, icon, title, desc, progress, target, ratio, unit, page }]
 * Only badges with some progress are listed, secret badges never are, and each badge appears once (its next level).
 */
export function getNextBadgeSteps(limit = 3, ctx = buildContext()) {
  const out = [];
  for (const b of BADGES) {
    if (b.hidden) continue;
    const st = badgeStatus(b, ctx);
    if (!st.next) continue;
    const ratio = Math.min(1, st.current / st.next.target);
    if (ratio <= 0) continue;
    out.push({
      id: b.ids ? b.ids[st.next.index] : b.tiers ? `${b.id}:${TIER_NAMES[st.next.index].toLowerCase()}` : b.id,
      badgeId: b.id,
      icon: b.icon,
      title: b.tiers ? `${b.title} · ${st.next.name}` : b.title,
      desc: b.desc(st.next.target, st.next.index, ctx),
      progress: Math.min(st.current, st.next.target),
      target: st.next.target,
      ratio,
      unit: b.unit || "",
      page: st.page,
    });
  }
  out.sort((a, b) => b.ratio - a.ratio || a.target - b.target);
  return out.slice(0, limit);
}

/** The four chapters of the path, with how far along each is and whether its note is unlocked. */
export function getPathStatus(ctx = buildContext()) {
  let currentFound = false;
  return CHAPTERS.map((c) => {
    const target = c.target(ctx);
    const progress = Math.min(c.progress(ctx), target);
    const done = target > 0 && progress >= target;
    const isCurrent = !done && !currentFound;
    if (isCurrent) currentFound = true;
    return { id: c.id, number: c.number, title: c.title, icon: c.icon, goal: c.goal(ctx), note: c.note, progress, target, done, current: isCurrent, page: typeof c.page === "function" ? c.page(ctx) : c.page };
  });
}

export function mount({ content, sidebarExtra, navigate }) {
  sidebarExtra.innerHTML = "";
  render(content, navigate);
}

export function unmount() {}

const h = (tag, className, html) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function goButton(page, label = "Go") {
  const btn = h("button", "btn btn-sm btn-outline badge-go", escapeHtml(label));
  btn.type = "button";
  btn.dataset.goto = page;
  return btn;
}

function renderBadgeCard(b, ctx) {
  const st = badgeStatus(b, ctx);
  const card = h("div", "achievement-card badge-card " + (st.complete ? "achievement-unlocked" : "achievement-locked"));
  card.dataset.badge = b.id;

  if (b.hidden && st.earnedCount === 0) {
    card.classList.add("badge-secret");
    card.innerHTML = `<div class="achievement-top"><div class="achievement-icon">🔒</div><div class="achievement-title">Secret badge</div></div>
      <div class="achievement-desc">Hidden until you earn it. Keep practising and one may appear.</div>`;
    return card;
  }

  const top = h("div", "achievement-top");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.gap = "8px";
  top.appendChild(h("div", "achievement-icon", escapeHtml(b.icon)));
  top.appendChild(h("div", "achievement-title", escapeHtml(b.title)));
  if (b.tiers) {
    const medals = h("span", "badge-medals");
    medals.style.marginLeft = "auto";
    medals.innerHTML = st.levels
      .map((l) => `<span class="badge-medal${l.earned ? " is-earned" : ""}" title="${l.name}: ${escapeHtml(b.desc(l.target, l.index, ctx))}${l.earned ? " (earned)" : ""}">${l.icon}</span>`)
      .join("");
    top.appendChild(medals);
  } else if (st.complete) {
    const pill = h("span", "pill pill-good", "Unlocked");
    pill.style.marginLeft = "auto";
    top.appendChild(pill);
  }
  card.appendChild(top);

  const target = st.next ? st.next : st.levels[st.levels.length - 1];
  const descText = b.desc(target.target, target.index, ctx);
  card.appendChild(h("div", "achievement-desc", escapeHtml(st.complete && b.tiers ? `${descText} — all levels earned` : descText)));

  if (!st.complete) {
    const shown = Math.min(st.current, st.next.target);
    const bar = h("div", "progress-bar-outer");
    bar.style.marginTop = "6px";
    bar.innerHTML = `<div class="progress-bar-inner" style="width:${Math.min(100, (shown / st.next.target) * 100)}%"></div>`;
    card.appendChild(bar);
    const unit = b.unit ? ` ${escapeHtml(b.unit)}` : "";
    card.appendChild(h("div", "caption", `${shown} / ${st.next.target}${unit}${b.tiers ? ` toward ${st.next.name}` : ""}`));
    if (st.page && !b.hidden) card.appendChild(goButton(st.page));
  } else if (b.chapter) {
    card.appendChild(h("div", "caption", escapeHtml(b.chapter.note)));
  }
  return card;
}

function renderPath(content, ctx) {
  const path = getPathStatus(ctx);
  const box = h("div", "info-box badge-path");
  box.appendChild(h("h3", "", "Your path"));
  box.appendChild(h("p", "caption", "Four chapters, one after the other. Finish a chapter to unlock a note about what you can now do."));
  const list = h("ol", "badge-path-list");
  for (const c of path) {
    const li = h("li", `badge-chapter${c.done ? " is-done" : ""}${c.current ? " is-current" : ""}`);
    li.dataset.chapter = c.id;
    const pct = c.target ? Math.round((c.progress / c.target) * 100) : 0;
    li.innerHTML = `<div class="badge-chapter-head"><span class="achievement-icon">${escapeHtml(c.icon)}</span>
        <b>Chapter ${c.number}: ${escapeHtml(c.title)}</b>
        ${c.done ? `<span class="pill pill-good">Done</span>` : c.current ? `<span class="pill pill-warn">Now</span>` : ""}</div>
      <div class="caption">${escapeHtml(c.goal)}${c.done ? "" : ` — ${c.progress} / ${c.target}`}</div>
      <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${pct}%"></div></div>
      ${c.done ? `<div class="badge-chapter-note">✓ ${escapeHtml(c.note)}</div>` : ""}`;
    if (c.current && c.page) li.appendChild(goButton(c.page, `Work on ${c.title}`));
    list.appendChild(li);
  }
  box.appendChild(list);
  content.appendChild(box);
}

/**
 * The Achievements content (summary, your path, the next three, and every badge), without a page title —
 * so it can sit inside the My Progress "Achievements" tab. `navigate` makes the "Go" buttons work.
 */
export function renderAchievementsInto(content, navigate = null) {
  const ctx = buildContext();
  const wrapper = h("div", "badges-root");

  const earned = ACHIEVEMENTS.filter((a) => a.progress(ctx) >= a.target && a.target > 0);
  const visible = ACHIEVEMENTS.filter((a) => !a.hidden || a.progress(ctx) >= a.target);
  const goldBadges = BADGES.filter((b) => !b.hidden && badgeStatus(b, ctx).complete).length;
  const visibleBadges = BADGES.filter((b) => !b.hidden).length;
  const secretsFound = BADGES.filter((b) => b.hidden && badgeStatus(b, ctx).complete).length;
  const secretsTotal = BADGES.filter((b) => b.hidden).length;

  wrapper.appendChild(
    h("p", "caption", "Badges for what you can do, not just how much you click: mastering letters, passing Bible pages, coming back after a break. Most badges have Bronze, Silver and Gold levels.")
  );

  const summaryBox = h("div", "info-box");
  summaryBox.innerHTML = `<b>${earned.length} / ${visible.length} levels earned</b> <span class="caption">· ${goldBadges} of ${visibleBadges} badges complete · ${secretsFound} of ${secretsTotal} secret badges found</span>`;
  const summaryBar = h("div", "progress-bar-outer");
  summaryBar.style.marginTop = "8px";
  summaryBar.innerHTML = `<div class="progress-bar-inner" style="width:${(earned.length / Math.max(1, visible.length)) * 100}%"></div>`;
  summaryBox.appendChild(summaryBar);
  wrapper.appendChild(summaryBox);

  renderPath(wrapper, ctx);

  const next = getNextBadgeSteps(3, ctx);
  if (next.length > 0) {
    wrapper.appendChild(h("h3", "", "Next three"));
    const grid = h("div", "achievement-grid badge-next");
    for (const n of next) {
      const card = h("div", "achievement-card achievement-locked");
      card.innerHTML = `<div class="achievement-top" style="display:flex;align-items:center;gap:8px"><div class="achievement-icon">${escapeHtml(n.icon)}</div><div class="achievement-title">${escapeHtml(n.title)}</div></div>
        <div class="achievement-desc">${escapeHtml(n.desc)}</div>
        <div class="progress-bar-outer" style="margin-top:6px"><div class="progress-bar-inner" style="width:${Math.round(n.ratio * 100)}%"></div></div>
        <div class="caption">${n.progress} / ${n.target}${n.unit ? " " + escapeHtml(n.unit) : ""}</div>`;
      if (n.page) card.appendChild(goButton(n.page));
      grid.appendChild(card);
    }
    wrapper.appendChild(grid);
  }

  const sections = [...new Set(BADGES.filter((b) => b.section !== "Your Path" && b.section !== "Secret Badges").map((b) => b.section))];
  for (const section of sections) {
    wrapper.appendChild(h("h3", "", escapeHtml(section)));
    const grid = h("div", "achievement-grid");
    for (const b of BADGES.filter((x) => x.section === section)) grid.appendChild(renderBadgeCard(b, ctx));
    wrapper.appendChild(grid);
  }
  wrapper.appendChild(h("h3", "", "Secret Badges"));
  const secretGrid = h("div", "achievement-grid");
  for (const b of BADGES.filter((x) => x.hidden)) secretGrid.appendChild(renderBadgeCard(b, ctx));
  wrapper.appendChild(secretGrid);

  if (navigate) {
    wrapper.querySelectorAll("[data-goto]").forEach((btn) => btn.addEventListener("click", () => navigate(btn.dataset.goto)));
  }
  content.appendChild(wrapper);
}

function render(content, navigate) {
  content.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.innerHTML = `<h1 class="page-title">Achievements</h1>`;
  content.appendChild(wrap);
  renderAchievementsInto(content, navigate);

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => navigate("home"));
  content.appendChild(homeBtn);
}
