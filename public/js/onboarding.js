// First-run welcome and the app tour.
//
// A new person sees a short welcome: (1) pick your level, (2) a six-question placement quiz, (3) a suggested
// first week. The tour is a separate walk through the sidebar and the main features; it can be taken at the
// end of the welcome or from Home at any time.
//
// Who sees the welcome: only someone with NO saved progress who has not been through it. A returning person
// on a new device is recognised after their progress has synced down (so they are not welcomed as new), and
// anyone who already has progress is quietly marked as done. Everything stays optional: Skip is always there.

import { getConsonantRows, getVowelRows } from "./letter-data.js";
import { getVocabRows } from "./vocab-data.js";
import { collectProgress } from "./backup.js";
import { syncNow } from "./cloud-sync.js";
import { ymd } from "./daily-history.js";

const KEY = "hebrewVerbApp:onboarding";
const IGNORED = new Set([KEY, "hebrewVerbApp:confidencePrompt"]);

// ---------------------------------------------------------------------
// What has happened so far
// ---------------------------------------------------------------------

export function getOnboarding() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch (e) {
    return null;
  }
}

function save(patch) {
  const next = { ...(getOnboarding() || {}), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    /* not critical */
  }
  return next;
}

/** True when there is saved progress other than the welcome's own record. */
export function hasExistingProgress(storage = localStorage) {
  return Object.keys(collectProgress(storage)).some((k) => !IGNORED.has(k));
}

/** Should the welcome be shown right now? Never to someone who has been through it or who already has progress. */
export function shouldWelcome() {
  const o = getOnboarding();
  if (o && o.done) return false;
  return !hasExistingProgress();
}

// ---------------------------------------------------------------------
// Levels, the placement quiz, and the first week
// ---------------------------------------------------------------------

export const LEVELS = [
  { id: 1, title: "Just starting", text: "I am new to Biblical Hebrew." },
  { id: 2, title: "Letters and vowels", text: "I know the alphabet and the vowels." },
  { id: 3, title: "Some vocabulary and verbs", text: "I know some words and have met the verb forms." },
  { id: 4, title: "I can read", text: "I read simple Biblical Hebrew." },
];

const shuffle = (arr, rng = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = (arr, n, rng) => shuffle(arr, rng).slice(0, n);

function mcQuestion({ area, prompt, hebrew, answer, pool, rng }) {
  const distractors = sample([...new Set(pool.filter((x) => x !== answer))], 3, rng);
  return { area, prompt, hebrew, answer, options: shuffle([answer, ...distractors], rng) };
}

/** Six multiple-choice questions: two consonants, one vowel, three vocabulary words of rising difficulty. */
export function buildPlacement(rng = Math.random) {
  const qs = [];
  const cons = getConsonantRows();
  for (const r of sample(cons, 2, rng)) {
    qs.push(mcQuestion({ area: "consonants", prompt: "What is the name of this letter?", hebrew: r.Form, answer: r.Name, pool: cons.map((c) => c.Name), rng }));
  }
  const vows = getVowelRows();
  for (const r of sample(vows, 1, rng)) {
    qs.push(mcQuestion({ area: "vowels", prompt: "What is the name of this vowel?", hebrew: r.Form.replace(/\u25CC/g, "\u05D0"), answer: r.Name, pool: vows.map((c) => c.Name), rng }));
  }
  const vocab = getVocabRows()
    .filter((r) => r.Hebrew && r.English)
    .sort((a, b) => Number(b.Frequency) - Number(a.Frequency));
  const bands = [vocab.slice(0, 120), vocab.slice(150, 450), vocab.slice(500, 900)];
  for (const band of bands) {
    if (!band.length) continue;
    const r = sample(band, 1, rng)[0];
    qs.push(mcQuestion({ area: "vocabulary", prompt: "What does this word mean?", hebrew: String(r.Hebrew).split(/\s*[;,]\s*/)[0], answer: r.English, pool: band.map((b) => b.English), rng }));
  }
  return qs;
}

/** Score out of the number of questions -> a level from 1 to 4. */
export function placedLevel(score, total) {
  if (!total) return 1;
  const f = score / total;
  return f < 0.34 ? 1 : f < 0.67 ? 2 : f < 0.95 ? 3 : 4;
}

/** Combines what the person said and what the quiz showed: halfway between, rounding up. */
export function startingLevel(selfLevel, score, total) {
  if (score === null || score === undefined) return selfLevel;
  return Math.max(1, Math.min(4, Math.floor((selfLevel + placedLevel(score, total) + 1) / 2)));
}

const PLANS = {
  1: [
    ["Meet the alphabet", "Twenty-two letters, a few at a time.", "consonant-flashcards", "Consonant flashcards"],
    ["Say and type the letters", "Match each letter with its name.", "consonant-typing", "Consonant typing"],
    ["The vowels", "Learn what each vowel mark looks like and sounds like.", "vowel-flashcards", "Vowel flashcards"],
    ["Vowels, by typing", "Recall the vowel names without hints.", "vowel-typing", "Vowel typing"],
    ["Your first words", "The most common words in the Bible.", "vocab-flashcards", "Vocabulary flashcards"],
    ["A mixed round", "A short Daily Challenge across everything so far.", "daily-challenge", "Daily Challenge"],
    ["Look back", "See what you have learned this week.", "progress", "My Progress"],
  ],
  2: [
    ["Vocabulary", "Build your word list with flashcards.", "vocab-flashcards", "Vocabulary flashcards"],
    ["Vocabulary, by typing", "Recall the meanings without hints.", "vocab-typing", "Vocabulary typing"],
    ["Verb forms", "Look through the verb paradigms.", "review", "Verb Review"],
    ["Verb flashcards", "Practise recognising verb forms.", "verb-flashcards", "Verb flashcards"],
    ["Syllables and stress", "The groundwork for reading aloud.", "bible-syllable", "Syllables & Stress"],
    ["The definite article", "Real verses of Genesis.", "bible-article", "Definite Article"],
    ["A mixed round", "Daily Challenge across everything.", "daily-challenge", "Daily Challenge"],
  ],
  3: [
    ["A study session", "Mixed practice chosen by what is due and weak.", "study-session", "Study Session"],
    ["Parse verbs", "Type the root, then parse the form.", "parsing", "Verb Parsing"],
    ["Prefixed prepositions", "In real verses.", "bible-prefix", "Prefixed Prepositions"],
    ["Nouns", "State, gender and number in the text.", "bible-noun", "Nouns"],
    ["Read a passage", "Start with one that suits your vocabulary.", "bible-reading", "Reading"],
    ["Another study session", "What is due today.", "study-session", "Study Session"],
    ["Look back", "Your progress so far.", "progress", "My Progress"],
  ],
  4: [
    ["Read a passage", "Choose Easiest first, then translate.", "bible-reading", "Reading"],
    ["A study session", "Mixed practice by what is due.", "study-session", "Study Session"],
    ["Verbs in context", "Type the root, then parse.", "bible-verb", "Verbs"],
    ["Accents", "Turn on Show accent divisions in Reading.", "bible-reading", "Reading"],
    ["Dagesh and shevas", "The finer points, in real verses.", "bible-dagesh", "Dagesh"],
    ["Mixed review in Reading", "Questions on one verse at a time.", "bible-reading", "Reading"],
    ["Back up your progress", "Download a backup in My Progress.", "progress", "My Progress"],
  ],
};

/** The seven days for a level: [{ day, title, text, page, label }]. */
export function firstWeekPlan(level) {
  return (PLANS[level] || PLANS[1]).map(([title, text, page, label], i) => ({ day: i + 1, title, text, page, label }));
}

/** Which day of the plan it is today (1 to 7), or null once the week is over or there is no plan. */
export function planDayToday(now = new Date()) {
  const o = getOnboarding();
  if (!o || !o.planStart || !o.level) return null;
  const [y, m, d] = o.planStart.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const day = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000) + 1;
  return day >= 1 && day <= 7 ? day : null;
}

/** Today's step of the first week, for Home. Null if there is none or it was hidden. */
export function getPlanToday(now = new Date()) {
  const o = getOnboarding();
  if (!o || o.planHidden) return null;
  const day = planDayToday(now);
  return day ? { ...firstWeekPlan(o.level)[day - 1], of: 7 } : null;
}

export const hidePlan = () => save({ planHidden: true });

// ---------------------------------------------------------------------
// The tour
// ---------------------------------------------------------------------

export const TOUR_STEPS = [
  { target: "#nav-buttons", title: "The sidebar", text: "Everything is reached from here. Pages are grouped into dropdowns, and the page you are on opens its own group." },
  { target: '#sidebar [data-page="daily-challenge"]', title: "Daily Challenge and Study Session", text: "The Daily Challenge is a short round once a day and keeps your streak. The Study Session is a longer mixed round (10, 15 or 20 minutes) chosen by what is due and what you find hard." },
  { target: '.nav-section-toggle[data-nav-section="foundations"]', title: "Foundations", text: "Consonants, Vowels, Vocabulary, Verbs and Accents. Each has Review, Flashcards, Typing and Games, so you can meet an item, recall it and be tested on it." },
  { target: '.nav-section-toggle[data-nav-section="bible"]', title: "Bible in Context", text: "Practice on real verses of Genesis: Marks & Syllables, Words, Prefixes and Verbs. Each page has a guided passage, a pattern quiz, a find-it exercise, a guide, and a Print tab for worksheets." },
  { target: '#sidebar [data-page="bible-reading"]', title: "Reading", text: "Passages from Genesis, Exodus, Deuteronomy, Psalms, Ruth and Jonah. Tap words to see their parts, check your translation word by word, see accent divisions, and save passages for offline use." },
  { target: '#sidebar [data-page="progress"]', title: "My Progress", text: "Your mastery by area, quiz history, Bible pages, badges, and Backup & settings, where you can download a copy of everything." },
  { target: '#sidebar [data-page="search"]', title: "Word Lookup", text: "Search Hebrew (with or without vowels) or English across vocabulary, verbs and accents." },
  { target: ".sidebar-footer", title: "Make it comfortable", text: "Text size and Hebrew size, themes and patterns under Appearance, and your Account. Press ? for keyboard shortcuts." },
  { target: null, title: "That is the tour", text: "You can take it again whenever you like from Home, under Welcome guide." },
];

// ---------------------------------------------------------------------
// The dialogs
// ---------------------------------------------------------------------

const el = (tag, className, html) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let openDialog = null;

/** Opens a modal dialog with focus kept inside it; returns { body, close }. */
function openModal({ label, onClose }) {
  closeModal();
  const prevFocus = document.activeElement;
  const backdrop = el("div", "onb-backdrop");
  const dialog = el("div", "onb-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", label);
  dialog.tabIndex = -1;
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      const f = [...dialog.querySelectorAll("button, input, select, textarea, a[href]")].filter((n) => !n.disabled && !n.hidden && n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener("keydown", onKey, true);
  function close(byUser = false) {
    if (openDialog !== api) return;
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
    openDialog = null;
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose(byUser);
  }
  const api = { body: dialog, close, backdrop };
  openDialog = api;
  return api;
}

export function closeModal() {
  if (openDialog) openDialog.close(false);
}

const focusFirst = (root) => {
  const f = root.querySelector("[data-autofocus]") || root.querySelector("button, input");
  (f || root).focus();
};

/** The welcome: welcome -> level -> placement -> plan. `navigate(page)` is used by the plan. */
export function startWelcome(navigate, { rng = Math.random } = {}) {
  const st = { level: null, score: null, total: 0 };
  const modal = openModal({
    label: "Welcome",
    onClose: (byUser) => {
      if (byUser) save({ done: true, skipped: true, ts: Date.now() });
    },
  });
  const draw = (build) => {
    modal.body.innerHTML = "";
    build(modal.body);
    focusFirst(modal.body);
  };
  const finish = (extra) => {
    save({ done: true, ts: Date.now(), ...extra });
    modal.close(false);
  };

  const stepWelcome = () =>
    draw((b) => {
      b.appendChild(el("h2", "onb-title", "Welcome"));
      b.appendChild(el("p", "", "This app helps you learn Biblical Hebrew by practising a little every day. In about two minutes you can tell it where you are, take a tiny placement quiz, and get a suggested first week."));
      const row = el("div", "onb-actions");
      const go = el("button", "btn", "Set up my first week");
      go.dataset.autofocus = "1";
      go.type = "button";
      go.addEventListener("click", stepLevel);
      const tour = el("button", "btn btn-outline", "Take the tour first");
      tour.type = "button";
      tour.addEventListener("click", () => {
        save({ done: true, ts: Date.now(), tourSeen: true });
        modal.close(false);
        startTour(navigate);
      });
      const skip = el("button", "btn btn-outline", "Skip for now");
      skip.type = "button";
      skip.addEventListener("click", () => finish({ skipped: true }));
      row.append(go, tour, skip);
      b.appendChild(row);
    });

  const stepLevel = () =>
    draw((b) => {
      b.appendChild(el("h2", "onb-title", "Step 1 of 3: where are you?"));
      const group = el("div", "onb-levels");
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-label", "Your level");
      for (const lv of LEVELS) {
        const lab = el("label", "onb-level");
        const r = document.createElement("input");
        r.type = "radio";
        r.name = "onb-level";
        r.value = String(lv.id);
        r.checked = st.level === lv.id;
        r.addEventListener("change", () => {
          st.level = lv.id;
          next.disabled = false;
        });
        lab.append(r, el("span", "", `<b>${esc(lv.title)}</b><br>${esc(lv.text)}`));
        group.appendChild(lab);
      }
      b.appendChild(group);
      const row = el("div", "onb-actions");
      const back = el("button", "btn btn-outline", "Back");
      back.type = "button";
      back.addEventListener("click", stepWelcome);
      const next = el("button", "btn", "Next");
      next.type = "button";
      next.disabled = st.level === null;
      next.addEventListener("click", stepPlacement);
      row.append(back, next);
      b.appendChild(row);
    });

  const stepPlacement = () => {
    const questions = buildPlacement(rng);
    let i = 0;
    let score = 0;
    const ask = () =>
      draw((b) => {
        b.appendChild(el("h2", "onb-title", "Step 2 of 3: a tiny placement quiz"));
        b.appendChild(el("p", "caption", `Question ${i + 1} of ${questions.length}. Do not worry about getting these wrong: they only help suggest where to begin.`));
        const q = questions[i];
        b.appendChild(el("p", "", esc(q.prompt)));
        b.appendChild(el("div", "onb-hebrew", `<span lang="he" dir="rtl">${esc(q.hebrew)}</span>`));
        const opts = el("div", "onb-options");
        const fb = el("div", "onb-feedback");
        fb.setAttribute("role", "status");
        for (const o of q.options) {
          const btn = el("button", "choice-btn", esc(o));
          btn.type = "button";
          btn.addEventListener("click", () => {
            const right = o === q.answer;
            if (right) score += 1;
            for (const x of opts.children) {
              x.disabled = true;
              if (x.textContent === q.answer) x.classList.add("is-correct");
              else if (x === btn) x.classList.add("is-wrong");
            }
            fb.textContent = right ? "Correct." : `Not quite: ${q.answer}.`;
            nextBtn.hidden = false;
            nextBtn.focus();
          });
          opts.appendChild(btn);
        }
        b.appendChild(opts);
        b.appendChild(fb);
        const row = el("div", "onb-actions");
        const nextBtn = el("button", "btn", i === questions.length - 1 ? "See my plan" : "Next question");
        nextBtn.type = "button";
        nextBtn.hidden = true;
        nextBtn.addEventListener("click", () => {
          i += 1;
          if (i < questions.length) ask();
          else {
            st.score = score;
            st.total = questions.length;
            stepPlan();
          }
        });
        const skip = el("button", "btn btn-outline", "Skip the quiz");
        skip.type = "button";
        skip.addEventListener("click", () => {
          st.score = null;
          stepPlan();
        });
        row.append(nextBtn, skip);
        b.appendChild(row);
      });
    if (!questions.length) {
      stepPlan();
      return;
    }
    ask();
  };

  const stepPlan = () => {
    const level = startingLevel(st.level || 1, st.score, st.total);
    const plan = firstWeekPlan(level);
    draw((b) => {
      b.appendChild(el("h2", "onb-title", "Step 3 of 3: your first week"));
      const lv = LEVELS.find((l) => l.id === level);
      b.appendChild(el("p", "", st.score === null ? `Starting point: <b>${esc(lv.title)}</b>.` : `You answered ${st.score} of ${st.total}. Suggested starting point: <b>${esc(lv.title)}</b>.`));
      const list = el("ol", "onb-plan");
      for (const d of plan) list.appendChild(el("li", "", `<b>${esc(d.title)}</b> — ${esc(d.text)} <span class="caption">(${esc(d.label)})</span>`));
      b.appendChild(list);
      b.appendChild(el("p", "caption", "Home will show each day's step. A few minutes a day is enough."));
      const row = el("div", "onb-actions");
      const start = el("button", "btn", "Start day 1");
      start.type = "button";
      start.addEventListener("click", () => {
        finish({ level, score: st.score, total: st.total, selfLevel: st.level, planStart: ymd(new Date()) });
        navigate(plan[0].page);
      });
      const tour = el("button", "btn btn-outline", "Take the tour");
      tour.type = "button";
      tour.addEventListener("click", () => {
        finish({ level, score: st.score, total: st.total, selfLevel: st.level, planStart: ymd(new Date()), tourSeen: true });
        startTour(navigate);
      });
      const later = el("button", "btn btn-outline", "Save the plan, start later");
      later.type = "button";
      later.addEventListener("click", () => finish({ level, score: st.score, total: st.total, selfLevel: st.level, planStart: ymd(new Date()) }));
      row.append(start, tour, later);
      b.appendChild(row);
    });
  };

  stepWelcome();
  return modal;
}

let tourHighlight = null;
const clearHighlight = () => {
  if (tourHighlight) tourHighlight.classList.remove("tour-highlight");
  tourHighlight = null;
};

/** The tour: one card at a time, with the matching part of the sidebar outlined when it is on screen. */
export function startTour(navigate) {
  let i = 0;
  const modal = openModal({ label: "App tour", onClose: () => clearHighlight() });
  modal.backdrop.classList.add("onb-tour");
  const show = () => {
    clearHighlight();
    const step = TOUR_STEPS[i];
    const target = step.target ? document.querySelector(step.target) : null;
    const visible = target && target.getClientRects().length > 0 && target.offsetParent !== null;
    if (visible) {
      target.classList.add("tour-highlight");
      tourHighlight = target;
      try {
        target.scrollIntoView({ block: "nearest" });
      } catch (e) {
        /* not critical */
      }
    }
    const b = modal.body;
    b.innerHTML = "";
    b.appendChild(el("p", "caption", `Tour: ${i + 1} of ${TOUR_STEPS.length}`));
    b.appendChild(el("h2", "onb-title", esc(step.title)));
    b.appendChild(el("p", "", esc(step.text)));
    if (step.target && !visible) b.appendChild(el("p", "caption", "(On a narrow screen the sidebar is closed: open the menu button to see this.)"));
    const row = el("div", "onb-actions");
    const back = el("button", "btn btn-outline", "Back");
    back.type = "button";
    back.disabled = i === 0;
    back.addEventListener("click", () => {
      i -= 1;
      show();
    });
    const last = i === TOUR_STEPS.length - 1;
    const next = el("button", "btn", last ? "Finish" : "Next");
    next.type = "button";
    next.dataset.autofocus = "1";
    next.addEventListener("click", () => {
      if (last) {
        save({ tourSeen: true });
        modal.close(false);
      } else {
        i += 1;
        show();
      }
    });
    const skip = el("button", "btn btn-outline", "Close tour");
    skip.type = "button";
    skip.addEventListener("click", () => modal.close(true));
    row.append(back, next, skip);
    b.appendChild(row);
    focusFirst(b);
  };
  show();
  return modal;
}

/**
 * Called when Home opens. Waits for the first sync (so a returning person on a new device is not welcomed as
 * new), then shows the welcome to a genuinely new person. Quietly records existing users as done.
 */
export async function maybeStartOnboarding(navigate) {
  const o = getOnboarding();
  if (o && o.done) return false;
  try {
    await syncNow();
  } catch (e) {
    return false; // could not check: better to say nothing than to welcome an existing user as new
  }
  const after = getOnboarding();
  if (after && after.done) return false;
  if (hasExistingProgress()) {
    save({ done: true, skipped: true, existing: true, ts: Date.now() });
    return false;
  }
  startWelcome(navigate);
  return true;
}
