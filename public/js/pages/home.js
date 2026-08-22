import { getVocabRows } from "../vocab-data.js";
import { vocabRowKey } from "../vocab-overrides.js";
import { getAccentRows } from "../accent-data.js";
import { accentRowKey } from "../accent-filters.js";
import { getDueCount, getDailyProgress } from "../srs.js";

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

const VERB_MODES = [
  {
    label: "Review",
    desc: "Study forms by browsing and filtering",
    key: "review",
    buttonLabel: "Review",
  },
  {
    label: "Flashcards",
    desc: "Drill forms with flip cards — mark each one as known or save it for later review",
    key: "verb-flashcards",
    buttonLabel: "Flashcards",
  },
  {
    label: "Parsing",
    desc: "Parse forms from the generated conjugations",
    key: "parsing",
    buttonLabel: "Parsing",
  },
  {
    label: "Construction",
    desc: "Master morphology by being able to write it & practice writing translations",
    key: "construction",
    buttonLabel: "Construction",
  },
];

const VOCAB_MODES = [
  {
    label: "Review",
    desc: "Browse and filter Biblical Hebrew vocabulary by lesson, part of speech, category, and frequency",
    key: "vocabulary",
    buttonLabel: "Review",
  },
  {
    label: "Flashcards",
    desc: "Drill words with flip cards — mark each one as known or save it for later review",
    key: "vocab-flashcards",
    buttonLabel: "Flashcards",
  },
  {
    label: "Typing",
    desc: "Type the Hebrew or English translation from a prompt, with Practice and Quiz modes",
    key: "vocab-typing",
    buttonLabel: "Typing",
  },
  {
    label: "Games",
    desc: "Five arcade-style modes that test recall — Survival Sprint, Beat the Clock, Memory Match, Lightning Round, and Category Sort",
    key: "vocab-games",
    buttonLabel: "Games",
  },
];

const ACCENTS_MODES = [
  {
    label: "Review",
    desc: "Browse and filter Hebrew cantillation accents by Type and Group",
    key: "accent-review",
    buttonLabel: "Review",
  },
  {
    label: "Flashcards",
    desc: "See an accent in context and flip to reveal its name and grouping",
    key: "accent-flashcards",
    buttonLabel: "Flashcards",
  },
  {
    label: "Typing",
    desc: "Type the accent from its name, or select the SIL keyboard shortcut that types it, with Practice and Quiz modes",
    key: "accent-typing",
    buttonLabel: "Typing",
  },
  {
    label: "Games",
    desc: "Five arcade-style modes that test recall — Survival Sprint, Beat the Clock, Memory Match, Lightning Round, and Type Sort",
    key: "accent-games",
    buttonLabel: "Games",
  },
];

function todayCardHtml() {
  const vocabRows = getVocabRows();
  const accentRows = getAccentRows();

  let due = 0;
  for (const mode of ["vocab-typing-hebrew", "vocab-typing-english", "vocab-flashcards-hebrew", "vocab-flashcards-english"]) {
    due += getDueCount(mode, vocabRows, vocabRowKey);
  }
  for (const mode of ["accent-typing-names", "accent-typing-symbol", "accent-flashcards"]) {
    due += getDueCount(mode, accentRows, accentRowKey);
  }

  const daily = getDailyProgress();
  const pct = Math.min(100, Math.round((daily.count / daily.goal) * 100));

  return `
    <div class="today-card">
      <div class="today-card-main">
        <div class="today-card-title">Today</div>
        <div class="today-card-due">${due > 0 ? `${due} item${due === 1 ? "" : "s"} due for review` : "You're all caught up"}</div>
        <div class="daily-goal" style="max-width: 260px;">
          <div class="daily-goal-bar"><div class="daily-goal-fill" style="width:${pct}%"></div></div>
          <div class="daily-goal-label">${daily.count} / ${daily.goal} today</div>
        </div>
      </div>
      <button class="btn" data-goto="daily-challenge">Start Daily Challenge</button>
    </div>
  `;
}

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

/** A collapsible section (toggle button + mode-card grid), mirroring
 * the sidebar's collapsible nav sections — same caret/hidden pattern,
 * own localStorage namespace, and also starts collapsed by default. */
function sectionHtml(section, title, modes) {
  return `
    <button class="home-section-toggle" type="button" data-home-section="${section}" aria-expanded="false" aria-controls="home-section-${section}">
      <span class="nav-section-caret">▾</span><h2 class="home-section-title">${title}</h2>
    </button>
    <div class="mode-cards home-section-group" id="home-section-${section}" data-home-section-group="${section}" hidden>${cardsHtml(
      modes
    )}</div>
  `;
}

const HOME_SECTIONS = ["verbs", "vocabulary", "accents"];

function homeSectionStorageKey(section) {
  return `homeSectionCollapsed:${section}`;
}

function setHomeSectionCollapsed(wrap, section, collapsed) {
  const toggle = wrap.querySelector(`.home-section-toggle[data-home-section="${section}"]`);
  const group = wrap.querySelector(`.home-section-group[data-home-section-group="${section}"]`);
  if (!toggle || !group) return;
  toggle.setAttribute("aria-expanded", String(!collapsed));
  if (collapsed) group.setAttribute("hidden", "");
  else group.removeAttribute("hidden");
  try {
    localStorage.setItem(homeSectionStorageKey(section), collapsed ? "1" : "0");
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

function initHomeSections(wrap) {
  for (const section of HOME_SECTIONS) {
    // Starts collapsed for a first-time visitor (no stored preference
    // yet); a returning visitor's last choice is remembered.
    let collapsed = true;
    try {
      const stored = localStorage.getItem(homeSectionStorageKey(section));
      if (stored === "0") collapsed = false;
      else if (stored === "1") collapsed = true;
    } catch (e) {
      /* ignore */
    }
    setHomeSectionCollapsed(wrap, section, collapsed);

    const toggle = wrap.querySelector(`.home-section-toggle[data-home-section="${section}"]`);
    if (toggle) {
      toggle.addEventListener("click", () => {
        const isExpanded = toggle.getAttribute("aria-expanded") === "true";
        setHomeSectionCollapsed(wrap, section, isExpanded);
      });
    }
  }
}

export function mount({ content, navigate }) {
  const wrap = document.createElement("div");
  wrap.id = "home-page";
  wrap.className = "home-bg";

  wrap.innerHTML = `
    <h1 class="page-title">Biblical Hebrew Verb Practice</h1>
    <p>How would you like to study?</p>
    ${todayCardHtml()}
    <div class="mode-cards">${cardsHtml(FEATURED_MODES)}</div>

    ${sectionHtml("verbs", "Verbs", VERB_MODES)}
    ${sectionHtml("vocabulary", "Vocabulary", VOCAB_MODES)}
    ${sectionHtml("accents", "Accents", ACCENTS_MODES)}

    <div class="verse">
      וְאָהַבְתָּ אֵת יְהוָה אֱלֹהֶיךָ בְּכָל&#8209;לְבָבְךָ<br/>
      וּבְכָל&#8209;נַפְשְׁךָ וּבְכָל&#8209;מְאֹדֶךָ
    </div>

    <div class="feedback-box">
      <b>Found a mistake or have a suggestion?</b><br>
      Help improve the Hebrew Verb App by reporting issues or submitting feedback.<br>
      <a href="https://forms.gle/abrMxJfCp6mpLH9y6" target="_blank" rel="noopener">Submit Feedback</a>
    </div>
  `;

  wrap.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.goto));
  });

  initHomeSections(wrap);

  content.appendChild(wrap);
}

export function unmount() {}
