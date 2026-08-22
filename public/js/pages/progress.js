import { getStreakInfo, getScheduleSummary, getMasteryStats } from "../srs.js";
import { getVocabRows } from "../vocab-data.js";
import { vocabRowKey } from "../vocab-overrides.js";
import { getAccentRows } from "../accent-data.js";
import { accentRowKey } from "../accent-filters.js";
import { renderHistoryPanel } from "../history-ui.js";
import { setDeepLink } from "../deep-link.js";

export function mount({ content, sidebarExtra, navigate }) {
  sidebarExtra.innerHTML = "";
  render(content, navigate);
}

export function unmount() {}

function statLine(stats, showNew) {
  const parts = [];
  if (showNew) parts.push(`${stats.newCount ?? stats.totalTracked ?? 0} new`);
  parts.push(`${stats.learning} learning`);
  parts.push(`${stats.mastered} mastered`);
  return parts.join(" · ");
}

function renderModeCard({ title, desc, stats, showNew, buttonLabel, onGoPractice }) {
  const card = document.createElement("div");
  card.className = "mode-card";

  const top = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = title;
  top.appendChild(h2);

  if (desc) {
    const p = document.createElement("p");
    p.textContent = desc;
    top.appendChild(p);
  }

  const statCaption = document.createElement("div");
  statCaption.className = "caption";
  statCaption.textContent = (stats.total ?? stats.totalTracked ?? 0) === 0 && !showNew
    ? "Not practiced yet."
    : statLine(stats, showNew);
  top.appendChild(statCaption);

  card.appendChild(top);

  const btn = document.createElement("button");
  btn.className = "btn btn-block";
  btn.textContent = buttonLabel;
  btn.addEventListener("click", onGoPractice);
  card.appendChild(btn);

  return card;
}

function render(content, navigate) {
  content.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">My Progress</h1>
    <div class="info-box">
      <b>About this page</b><br>
      A summary of your practice across the app — your streak, what you've mastered through spaced repetition, and your recent quiz scores.<br>
      This is stored in your browser only; it won't follow you to a different browser or device.
    </div>
  `;
  content.appendChild(wrap);

  // ---- Streak ----
  const streak = getStreakInfo();
  const streakBox = document.createElement("div");
  streakBox.className = "info-box";
  streakBox.innerHTML = streak.currentStreak
    ? `<b>${streak.currentStreak} day${streak.currentStreak === 1 ? "" : "s"} in a row</b>${
        streak.longestStreak > streak.currentStreak ? ` · Best: ${streak.longestStreak}` : ""
      }`
    : `<b>No streak yet</b> — practice today to start one.`;
  content.appendChild(streakBox);

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  // ---- Verb practice ----
  const verbHeading = document.createElement("h3");
  verbHeading.textContent = "Verb Practice";
  content.appendChild(verbHeading);

  const verbGrid = document.createElement("div");
  verbGrid.className = "mode-cards";

  verbGrid.appendChild(
    renderModeCard({
      title: "Parsing",
      desc: "Identifying the grammar of a given verb form",
      stats: getScheduleSummary("parsing"),
      showNew: false,
      buttonLabel: "Go Practice",
      onGoPractice: () => navigate("parsing"),
    })
  );
  verbGrid.appendChild(
    renderModeCard({
      title: "Construction",
      desc: "Writing a verb form and its translation from a prompt",
      stats: getScheduleSummary("construction"),
      showNew: false,
      buttonLabel: "Go Practice",
      onGoPractice: () => navigate("construction"),
    })
  );
  verbGrid.appendChild(
    renderModeCard({
      title: "Flashcards: Hebrew first",
      stats: getScheduleSummary("verb-flashcards-hebrew"),
      showNew: false,
      buttonLabel: "Go Practice",
      onGoPractice: () => {
        setDeepLink({ type: "verb-flashcards-focus", direction: "hebrew" });
        navigate("verb-flashcards");
      },
    })
  );
  verbGrid.appendChild(
    renderModeCard({
      title: "Flashcards: English first",
      stats: getScheduleSummary("verb-flashcards-english"),
      showNew: false,
      buttonLabel: "Go Practice",
      onGoPractice: () => {
        setDeepLink({ type: "verb-flashcards-focus", direction: "english" });
        navigate("verb-flashcards");
      },
    })
  );
  content.appendChild(verbGrid);

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  // ---- Vocabulary practice ----
  const vocabHeading = document.createElement("h3");
  vocabHeading.textContent = "Vocabulary Practice";
  content.appendChild(vocabHeading);

  const vocabRows = getVocabRows();
  const vocabGrid = document.createElement("div");
  vocabGrid.className = "mode-cards";

  const vocabModes = [
    { title: "Typing: Hebrew → English", mode: "vocab-typing-hebrew", page: "vocab-typing", direction: "hebrew" },
    { title: "Typing: English → Hebrew", mode: "vocab-typing-english", page: "vocab-typing", direction: "english" },
    { title: "Flashcards: Hebrew first", mode: "vocab-flashcards-hebrew", page: "vocab-flashcards", direction: "hebrew" },
    { title: "Flashcards: English first", mode: "vocab-flashcards-english", page: "vocab-flashcards", direction: "english" },
    { title: "Games: Hebrew → English", mode: "vocab-games-hebrew", page: "vocab-games", direction: "hebrew" },
    { title: "Games: English → Hebrew", mode: "vocab-games-english", page: "vocab-games", direction: "english" },
  ];

  for (const vm of vocabModes) {
    const stats = vocabRows.length ? getMasteryStats(vm.mode, vocabRows, vocabRowKey) : { newCount: 0, learning: 0, mastered: 0, total: 0 };
    vocabGrid.appendChild(
      renderModeCard({
        title: vm.title,
        stats,
        showNew: true,
        buttonLabel: "Go Practice",
        onGoPractice: () => {
          if (vm.page === "vocab-typing" || vm.page === "vocab-flashcards") {
            const type = vm.page === "vocab-typing" ? "vocab-typing-focus" : "vocab-flashcards-focus";
            setDeepLink({ type, direction: vm.direction });
          }
          navigate(vm.page);
        },
      })
    );
  }
  content.appendChild(vocabGrid);

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  // ---- Accents practice ----
  const accentHeading = document.createElement("h3");
  accentHeading.textContent = "Accents Practice";
  content.appendChild(accentHeading);

  const accentRows = getAccentRows();
  const accentGrid = document.createElement("div");
  accentGrid.className = "mode-cards";

  const accentModes = [
    { title: "Typing: Names → Symbol", mode: "accent-typing-names", page: "accent-typing", promptWith: "names" },
    {
      title: "Typing: Symbol → Keyboard",
      mode: "accent-typing-symbol",
      page: "accent-typing",
      promptWith: "symbol",
    },
    { title: "Flashcards", mode: "accent-flashcards", page: "accent-flashcards" },
    { title: "Games: Names → Symbol", mode: "accent-games-names", page: "accent-games" },
    { title: "Games: Symbol → Keyboard", mode: "accent-games-symbol", page: "accent-games" },
  ];

  for (const am of accentModes) {
    const stats = accentRows.length
      ? getMasteryStats(am.mode, accentRows, accentRowKey)
      : { newCount: 0, learning: 0, mastered: 0, total: 0 };
    accentGrid.appendChild(
      renderModeCard({
        title: am.title,
        stats,
        showNew: true,
        buttonLabel: "Go Practice",
        onGoPractice: () => {
          if (am.page === "accent-typing") {
            setDeepLink({ type: "accent-typing-focus", promptWith: am.promptWith });
          }
          navigate(am.page);
        },
      })
    );
  }
  content.appendChild(accentGrid);

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  // ---- Recent history, per mode ----
  const historyHeading = document.createElement("h3");
  historyHeading.textContent = "Recent Quiz Attempts";
  content.appendChild(historyHeading);

  const historyModes = [
    ["parsing", "Parsing"],
    ["construction", "Construction"],
    ["vocab-typing", "Vocabulary Typing"],
    ["accent-typing", "Accents Typing"],
  ];
  let anyHistory = false;
  for (const [mode, label] of historyModes) {
    const sub = document.createElement("div");
    sub.style.marginBottom = "10px";
    const subHeading = document.createElement("div");
    subHeading.className = "sidebar-label";
    subHeading.textContent = label;
    sub.appendChild(subHeading);
    renderHistoryPanel(sub, mode, { onClear: () => render(content, navigate) });
    // renderHistoryPanel silently does nothing if there's no history for
    // this mode — only keep the sub-heading around if it actually added
    // a panel underneath it.
    if (sub.childElementCount > 1) {
      content.appendChild(sub);
      anyHistory = true;
    }
  }
  if (!anyHistory) {
    const none = document.createElement("div");
    none.className = "caption";
    none.textContent = "No quiz attempts recorded yet.";
    content.appendChild(none);
  }

  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => navigate("home"));
  content.appendChild(homeBtn);
}
