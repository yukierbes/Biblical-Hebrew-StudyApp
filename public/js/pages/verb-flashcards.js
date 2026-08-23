import { getAvailableDatasets, loadVerbData } from "../data.js";
import { applyFilters, GENERATOR_COLUMNS } from "../filters.js";
import { renderDatasetSelector, renderFilterSidebar } from "../widgets.js";
import { wrapHebrewSpans, morphKey } from "../helpers.js";
import { sortByPriority, recordItemResult, recordStreakActivity, getMasteryStats } from "../srs.js";
import { consumeDeepLink } from "../deep-link.js";

const MORPH_COLUMNS = ["Binyan", "Mode", "Person", "Gender", "Number"];

let state = null;

function freshState() {
  const available = getAvailableDatasets();
  return {
    datasets: { selected: available.length ? [available[0]] : [] },
    filters: Object.fromEntries(GENERATOR_COLUMNS.map((c) => [c, []])),
    startSide: "hebrew", // "hebrew" | "english" — which face a card shows first
    started: false,
    deck: [],
    index: 0,
    flipped: false,
    knownCount: 0,
    reviewWords: [],
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();

  const link = consumeDeepLink();
  if (link && link.type === "verb-flashcards-focus") {
    if (link.direction === "hebrew" || link.direction === "english") state.startSide = link.direction;
  }

  render(content, sidebarExtra, navigate);
}

export function unmount() {
  state = null;
}

function srsMode() {
  return "verb-flashcards-" + state.startSide;
}

/** Orders `pool` by spaced-repetition priority (due/weak forms first)
 * and resets round progress. */
function startRound(pool) {
  state.deck = sortByPriority(srsMode(), pool, morphKey);
  state.index = 0;
  state.flipped = false;
  state.knownCount = 0;
  state.reviewWords = [];
}

function render(content, sidebarExtra, navigate) {
  // Preserve the sidebar's scroll position across a filter change — every
  // checkbox toggle calls this same render() to rebuild the whole panel
  // (so derived bits like "Select all"/"Clear all" and dependent option
  // lists stay in sync), which would otherwise reset scroll to the top
  // each time and make picking several boxes in a row from a scrolled-down
  // section (e.g. several lessons) annoying. rAF runs after this
  // function finishes rebuilding the DOM below, so the restore sticks.
  const __sidebarScrollTop = sidebarExtra.scrollTop;
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    sidebarExtra.scrollTop = __sidebarScrollTop;
  });
  content.innerHTML = "";

  const available = getAvailableDatasets();

  sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));

  renderDatasetSelector(sidebarExtra, {
    availableDatasets: available,
    state: state.datasets,
    onChange: () => {
      state.started = false;
      render(content, sidebarExtra, navigate);
    },
  });

  const selected = state.datasets.selected;
  if (!selected || selected.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "Select at least one dataset.";
    content.appendChild(div);
    return;
  }

  const allRows = loadVerbData(selected);

  if (allRows.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No data found for selected datasets.";
    content.appendChild(div);
    return;
  }

  // ---- Sidebar filters (same as Verb Review) ----
  const filterHolder = document.createElement("div");
  filterHolder.className = "sidebar-section";
  sidebarExtra.appendChild(document.createElement("hr")).className = "sidebar-divider";
  sidebarExtra.appendChild(filterHolder);

  renderFilterSidebar(filterHolder, {
    rows: allRows,
    filtersState: state.filters,
    onChange: () => {
      state.started = false;
      render(content, sidebarExtra, navigate);
    },
  });

  // ---- Main content ----
  function pool() {
    return applyFilters(allRows, state.filters);
  }

  if (!state.started) {
    startRound(pool());
    state.started = true;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Verb Flashcards</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the dataset and filters in the sidebar to choose which verb forms to study.<br>
      Click the card to flip it, then mark whether you knew it or want to review it later.<br>
      Cards are ordered to bring back forms you've missed sooner — this deck adapts as you study.
    </div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  const statsForCurrentPool = getMasteryStats(srsMode(), pool(), morphKey);
  const statsCaption = document.createElement("div");
  statsCaption.className = "caption";
  statsCaption.style.marginBottom = "14px";
  statsCaption.textContent = `In this filtered set: ${statsForCurrentPool.newCount} new · ${statsForCurrentPool.learning} learning · ${statsForCurrentPool.mastered} mastered (of ${statsForCurrentPool.total})`;
  content.appendChild(statsCaption);

  // Start-side chooser
  const sideWrap = document.createElement("div");
  sideWrap.style.marginBottom = "20px";
  const sideLabel = document.createElement("div");
  sideLabel.className = "sidebar-label";
  sideLabel.style.marginBottom = "8px";
  sideLabel.textContent = "Start each card with:";
  sideWrap.appendChild(sideLabel);

  const sideGroup = document.createElement("div");
  sideGroup.className = "choice-group";
  for (const [value, label] of [
    ["hebrew", "Hebrew"],
    ["english", "English"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn" + (state.startSide === value ? " selected" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.startSide = value;
      state.flipped = false;
      render(content, sidebarExtra, navigate);
    });
    sideGroup.appendChild(btn);
  }
  sideWrap.appendChild(sideGroup);
  content.appendChild(sideWrap);

  const studyArea = document.createElement("div");
  content.appendChild(studyArea);

  const currentPool = pool();

  if (currentPool.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No verbs match the selected filters.";
    studyArea.appendChild(div);
  } else if (state.deck.length === 0) {
    // Guards against a stale empty deck (e.g. the filtered pool just
    // became non-empty again) — currentPool.length === 0 above already
    // handles the "still empty" case, so reaching here means we just
    // need to (re)seed the round from the now-available pool.
    startRound(currentPool);
    render(content, sidebarExtra, navigate);
    return;
  } else if (state.index >= state.deck.length) {
    renderSummary(studyArea, currentPool);
  } else {
    renderCard(studyArea);
  }

  function renderCard(container) {
    const row = state.deck[state.index];

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.style.marginBottom = "10px";
    caption.textContent = `Card ${state.index + 1} of ${state.deck.length} · ${state.knownCount} known · ${state.reviewWords.length} to review`;
    container.appendChild(caption);

    const startingWithHebrew = state.startSide === "hebrew";
    const showingFrontFace = !state.flipped;
    const showingHebrewFace = showingFrontFace ? startingWithHebrew : !startingWithHebrew;

    const cardBtn = document.createElement("button");
    cardBtn.type = "button";
    cardBtn.className = "flashcard-interactive" + (showingHebrewFace ? "" : " flashcard-interactive-back");
    cardBtn.setAttribute("aria-label", state.flipped ? "Flip card back" : "Flip card to reveal the answer");

    if (showingHebrewFace) {
      cardBtn.innerHTML = `
        <div class="flashcard-interactive-face flashcard-interactive-hebrew">${wrapHebrewSpans(row.Conjugation || "")}</div>
        <div class="flashcard-interactive-hint">${state.flipped ? "" : "Tap to flip"}</div>
      `;
    } else {
      const meta = MORPH_COLUMNS.map((c) => row[c]).filter(Boolean).join(" · ");
      cardBtn.innerHTML = `
        <div class="flashcard-interactive-face flashcard-interactive-english">${wrapHebrewSpans(row["Gloss Translation"] || "")}</div>
        <div class="flashcard-interactive-meta">${meta}</div>
        <div class="flashcard-interactive-hint">${state.flipped ? "" : "Tap to flip"}</div>
      `;
    }
    cardBtn.addEventListener("click", () => {
      state.flipped = !state.flipped;
      render(content, sidebarExtra, navigate);
    });
    container.appendChild(cardBtn);

    const flipRow = document.createElement("div");
    flipRow.className = "button-row";
    const flipBtn = document.createElement("button");
    flipBtn.type = "button";
    flipBtn.className = "btn btn-secondary";
    flipBtn.textContent = state.flipped ? "Flip Back" : "Flip Card";
    flipBtn.addEventListener("click", () => {
      state.flipped = !state.flipped;
      render(content, sidebarExtra, navigate);
    });
    flipRow.appendChild(flipBtn);
    container.appendChild(flipRow);

    const markRow = document.createElement("div");
    markRow.className = "button-row";

    const knowBtn = document.createElement("button");
    knowBtn.type = "button";
    knowBtn.className = "btn btn-know";
    knowBtn.textContent = "I Know It";
    knowBtn.addEventListener("click", () => {
      recordItemResult(srsMode(), morphKey(row), true);
      recordStreakActivity();
      state.knownCount += 1;
      state.index += 1;
      state.flipped = false;
      render(content, sidebarExtra, navigate);
    });

    const reviewBtn = document.createElement("button");
    reviewBtn.type = "button";
    reviewBtn.className = "btn btn-review";
    reviewBtn.textContent = "Review Later";
    reviewBtn.addEventListener("click", () => {
      recordItemResult(srsMode(), morphKey(row), false);
      recordStreakActivity();
      state.reviewWords.push(row);
      state.index += 1;
      state.flipped = false;
      render(content, sidebarExtra, navigate);
    });

    markRow.appendChild(knowBtn);
    markRow.appendChild(reviewBtn);
    container.appendChild(markRow);
  }

  function renderSummary(container, poolForRestart) {
    const total = state.deck.length;
    const summaryBox = document.createElement("div");
    summaryBox.className = "info-box";
    summaryBox.innerHTML = `
      <b>Round Complete</b><br>
      You knew ${state.knownCount} of ${total} form${total === 1 ? "" : "s"}.
      ${state.reviewWords.length ? ` ${state.reviewWords.length} marked for review.` : ""}
    `;
    container.appendChild(summaryBox);

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    if (state.reviewWords.length > 0) {
      const reviewAgainBtn = document.createElement("button");
      reviewAgainBtn.type = "button";
      reviewAgainBtn.className = "btn";
      reviewAgainBtn.textContent = `Study ${state.reviewWords.length} Review Form${state.reviewWords.length === 1 ? "" : "s"}`;
      reviewAgainBtn.addEventListener("click", () => {
        startRound(state.reviewWords);
        render(content, sidebarExtra, navigate);
      });
      btnRow.appendChild(reviewAgainBtn);
    }

    const restartBtn = document.createElement("button");
    restartBtn.type = "button";
    restartBtn.className = "btn btn-secondary";
    restartBtn.textContent = "Restart Full Round";
    restartBtn.addEventListener("click", () => {
      startRound(poolForRestart);
      render(content, sidebarExtra, navigate);
    });
    btnRow.appendChild(restartBtn);

    container.appendChild(btnRow);
  }

  // Navigation
  const navWrap = document.createElement("div");
  navWrap.innerHTML = `<hr class="hr"/>`;
  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => navigate("home"));
  navWrap.appendChild(homeBtn);
  content.appendChild(navWrap);
}
