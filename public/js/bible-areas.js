// The Bible in Context pages as one study area: which pages exist, how they are grouped (the same four
// groups as the sidebar), and how far along each one is. Home, My Progress and the Daily Challenge all
// read from here, so a new page only has to be added in one place.
//
// What "progress" means here: every answer on a Bible page (guided passage or pattern quiz) is also saved
// as a spaced-repetition result for that one verse and word, under the mode "bible:<page>". An item is
// "mastered" at the top Leitner box, like everywhere else. Quiz scores come from the quiz history.

import { loadHistory } from "./history.js";
import { getScheduleEntries, getScheduleSummary } from "./srs.js";

/** The groups, in the order the sidebar shows them. */
export const BIBLE_GROUPS = [
  {
    id: "marks",
    title: "Marks & Syllables",
    pages: [
      { page: "bible-dagesh", label: "Dagesh" },
      { page: "bible-qames", label: "Qameṣ vs Qameṣ-ḥaṭuf" },
      { page: "bible-sheva", label: "Shevas" },
      { page: "bible-syllable", label: "Syllables & Stress" },
    ],
  },
  {
    id: "words",
    title: "Words",
    pages: [
      { page: "bible-noun", label: "Nouns" },
      { page: "bible-pronoun", label: "Independent Personal Pronouns" },
      { page: "bible-demo", label: "Demonstratives" },
      { page: "bible-adj", label: "Adjectives" },
      { page: "bible-suffix", label: "Pronominal Suffixes" },
    ],
  },
  {
    id: "prefixes",
    title: "Prefixes",
    pages: [
      { page: "bible-article", label: "Definite Article" },
      { page: "bible-interrog", label: "Interrogative ה" },
      { page: "bible-prefix", label: "Prefixed Prepositions" },
      { page: "bible-vav", label: "Prefixed Vav" },
      { page: "bible-min", label: "Prefixed מִן" },
    ],
  },
  {
    id: "verbs",
    title: "Verbs",
    pages: [{ page: "bible-verb", label: "Verbs" }],
  },
];

/** All 15 pages, flat, each with its group: [{ page, label, groupId, groupTitle }]. */
export const BIBLE_PAGES = BIBLE_GROUPS.flatMap((g) => g.pages.map((p) => ({ ...p, groupId: g.id, groupTitle: g.title })));

/** A page counts as "passed" once its best quiz score reaches this. */
export const PASS_PERCENT = 80;

/** The spaced-repetition mode for one page's items ("bible-dagesh" -> "bible:dagesh"). */
export const bibleSrsMode = (page) => `bible:${String(page).replace(/^bible-/, "")}`;

/** A stable key for one example: verse, word, and the letter or syllable when the example is one of those. */
export const exampleKey = (ex) => `${ex.ref}#${ex.wi}#${ex.li ?? ex.k ?? ""}`;

/** Every SRS mode used by the Bible pages. */
export const bibleSrsModes = () => BIBLE_PAGES.map((p) => bibleSrsMode(p.page));

/**
 * How far along one page is.
 *   attempts, latest, best, average   from its quiz history (null when never taken)
 *   lastTimestamp                     when the newest quiz was finished
 *   scores                            every kept score, oldest first (up to 20)
 *   trend                             "up" / "down" / "flat" once there are four or more attempts
 *   tracked, mastered, learning       items answered at all / mastered / still being learned
 *   answered, missed                  every answer given, and how many were wrong
 *   passed                            best quiz score is at least PASS_PERCENT
 */
export function getBiblePageStats(page) {
  const history = loadHistory(page); // newest first
  const scores = history.map((h) => h.percent).reverse();
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  let trend = null;
  if (scores.length >= 4) {
    const half = Math.floor(scores.length / 2);
    const diff = mean(scores.slice(-half)) - mean(scores.slice(0, half));
    trend = diff >= 5 ? "up" : diff <= -5 ? "down" : "flat";
  }
  const sched = getScheduleSummary(bibleSrsMode(page));
  let answered = 0;
  let correct = 0;
  for (const e of Object.values(getScheduleEntries(bibleSrsMode(page)))) {
    answered += e.timesSeen || 0;
    correct += e.timesCorrect || 0;
  }
  return {
    page,
    attempts: scores.length,
    latest: scores.length ? scores[scores.length - 1] : null,
    best: scores.length ? Math.max(...scores) : null,
    average: scores.length ? Math.round(mean(scores)) : null,
    lastTimestamp: history.length ? history[0].timestamp : null,
    scores,
    trend,
    tracked: sched.totalTracked,
    mastered: sched.mastered,
    learning: sched.learning,
    answered,
    missed: answered - correct,
    passed: scores.length > 0 && Math.max(...scores) >= PASS_PERCENT,
  };
}

/** Stats for every page: [{ ...page, ...stats }] in sidebar order. */
export function getAllBibleStats() {
  return BIBLE_PAGES.map((p) => ({ ...p, ...getBiblePageStats(p.page) }));
}

/**
 * The whole area at a glance:
 *   pages, practised (quiz taken at least once), passed, mastered items, learning items, answered,
 *   pct (share of pages passed), and next (the page to do next: never practised first, otherwise the one
 *   with the lowest latest score, otherwise the one practised longest ago) — or null if there are no pages.
 */
export function getBibleSummary(all = getAllBibleStats()) {
  const practised = all.filter((p) => p.attempts > 0 || p.tracked > 0);
  const passed = all.filter((p) => p.passed);
  let next = all.find((p) => p.attempts === 0 && p.tracked === 0) || null;
  if (!next) {
    const notPassed = all.filter((p) => !p.passed);
    const pool = notPassed.length ? notPassed : all;
    next = pool.slice().sort((a, b) => (a.latest ?? 101) - (b.latest ?? 101) || (a.lastTimestamp || 0) - (b.lastTimestamp || 0))[0] || null;
  }
  return {
    pages: all.length,
    practised: practised.length,
    passed: passed.length,
    mastered: all.reduce((n, p) => n + p.mastered, 0),
    learning: all.reduce((n, p) => n + p.learning, 0),
    answered: all.reduce((n, p) => n + p.answered, 0),
    pct: all.length ? Math.round((passed.length / all.length) * 100) : 0,
    next,
  };
}

