import { getAccentRows, getTypeOrder, getGroupOrder } from "../accent-data.js";
import { applyAccentFilters, accentRowKey } from "../accent-filters.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { wrapHebrewSpans } from "../helpers.js";
import { sortByPriority, recordItemResult, recordStreakActivity, getMasteryStats } from "../srs.js";
import { attachSwipeToMark } from "../swipe-card.js";

const SRS_MODE = "accent-flashcards";

let state = null;

function freshState() {
  return {
    filters: { Type: [], Group: [] },
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
  render(content, sidebarExtra, navigate);
}

export function unmount() {
  state = null;
}

/** Orders `pool` by spaced-repetition priority (due/weak accents
 * first) and resets round progress. */
function startRound(pool) {
  state.deck = sortByPriority(SRS_MODE, pool, accentRowKey);
  state.index = 0;
  state.flipped = false;
  state.knownCount = 0;
  state.reviewWords = [];
}

function render(content, sidebarExtra, navigate) {
  sidebarExtra.innerHTML = "";
  content.innerHTML = "";

  const allRows = getAccentRows();

  if (!allRows.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No accents data found.";
    content.appendChild(div);
    return;
  }

  // ---- Sidebar filters ----
  sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));

  const filterWrap = document.createElement("div");
  filterWrap.className = "sidebar-section";
  const filterTitle = document.createElement("h3");
  filterTitle.className = "sidebar-title";
  filterTitle.textContent = "Filters";
  filterWrap.appendChild(filterTitle);

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn btn-outline btn-block";
  resetBtn.textContent = "Reset Filters";
  resetBtn.style.marginBottom = "12px";
  resetBtn.addEventListener("click", () => {
    state.filters = { Type: [], Group: [] };
    restartAndRender();
  });
  filterWrap.appendChild(resetBtn);

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "accent-flashcards",
    getSnapshot: () => ({ filters: state.filters }),
    applySnapshot: (snap) => {
      state.filters = { Type: [], Group: [], ...snap.filters };
      restartAndRender();
    },
  });
  filterWrap.appendChild(presetDiv);


  const typeDiv = document.createElement("div");
  typeDiv.style.marginBottom = "14px";
  renderCheckboxList(typeDiv, {
    label: "Type",
    options: getTypeOrder(),
    selected: state.filters.Type,
    onChange: (next) => {
      state.filters.Type = next;
      restartAndRender();
    },
  });
  filterWrap.appendChild(typeDiv);

  const groupDiv = document.createElement("div");
  groupDiv.style.marginBottom = "14px";
  renderCheckboxList(groupDiv, {
    label: "Group",
    options: getGroupOrder(),
    selected: state.filters.Group,
    onChange: (next) => {
      state.filters.Group = next;
      restartAndRender();
    },
  });
  filterWrap.appendChild(groupDiv);

  sidebarExtra.appendChild(filterWrap);

  // ---- Main content ----
  function pool() {
    return applyAccentFilters(allRows, state.filters);
  }

  function restartAndRender() {
    startRound(pool());
    render(content, sidebarExtra, navigate);
  }

  if (!state.started) {
    startRound(pool());
    state.started = true;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Accents Flashcards</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the Type and Group filters in the sidebar to choose which accents to study.<br>
      Each card shows the accent in context (<b>Placement</b>) — click to flip it and reveal its name and grouping.<br>
      Cards are ordered to bring back accents you've missed sooner — this deck adapts as you study.
    </div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  const statsForCurrentPool = getMasteryStats(SRS_MODE, pool(), accentRowKey);
  const statsCaption = document.createElement("div");
  statsCaption.className = "caption";
  statsCaption.style.marginBottom = "14px";
  statsCaption.textContent = `In this filtered set: ${statsForCurrentPool.newCount} new · ${statsForCurrentPool.learning} learning · ${statsForCurrentPool.mastered} mastered (of ${statsForCurrentPool.total})`;
  content.appendChild(statsCaption);

  const studyArea = document.createElement("div");
  content.appendChild(studyArea);

  const currentPool = pool();

  if (currentPool.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No accents match the selected filters.";
    studyArea.appendChild(div);
  } else if (state.deck.length === 0) {
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

    const cardBtn = document.createElement("button");
    cardBtn.type = "button";
    cardBtn.className = "flashcard-interactive" + (state.flipped ? " flashcard-interactive-back" : "");
    cardBtn.setAttribute("aria-label", state.flipped ? "Flip card back" : "Flip card to reveal the answer");

    if (!state.flipped) {
      cardBtn.innerHTML = `
        <div class="flashcard-interactive-face flashcard-interactive-hebrew">${wrapHebrewSpans(row.Placement || "")}</div>
        <div class="flashcard-interactive-hint">Tap to flip</div>
      `;
    } else {
      const meta = [row.Type, row.Group ? `Group ${row.Group}` : null].filter(Boolean).join(" · ");
      cardBtn.innerHTML = `
        <div class="flashcard-interactive-face flashcard-interactive-hebrew">${wrapHebrewSpans(row.HebrewName || "")}</div>
        <div class="flashcard-interactive-face flashcard-interactive-english">${row.EnglishName || ""}</div>
        <div class="flashcard-interactive-meta">${meta}</div>
        <div class="flashcard-swipe-hint">← Review Later &nbsp;·&nbsp; Know It →</div>
      `;
    }
    cardBtn.addEventListener("click", () => {
      state.flipped = !state.flipped;
      render(content, sidebarExtra, navigate);
    });
    container.appendChild(cardBtn);

    function markKnown() {
      recordItemResult(SRS_MODE, accentRowKey(row), true);
      recordStreakActivity();
      state.knownCount += 1;
      state.index += 1;
      state.flipped = false;
      render(content, sidebarExtra, navigate);
    }

    function markReview() {
      recordItemResult(SRS_MODE, accentRowKey(row), false);
      recordStreakActivity();
      state.reviewWords.push(row);
      state.index += 1;
      state.flipped = false;
      render(content, sidebarExtra, navigate);
    }

    attachSwipeToMark(cardBtn, {
      isEnabled: () => state.flipped,
      onSwipeRight: markKnown,
      onSwipeLeft: markReview,
    });

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
    knowBtn.addEventListener("click", markKnown);

    const reviewBtn = document.createElement("button");
    reviewBtn.type = "button";
    reviewBtn.className = "btn btn-review";
    reviewBtn.textContent = "Review Later";
    reviewBtn.addEventListener("click", markReview);

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
      You knew ${state.knownCount} of ${total} accent${total === 1 ? "" : "s"}.
      ${state.reviewWords.length ? ` ${state.reviewWords.length} marked for review.` : ""}
    `;
    container.appendChild(summaryBox);

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    if (state.reviewWords.length > 0) {
      const reviewAgainBtn = document.createElement("button");
      reviewAgainBtn.type = "button";
      reviewAgainBtn.className = "btn";
      reviewAgainBtn.textContent = `Study ${state.reviewWords.length} Review Accent${state.reviewWords.length === 1 ? "" : "s"}`;
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
