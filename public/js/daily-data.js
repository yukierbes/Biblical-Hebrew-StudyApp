// Builds and grades the Daily Challenge. No HTML in here — the page
// (pages/daily-challenge.js) draws what this describes.
//
// A round is a list of plain, JSON-able question objects (so an unfinished
// round can be saved and picked up again):
//
//   mc     tap the right answer among 4 choices      (the default way to answer)
//   typed  the same questions typed in              (Hard mode)
//   parse  a verb form: tap its binyan, mode, person, gender, number
//   match  match 3-4 items to their categories (consonant category, vowel class, ...)
//   bible  a verse of Genesis with one word marked and the same answer boxes as its Bible in Context page
//
// Which items come up is personal: due and weak items first, never-seen items
// next, plus a few already-mastered ones slipped in for review. The person
// chooses which areas (Consonants, Vowels, Vocabulary, Verbs, Accents) to pull from.

import { getAreas } from "./home-data.js";
import { getLetterSet } from "./letter-sets.js";
import { sampleN, groupByConjugation, morphKey } from "./helpers.js";
import { sortByPriority, getMasteredKeys, recordItemResult, recordStreakActivity, getDueCount, getScheduleEntries } from "./srs.js";
import { getAvailableDatasets, loadVerbData } from "./data.js";
import { orderedOptionsFromRows } from "./filters.js";
import { MODE_ORDER, PERSON_OPTIONS_NA, GENDER_OPTIONS_NA, NUMBER_OPTIONS_NA } from "./constants.js";
import { isFormAnswerCorrect, isNameCorrect, primaryNameText, primaryAnswerText as primaryFormText, sameFormRows } from "./letter-answer-matching.js";
import {
  isAccentAnswerCorrect,
  isAccentNameCorrect,
  primaryAccentNameText,
  primaryAccentAnswerText,
  sameSymbolAccents,
} from "./accent-answer-matching.js";
import { BIBLE_PAGES, bibleSrsMode, exampleKey, readBibleSchedules } from "./bible-areas.js";
import { loadBibleData, getBibleData } from "./bible-data.js";
import { getPracticeConfig, makeBibleQuestion, noteBibleAnswer } from "./bible-practice.js";
import { prettyRef } from "./bible-text.js";
import { isAnswerCorrect as isVocabAnswerCorrect, primaryAnswerText as vocabAnswerText } from "./vocab-answer-matching.js";

export const PARSE_FIELDS = ["Binyan", "Mode", "Person", "Gender", "Number"];
const OPTIONS_PER_QUESTION = 4;
const MATCH_ITEMS = 4;
const MAX_VERB_QUESTIONS = 3;

const shuffle = (arr) => sampleN(arr, arr.length, false);

// ---------------------------------------------------------------------
// Looking things up
// ---------------------------------------------------------------------

let verbCache = null;
/** All verb forms, and the one-per-parsing list the Parsing page uses. */
function verbData() {
  if (!verbCache) {
    const all = loadVerbData(getAvailableDatasets());
    const grouped = groupByConjugation(all, ["Dataset"]);
    const byKey = new Map(grouped.map((r) => [morphKey(r), r]));
    // Every parsing a given written form can have (a form can fit several).
    const tuples = new Map();
    for (const r of all) {
      const k = `${r.Dataset}||${r.Conjugation}`;
      if (!tuples.has(k)) tuples.set(k, []);
      tuples.get(k).push(r);
    }
    verbCache = { all, grouped, byKey, tuples };
  }
  return verbCache;
}

function areaById(id) {
  return getAreas().find((a) => a.id === id);
}

function poolOf(area) {
  return area.id === "verbs" ? verbData().grouped : area.pool();
}

/** The row for an item, or undefined if it no longer exists. */
export function getRow(areaId, key) {
  if (areaId === "verbs") return verbData().byKey.get(key);
  const area = areaById(areaId);
  return area ? area.pool().find((r) => area.key(r) === key) : undefined;
}

/** Every verb form with the same written form (and verb) as `row` — for the ambiguity hints. */
export function verbSiblings(row) {
  return verbData().tuples.get(`${row.Dataset}||${row.Conjugation}`) || [row];
}

export function parseOptions() {
  const all = verbData().all;
  return {
    Binyan: orderedOptionsFromRows(all, "Binyan"),
    Mode: MODE_ORDER,
    Person: PERSON_OPTIONS_NA,
    Gender: GENDER_OPTIONS_NA,
    Number: NUMBER_OPTIONS_NA,
  };
}

/** Areas that have something to ask about right now. */
export function availableAreaIds() {
  const ids = getAreas()
    .filter((a) => poolOf(a).length > 0)
    .map((a) => a.id);
  // Bible in Context is offered once the Bible pages are loaded in the app.
  if (BIBLE_PAGES.some((p) => getPracticeConfig(p.page))) ids.push("bible");
  return ids;
}

// ---------------------------------------------------------------------
// Bible in Context questions
// ---------------------------------------------------------------------

let biblePlan = []; // the pages whose data is loaded for the round being built

/**
 * Call (and wait for) this before buildChallenge when "bible" is ticked: it loads the data for a few
 * random Bible pages. Returns the settings to build with — without "bible" if the data could not load.
 */
export async function prepareChallenge(settings) {
  const s = { ...settings, areas: [...settings.areas] };
  biblePlan = [];
  if (!s.areas.includes("bible")) return s;
  const want = Math.min(4, Math.max(1, Math.ceil(s.length / s.areas.length)));
  const pages = shuffle(BIBLE_PAGES.filter((p) => getPracticeConfig(p.page))).slice(0, want);
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000));
  await Promise.all(
    pages.map(async (p) => {
      try {
        await Promise.race([loadBibleData(getPracticeConfig(p.page).dataset), timeout]);
        biblePlan.push(p.page);
      } catch (e) {
        /* that page is left out */
      }
    })
  );
  if (biblePlan.length === 0) s.areas = s.areas.filter((a) => a !== "bible");
  return s;
}

/** `k` Bible questions spread over the loaded pages, due and unseen verse-words first. */
function bibleQuestions(k) {
  const pages = shuffle(biblePlan.filter((pg) => getPracticeConfig(pg) && getBibleData(getPracticeConfig(pg).dataset)));
  if (k <= 0 || pages.length === 0) return [];
  const lists = new Map(
    pages.map((pg) => [pg, sortByPriority(bibleSrsMode(pg), getBibleData(getPracticeConfig(pg).dataset).examples, exampleKey)])
  );
  const next = new Map(pages.map((pg) => [pg, 0]));
  const out = [];
  let guard = 0;
  while (out.length < k && guard++ < k * pages.length * 4) {
    const pg = pages[guard % pages.length];
    const i = next.get(pg);
    const list = lists.get(pg);
    if (i >= list.length) continue;
    next.set(pg, i + 1);
    const config = getPracticeConfig(pg);
    try {
      const bq = makeBibleQuestion(config, getBibleData(config.dataset), list[i]);
      out.push({
        type: "bible",
        areaId: "bible",
        key: bq.key,
        page: pg,
        srsMode: bibleSrsMode(pg),
        label: `Bible in Context: ${config.title}`,
        promptText: `${prettyRef(bq.ex.ref)} · ${config.title}`,
        bq,
      });
    } catch (e) {
      /* an odd example is skipped */
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Spaced-repetition modes
// ---------------------------------------------------------------------

function srsModeFor(areaId, direction) {
  if (areaId === "vocabulary") return `vocab-typing-${direction}`;
  if (areaId === "accents") return `accent-typing-${direction === "name" ? "names" : "form"}`;
  const set = getLetterSet(areaId);
  return `${set.srsPrefix}-typing-${direction === "name" ? "names" : "form"}`;
}

function primaryMode(area) {
  if (area.id === "verbs") return "parsing";
  if (area.id === "vocabulary") return "vocab-typing-hebrew";
  if (area.id === "accents") return "accent-typing-names";
  return `${getLetterSet(area.id).srsPrefix}-typing-names`;
}

function matchMode(areaId) {
  if (areaId === "vocabulary") return "vocab-flashcards-hebrew";
  if (areaId === "accents") return "accent-flashcards";
  return `${getLetterSet(areaId).srsPrefix}-flashcards`;
}

// ---------------------------------------------------------------------
// Choosing the items
// ---------------------------------------------------------------------

/**
 * `k` items from an area, personal to this learner: mostly what is due, weak or
 * new, plus a few already-mastered ones (about a quarter, once there are
 * mastered items) so they stay fresh.
 */
function pickItems(area, k) {
  const pool = poolOf(area);
  if (k <= 0 || pool.length === 0) return [];
  const mastered = getMasteredKeys(area.statModes);
  const masteredRows = pool.filter((r) => mastered.has(area.key(r)));

  let reviewN = 0;
  if (masteredRows.length > 0) {
    if (k >= 3) reviewN = Math.max(1, Math.round(k * 0.25));
    else if (k === 2 && Math.random() < 0.25) reviewN = 1;
  }
  reviewN = Math.min(reviewN, masteredRows.length, k - 1 > 0 ? k - 1 : 0);
  const review = sampleN(masteredRows, reviewN, false);
  const used = new Set(review.map(area.key));

  const ordered = sortByPriority(primaryMode(area), pool, area.key).filter((r) => !used.has(area.key(r)) && !mastered.has(area.key(r)));
  const picked = ordered.slice(0, k - review.length);
  for (const r of picked) used.add(area.key(r));

  // Short of fresh/due items (nearly everything mastered): fill with mastered ones.
  if (picked.length + review.length < k) {
    const rest = shuffle(pool.filter((r) => !used.has(area.key(r))));
    picked.push(...rest.slice(0, k - picked.length - review.length));
  }
  return shuffle([...picked, ...review]);
}

/** How many questions each area gets: shared evenly, verbs capped at a few. */
function allocate(areaIds, total) {
  const counts = Object.fromEntries(areaIds.map((id) => [id, 0]));
  const onlyVerbs = areaIds.length === 1 && areaIds[0] === "verbs";
  const cap = onlyVerbs ? total : Math.min(MAX_VERB_QUESTIONS, Math.max(1, Math.round(total * 0.3)));
  const order = shuffle(areaIds);
  let left = total;
  let guard = 0;
  while (left > 0 && guard++ < 1000) {
    let progressed = false;
    for (const id of order) {
      if (left === 0) break;
      if (id === "verbs" && counts.verbs >= cap && order.some((o) => o !== "verbs")) continue;
      counts[id] += 1;
      left -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return counts;
}

// ---------------------------------------------------------------------
// Making questions
// ---------------------------------------------------------------------

const dirLabel = {
  consonants: { name: "Name → Consonant", form: "Consonant → Name" },
  vowels: { name: "Name → Vowel", form: "Vowel → Name" },
  accents: { name: "Name → Accent", form: "Accent → Name" },
  vocabulary: { hebrew: "Hebrew → English", english: "English → Hebrew" },
};
const areaTitle = { consonants: "Consonants", vowels: "Vowels", vocabulary: "Vocabulary", accents: "Accents", verbs: "Verbs", bible: "Bible in Context" };

function randomDirection(areaId) {
  if (areaId === "vocabulary") return Math.random() < 0.5 ? "hebrew" : "english";
  return Math.random() < 0.5 ? "name" : "form";
}

/** The text shown as the prompt (for the end-of-round summary). */
function promptTextOf(areaId, row, direction) {
  if (areaId === "vocabulary") return direction === "hebrew" ? row.Hebrew : row.English;
  if (areaId === "accents") return direction === "form" ? row.Symbol : row.EnglishName;
  return direction === "form" ? row.Form : row.Name;
}

/** Distinct strings to use as wrong answers, never one of `avoid`. */
function pickDistractors(candidates, avoid, n) {
  const seen = new Set(avoid);
  const out = [];
  for (const c of shuffle(candidates)) {
    const t = String(c ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length === n) break;
  }
  return out;
}

/** The right answer and the wrong-answer candidates for a tap-to-answer question. */
function mcParts(areaId, row, direction) {
  if (areaId === "vocabulary") {
    const pool = getAreas().find((a) => a.id === "vocabulary").pool();
    const isSelf = (r) => r.Hebrew === row.Hebrew && r.English === row.English;
    const samePos = pool.filter((r) => r.POS && r.POS === row.POS && !isSelf(r));
    const others = pool.filter((r) => !isSelf(r));
    const field = direction === "hebrew" ? "English" : "Hebrew";
    return { answer: row[field], avoid: [row[field]], candidates: [...samePos.map((r) => r[field]), ...others.map((r) => r[field])], preferred: samePos.map((r) => r[field]) };
  }
  if (areaId === "accents") {
    const pool = getAreas().find((a) => a.id === "accents").pool();
    const same = sameSymbolAccents(row);
    if (direction === "form") {
      const names = same.map((r) => r.EnglishName);
      return { answer: primaryAccentNameText(row), avoid: names, candidates: pool.map((r) => r.EnglishName), preferred: [] };
    }
    return { answer: row.Symbol, avoid: [row.Symbol], candidates: pool.map((r) => r.Symbol), preferred: [] };
  }
  const set = getLetterSet(areaId);
  const pool = set.rows();
  if (direction === "form") {
    const names = sameFormRows(set, row).map((r) => r.Name);
    return { answer: primaryNameText(set, row), avoid: names, candidates: pool.map((r) => r.Name), preferred: [] };
  }
  return { answer: row.Form, avoid: [row.Form], candidates: pool.map((r) => r.Form), preferred: [] };
}

function makeMc(area, row, direction) {
  const { answer, avoid, candidates, preferred } = mcParts(area.id, row, direction);
  const distractors = pickDistractors(preferred, avoid, OPTIONS_PER_QUESTION - 1);
  if (distractors.length < OPTIONS_PER_QUESTION - 1) {
    distractors.push(...pickDistractors(candidates, [...avoid, ...distractors], OPTIONS_PER_QUESTION - 1 - distractors.length));
  }
  if (!answer || distractors.length < 1) return null;
  const q = {
    type: "mc",
    areaId: area.id,
    key: area.key(row),
    direction,
    options: shuffle([answer, ...distractors]),
    answer,
    srsMode: srsModeFor(area.id, direction),
    label: `${areaTitle[area.id]}: ${dirLabel[area.id][direction]}`,
    promptText: promptTextOf(area.id, row, direction),
  };
  return q;
}

function makeTyped(area, row, direction) {
  return {
    type: "typed",
    areaId: area.id,
    key: area.key(row),
    direction,
    srsMode: srsModeFor(area.id, direction),
    label: `${areaTitle[area.id]}: ${dirLabel[area.id][direction]}`,
    promptText: promptTextOf(area.id, row, direction),
  };
}

function makeParse(row) {
  const siblings = verbSiblings(row);
  const seen = new Set();
  const tuples = [];
  for (const r of siblings) {
    const t = PARSE_FIELDS.map((f) => r[f] ?? "");
    const k = t.join("|");
    if (!seen.has(k)) {
      seen.add(k);
      tuples.push(t);
    }
  }
  return {
    type: "parse",
    areaId: "verbs",
    key: morphKey(row),
    tuples,
    srsMode: "parsing",
    label: "Verbs: Parse the form",
    promptText: row.Conjugation,
  };
}

function makeQuestion(area, row, hard, direction) {
  if (area.id === "verbs") return makeParse(row);
  const dir = direction || randomDirection(area.id);
  return hard ? makeTyped(area, row, dir) : makeMc(area, row, dir);
}

// ---- Match to category ----

function bucketOf(areaId, row) {
  if (areaId === "consonants") return (String(row.Category || "").split(",")[0] || "").trim();
  if (areaId === "vowels") return row.Class ? `Class ${row.Class}` : "";
  if (areaId === "vocabulary") return row.POS || "";
  if (areaId === "accents") return row.Type || "";
  return "";
}

function matchItemOf(areaId, row, area) {
  if (areaId === "vocabulary") return { key: area.key(row), glyph: row.Hebrew, text: row.English, bucket: bucketOf(areaId, row) };
  if (areaId === "accents") return { key: area.key(row), glyph: row.Symbol, text: row.EnglishName, bucket: bucketOf(areaId, row) };
  return { key: area.key(row), glyph: row.Form, text: row.Name, bucket: bucketOf(areaId, row) };
}

/** A "match these to their categories" round for an area, or null if the
 * area can't make one (needs items in at least two categories). */
function makeMatch(areaId) {
  const area = areaById(areaId);
  if (!area || areaId === "verbs") return null;
  const candidates = pickItems(area, 30)
    .map((r) => matchItemOf(areaId, r, area))
    .filter((it) => it.bucket && it.text);
  const groups = new Map();
  for (const it of candidates) {
    if (!groups.has(it.bucket)) groups.set(it.bucket, []);
    groups.get(it.bucket).push(it);
  }
  const buckets = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  if (buckets.length < 2) return null;
  const items = [];
  let round = 0;
  while (items.length < MATCH_ITEMS && round < MATCH_ITEMS) {
    for (const [, list] of buckets) {
      if (items.length < MATCH_ITEMS && list[round]) items.push(list[round]);
    }
    round += 1;
  }
  if (items.length < 3 || new Set(items.map((i) => i.bucket)).size < 2) return null;
  const used = new Set(items.map((i) => i.bucket));
  return {
    type: "match",
    areaId,
    items: shuffle(items),
    buckets: buckets.map(([b]) => b).filter((b) => used.has(b)),
    srsMode: matchMode(areaId),
    label: `${areaTitle[areaId]}: Match to category`,
    promptText: `Match ${items.length} ${areaTitle[areaId].toLowerCase()} to their categories`,
  };
}

// ---------------------------------------------------------------------
// Building a round
// ---------------------------------------------------------------------

/**
 * Today's round for `settings` ({ length, areas, hard }):
 * a personal mix across the chosen areas, with a match-to-category round or two
 * in longer rounds.
 */
export function buildChallenge(settings) {
  const have = new Set(availableAreaIds());
  let areaIds = settings.areas.filter((a) => have.has(a));
  if (areaIds.length === 0) areaIds = [...have];
  if (areaIds.length === 0) return [];
  const N = settings.length;

  // Longer rounds get a match-to-category round (one at 10, two at 15).
  const wantMatches = N >= 15 ? 2 : N >= 10 ? 1 : 0;
  const matchAreas = shuffle(areaIds.filter((a) => a !== "verbs" && a !== "bible"));
  const matches = [];
  for (const a of matchAreas) {
    if (matches.length >= wantMatches) break;
    const m = makeMatch(a);
    if (m) matches.push(m);
  }

  const counts = allocate(areaIds, N - matches.length);
  const questions = [];
  for (const id of areaIds) {
    if (id === "bible") {
      questions.push(...bibleQuestions(counts[id]));
      continue;
    }
    const area = areaById(id);
    for (const row of pickItems(area, counts[id])) {
      const q = makeQuestion(area, row, settings.hard);
      if (q) questions.push(q);
    }
  }
  const mixed = shuffle(questions);
  // Slot the match rounds in part-way through.
  matches.forEach((m, i) => {
    const at = Math.min(mixed.length, Math.floor(((i + 1) / (matches.length + 1)) * (mixed.length + 1)) + i);
    mixed.splice(at, 0, m);
  });
  return mixed;
}

/**
 * Loads the data for every Bible page named in a drill ([{ areaId: "bible", page, key }]) so buildDrill can draw those
 * questions. Pages that cannot be loaded are simply left out of the drill.
 */
export async function prepareDrill(items) {
  const pages = [...new Set(items.filter((i) => i.areaId === "bible").map((i) => i.page))];
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000));
  await Promise.all(
    pages.map(async (pg) => {
      const config = getPracticeConfig(pg);
      if (!config) return;
      try {
        await Promise.race([loadBibleData(config.dataset), timeout]);
      } catch (e) {
        /* left out */
      }
    })
  );
}

/** One Bible question for a saved item (page + example key); null if its data is not loaded or the example no longer exists. */
function drillBibleQuestion(item) {
  const config = getPracticeConfig(item.page);
  const data = config ? getBibleData(config.dataset) : null;
  if (!data) return null;
  const ex = data.examples.find((e) => exampleKey(e) === item.key);
  if (!ex) return null;
  try {
    const bq = makeBibleQuestion(config, data, ex);
    return {
      type: "bible",
      areaId: "bible",
      key: bq.key,
      page: item.page,
      srsMode: bibleSrsMode(item.page),
      label: `Bible in Context: ${config.title}`,
      promptText: `${prettyRef(bq.ex.ref)} · ${config.title}`,
      bq,
    };
  } catch (e) {
    return null;
  }
}

/**
 * A round for Home's "Drill these": one question per weak item
 * ([{ areaId, key, direction? }]), in the same formats as the daily round.
 */
export function buildDrill(items, hard) {
  const questions = [];
  for (const item of items) {
    if (item.areaId === "bible") {
      const q = drillBibleQuestion(item);
      if (q) questions.push(q);
      continue;
    }
    const area = areaById(item.areaId);
    if (!area || item.areaId === "verbs") continue;
    const row = getRow(item.areaId, item.key);
    if (!row) continue;
    const q = makeQuestion(area, row, hard, item.areaId === "vocabulary" ? item.direction || "hebrew" : undefined);
    if (q) questions.push(q);
  }
  return shuffle(questions);
}

// ---------------------------------------------------------------------
// Study session: a long, interleaved round chosen by what is due and what is weak
// ---------------------------------------------------------------------

/** The session lengths on offer, in minutes. */
export const STUDY_MINUTES = [10, 15, 20];
const SECONDS_PER_QUESTION = 24;
/** How many questions a session of `minutes` holds (about 24 seconds each, as in the Daily Challenge's own hints). */
export const studyQuestionCount = (minutes) => Math.max(5, Math.round((minutes * 60) / SECONDS_PER_QUESTION));
/** Areas that are always part of a session; the others join only when they have something due or weak. */
const STUDY_CORE_AREAS = ["vocabulary", "verbs", "bible"];
const STUDY_VERB_SHARE = 0.35;

const isWeakEntry = (e) => e && (e.box <= 2 || (e.timesSeen >= 2 && e.timesCorrect / e.timesSeen < 0.6));

/** { areaId, label, due, weak } for each area a session could draw on. Bible counts come from the saved Bible schedules. */
export function getStudyNeeds(now = Date.now()) {
  const needs = [];
  for (const id of availableAreaIds()) {
    if (id === "bible") {
      let due = 0;
      let weak = 0;
      for (const entries of Object.values(readBibleSchedules())) {
        for (const e of Object.values(entries)) {
          if (e.dueDate <= now) due += 1;
          else if (isWeakEntry(e)) weak += 1;
        }
      }
      needs.push({ areaId: id, label: areaTitle[id], due, weak });
      continue;
    }
    const area = areaById(id);
    if (!area) continue;
    const pool = poolOf(area);
    const mode = primaryMode(area);
    const entries = getScheduleEntries(mode);
    const due = getDueCount(mode, pool, area.key);
    let weak = 0;
    for (const row of pool) {
      const e = entries[area.key(row)];
      if (e && e.dueDate > now && isWeakEntry(e)) weak += 1;
    }
    needs.push({ areaId: id, label: areaTitle[id], due, weak });
  }
  return needs;
}

/**
 * How many of `total` questions each area gets: the core areas (vocabulary, verb forms, Bible) always take part;
 * foundation areas (consonants, vowels, accents) join when they have something due or weak. Within that, the
 * share follows need (due items count most, then weak ones), with verb forms held to about a third.
 */
export function planStudyCounts(needs, total) {
  const chosen = needs.filter((n) => STUDY_CORE_AREAS.includes(n.areaId) || n.due + n.weak > 0);
  if (chosen.length === 0 || total <= 0) return {};
  const weight = (n) => 2 + n.due + 0.5 * n.weak;
  const counts = Object.fromEntries(chosen.map((n) => [n.areaId, 0]));
  // Each area gets a floor of 2 (or 1 when the session is tiny), then the rest follows the weights.
  const floor = total >= chosen.length * 2 ? 2 : 1;
  let left = total;
  for (const n of chosen) {
    const give = Math.min(floor, left);
    counts[n.areaId] += give;
    left -= give;
  }
  const verbCap = Math.max(floor, Math.round(total * STUDY_VERB_SHARE));
  let guard = 0;
  while (left > 0 && guard++ < 10000) {
    // the area with the most unmet weight per question already given
    let best = null;
    let bestScore = -1;
    for (const n of chosen) {
      if (n.areaId === "verbs" && counts.verbs >= verbCap && chosen.some((c) => c.areaId !== "verbs")) continue;
      const sc = weight(n) / (counts[n.areaId] + 1);
      if (sc > bestScore) {
        bestScore = sc;
        best = n;
      }
    }
    if (!best) break;
    counts[best.areaId] += 1;
    left -= 1;
  }
  return counts;
}

/** Bible items that are due or weak, most urgent first: [{ areaId: "bible", page, key }]. */
export function studyBibleItems(k, now = Date.now()) {
  const found = [];
  for (const [page, entries] of Object.entries(readBibleSchedules())) {
    for (const [key, e] of Object.entries(entries)) {
      const due = e.dueDate <= now;
      if (due || isWeakEntry(e)) found.push({ areaId: "bible", page, key, due, box: e.box, dueDate: e.dueDate });
    }
  }
  found.sort((a, b) => Number(b.due) - Number(a.due) || a.box - b.box || a.dueDate - b.dueDate);
  // Keep to a handful of pages so only a few datasets need loading.
  const pages = [];
  const out = [];
  for (const it of found) {
    if (!pages.includes(it.page)) {
      if (pages.length >= 5) continue;
      pages.push(it.page);
    }
    out.push({ areaId: "bible", page: it.page, key: it.key });
    if (out.length >= k) break;
  }
  return out;
}

let studyPlan = null;

/**
 * Gets a session ready: works out how many questions each area gets and loads the Bible data it needs (the
 * pages of the due and weak items, plus a couple of pages for fresh material). Returns the plan; pass it to
 * buildStudySession. Areas whose data cannot load are left out.
 */
export async function prepareStudySession({ minutes = 15 } = {}) {
  const total = studyQuestionCount(minutes);
  const needs = getStudyNeeds();
  let counts = planStudyCounts(needs, total);
  const wanted = counts.bible || 0;
  const items = wanted ? studyBibleItems(wanted) : [];
  biblePlan = [];
  if (wanted) {
    await prepareDrill(items);
    // a couple of pages for new questions when there are fewer due or weak items than slots
    if (items.length < wanted) {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000));
      const extra = shuffle(BIBLE_PAGES.filter((p) => getPracticeConfig(p.page))).slice(0, 2);
      await Promise.all(
        extra.map(async (p) => {
          try {
            await Promise.race([loadBibleData(getPracticeConfig(p.page).dataset), timeout]);
            biblePlan.push(p.page);
          } catch (e) {
            /* left out */
          }
        })
      );
    }
  }
  studyPlan = { total, minutes, counts, needs, bibleItems: items };
  return studyPlan;
}

/** Puts the questions in an order that avoids the same area twice in a row where it can. */
function spreadByArea(questions) {
  const left = shuffle(questions);
  const out = [];
  while (left.length) {
    const last = out.length ? out[out.length - 1].areaId : null;
    let i = left.findIndex((q) => q.areaId !== last);
    if (i < 0) i = 0;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/** The session's questions, in the same formats as the Daily Challenge. Call prepareStudySession first. */
export function buildStudySession({ hard = false } = {}) {
  if (!studyPlan) return [];
  const { counts, bibleItems } = studyPlan;
  const questions = [];
  for (const [id, n] of Object.entries(counts)) {
    if (id === "bible") {
      const fromDue = [];
      for (const item of bibleItems.slice(0, n)) {
        const q = drillBibleQuestion(item);
        if (q) fromDue.push(q);
      }
      questions.push(...fromDue);
      if (fromDue.length < n) {
        const have = new Set(fromDue.map((q) => q.key));
        const more = bibleQuestions(n - fromDue.length + 4).filter((q) => !have.has(q.key));
        questions.push(...more.slice(0, n - fromDue.length));
      }
      continue;
    }
    const area = areaById(id);
    if (!area) continue;
    for (const row of pickItems(area, n)) {
      const q = makeQuestion(area, row, hard);
      if (q) questions.push(q);
    }
  }
  return spreadByArea(questions);
}

// ---------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------

const norm = (v) => (v === "NA" ? "" : v || "");

/** One line describing a verb parsing: "Qal · Perfect · 3 M S". */
function parseText(t) {
  const [binyan, mode, person, gender, number] = t;
  return `${binyan} · ${mode}${person || gender || number ? " · " + [person, gender, number].filter(Boolean).join("") : ""}`;
}

/**
 * Grades an answer.
 *   mc / typed  answer: a string
 *   parse       answer: { Binyan, Mode, Person, Gender, Number }
 *   match       answer: { [itemKey]: bucket }
 * Returns { correct, correctText, yourText, items? } — `items` (match only) says
 * which of the matched items were right.
 */
export function grade(q, answer) {
  if (q.type === "mc") {
    const mine = typeof answer === "string" ? answer : "";
    return { correct: mine === q.answer, correctText: q.answer, yourText: mine || "—" };
  }
  if (q.type === "bible") {
    const mine = answer && typeof answer === "object" ? answer : {};
    const parts = q.bq.parts;
    const label = (p, id) => (p.choices.find((c) => c.id === id) || {}).label || "—";
    return {
      correct: parts.every((p, i) => mine[i] === p.answer),
      correctText: parts.map((p) => label(p, p.answer)).join(" · "),
      yourText: parts.map((p, i) => label(p, mine[i])).join(" · "),
    };
  }
  if (q.type === "typed") {
    const row = getRow(q.areaId, q.key);
    const typed = typeof answer === "string" ? answer : "";
    if (!row) return { correct: false, correctText: "", yourText: typed || "—" };
    let correct;
    let correctText;
    if (q.areaId === "vocabulary") {
      correct = isVocabAnswerCorrect(q.direction, row, typed);
      correctText = vocabAnswerText(row, q.direction);
    } else if (q.areaId === "accents") {
      correct = q.direction === "name" ? isAccentAnswerCorrect(row, typed) : isAccentNameCorrect(row, typed);
      correctText = q.direction === "name" ? primaryAccentAnswerText(row) : primaryAccentNameText(row);
    } else {
      const set = getLetterSet(q.areaId);
      correct = q.direction === "name" ? isFormAnswerCorrect(row, typed) : isNameCorrect(set, row, typed);
      correctText = q.direction === "name" ? primaryFormText(row) : primaryNameText(set, row);
    }
    return { correct, correctText, yourText: typed.trim() || "—" };
  }
  if (q.type === "parse") {
    const mine = PARSE_FIELDS.map((f) => norm(answer && answer[f]));
    const correct = q.tuples.some((t) => t.every((v, i) => norm(v) === mine[i]));
    return {
      correct,
      correctText: q.tuples.map(parseText).join("  or  "),
      yourText: PARSE_FIELDS.every((f) => !(answer && answer[f])) ? "—" : parseText(mine),
    };
  }
  // match
  const given = answer || {};
  const items = q.items.map((it) => ({ ...it, chosen: given[it.key] || "", ok: given[it.key] === it.bucket }));
  return {
    correct: items.every((i) => i.ok),
    correctText: items.map((i) => `${i.text} → ${i.bucket}`).join("; "),
    yourText: items.map((i) => `${i.text} → ${i.chosen || "—"}`).join("; "),
    items,
  };
}

/** Records a graded question in the spaced-repetition schedule and the streak. */
export function recordResult(q, result, answer) {
  if (q.type === "match") {
    for (const it of result.items) recordItemResult(q.srsMode, it.key, it.ok);
  } else {
    recordItemResult(q.srsMode, q.key, result.correct);
  }
  if (q.type === "bible") {
    // Remember the word's label, any repeated mix-up, and rare-pattern successes, as on the Bible pages themselves.
    try {
      const config = getPracticeConfig(q.page);
      const cached = config ? getBibleData(config.dataset) : null;
      const data = { verses: { [q.bq.ex.ref]: q.bq.words }, examples: cached ? cached.examples : [] };
      if (config) noteBibleAnswer(config, data, q.bq.ex, q.bq.parts, answer && typeof answer === "object" ? answer : {});
    } catch (e) {
      /* the extra notes are never worth interrupting a round */
    }
  }
  recordStreakActivity();
}
