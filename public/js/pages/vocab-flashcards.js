import { getVocabRows, getLessonOrder, getPosOrder } from "../vocab-data.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { wrapHebrewSpans } from "../helpers.js";
import { applyVocabFilters, getCategoryOptions, vocabRowKey } from "../vocab-overrides.js";
import { getRootOptions, applyRootFilter } from "../vocab-roots.js";
import { sortByPriority, recordItemResult, recordStreakActivity, getMasteryStats } from "../srs.js";
import { consumeDeepLink } from "../deep-link.js";
import { attachSwipeToMark } from "../swipe-card.js";

let state = null;

function freshState() {
  return {
    filters: { Lesson: [], POS: [], Category: [], Root: [] },
    minFrequency: "",
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
  if (link && link.type === "vocab-flashcards-focus") {
    if (link.direction === "hebrew" || link.direction === "english") state.startSide = link.direction;
  }

  render(content, sidebarExtra, navigate);
}

export function unmount() {
  state = null;
}

function srsMode() {
  return "vocab-flashcards-" + state.startSide;
}

/** Orders `pool` by spaced-repetition priority (due/weak words first)
 * and resets round progress. */
function startRound(pool) {
  state.deck = sortByPriority(srsMode(), pool, vocabRowKey);
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

  const allRows = getVocabRows();

  if (!allRows.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No vocabulary data found.";
    content.appendChild(div);
    return;
  }

  // ---- Sidebar filters (same Lesson / POS / Category / Minimum
  // Frequency filters as the Vocabulary Review page) ----
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
    state.filters = { Lesson: [], POS: [], Category: [], Root: [] };
    state.minFrequency = "";
    restartAndRender();
  });
  filterWrap.appendChild(resetBtn);

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "vocab-flashcards",
    getSnapshot: () => ({ filters: state.filters, minFrequency: state.minFrequency }),
    applySnapshot: (snap) => {
      state.filters = { Lesson: [], POS: [], Category: [], Root: [], ...snap.filters };
      state.minFrequency = snap.minFrequency || "";
      restartAndRender();
    },
  });
  filterWrap.appendChild(presetDiv);


  const lessonDiv = document.createElement("div");
  lessonDiv.style.marginBottom = "14px";
  renderCheckboxList(lessonDiv, {
    label: "Lesson",
    options: getLessonOrder(),
    selected: state.filters.Lesson,
    onChange: (next) => {
      state.filters.Lesson = next;
      restartAndRender();
    },
  });
  filterWrap.appendChild(lessonDiv);

  const posDiv = document.createElement("div");
  posDiv.style.marginBottom = "14px";
  renderCheckboxList(posDiv, {
    label: "Part of Speech",
    options: getPosOrder(),
    selected: state.filters.POS,
    onChange: (next) => {
      state.filters.POS = next;
      restartAndRender();
    },
  });
  filterWrap.appendChild(posDiv);

  const categoryDiv = document.createElement("div");
  categoryDiv.style.marginBottom = "14px";
  renderCheckboxList(categoryDiv, {
    label: "Category",
    options: getCategoryOptions(),
    selected: state.filters.Category,
    onChange: (next) => {
      state.filters.Category = next;
      restartAndRender();
    },
  });
  filterWrap.appendChild(categoryDiv);

  const rootDiv = document.createElement("div");
  rootDiv.style.marginBottom = "14px";
  renderCheckboxList(rootDiv, {
    label: "Root",
    options: getRootOptions(),
    selected: state.filters.Root,
    onChange: (next) => {
      state.filters.Root = next;
      restartAndRender();
    },
  });
  filterWrap.appendChild(rootDiv);

  const freqDiv = document.createElement("div");
  const freqLabel = document.createElement("div");
  freqLabel.className = "sidebar-label";
  freqLabel.textContent = "Minimum Frequency";
  const freqInput = document.createElement("input");
  freqInput.type = "number";
  freqInput.min = "0";
  freqInput.placeholder = "e.g. 50";
  freqInput.value = state.minFrequency;
  freqInput.style.width = "100%";
  freqInput.style.padding = "6px 8px";
  freqInput.style.borderRadius = "var(--radius)";
  freqInput.style.border = "1px solid var(--hairline)";
  freqInput.addEventListener("input", () => {
    // Just record the value while typing. Unlike the Review page's
    // table, restarting the round (reshuffling the deck) on every
    // keystroke would yank away whatever card is currently being
    // studied — so the new threshold is applied once the person
    // commits it (blur/Enter, handled by "change" below), or by
    // pressing "Restart Round" in the study area.
    state.minFrequency = freqInput.value;
  });
  freqInput.addEventListener("change", () => {
    restartAndRender();
  });
  freqDiv.appendChild(freqLabel);
  freqDiv.appendChild(freqInput);
  filterWrap.appendChild(freqDiv);

  sidebarExtra.appendChild(filterWrap);

  // ---- Main content ----
  function pool() {
    return applyRootFilter(applyVocabFilters(allRows, state.filters, state.minFrequency), state.filters.Root);
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
    <h1 class="page-title">Vocabulary Flashcards</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the filters in the sidebar to choose which words to study.<br>
      Click the card to flip it, then mark whether you knew it or want to review it later.<br>
      Cards are ordered to bring back words you've missed sooner — this deck adapts as you study.
    </div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  const statsForCurrentPool = getMasteryStats(srsMode(), pool(), vocabRowKey);
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
    div.textContent = "No vocabulary matches the selected filters.";
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
        <div class="flashcard-interactive-face flashcard-interactive-hebrew">${wrapHebrewSpans(row.Hebrew || "")}</div>
        <div class="flashcard-interactive-hint">${state.flipped ? "" : "Tap to flip"}</div>
        ${state.flipped ? `<div class="flashcard-swipe-hint">← Review Later &nbsp;·&nbsp; Know It →</div>` : ""}
      `;
    } else {
      const meta = [row.Lesson, row.POS, Number.isFinite(row.Frequency) ? `Freq ${row.Frequency}` : null]
        .filter(Boolean)
        .join(" · ");
      cardBtn.innerHTML = `
        <div class="flashcard-interactive-face flashcard-interactive-english">${wrapHebrewSpans(row.English || "")}</div>
        <div class="flashcard-interactive-meta">${meta}</div>
        <div class="flashcard-interactive-hint">${state.flipped ? "" : "Tap to flip"}</div>
        ${state.flipped ? `<div class="flashcard-swipe-hint">← Review Later &nbsp;·&nbsp; Know It →</div>` : ""}
      `;
    }
    cardBtn.addEventListener("click", () => {
      state.flipped = !state.flipped;
      render(content, sidebarExtra, navigate);
    });
    container.appendChild(cardBtn);

    function markKnown() {
      recordItemResult(srsMode(), vocabRowKey(row), true);
      recordStreakActivity();
      state.knownCount += 1;
      state.index += 1;
      state.flipped = false;
      render(content, sidebarExtra, navigate);
    }

    function markReview() {
      recordItemResult(srsMode(), vocabRowKey(row), false);
      recordStreakActivity();
      state.reviewWords.push(row);
      state.index += 1;
      state.flipped = false;
      render(content, sidebarExtra, navigate);
    }

    // On a touchscreen, once the card is flipped (showing the answer),
    // swipe right for "I Know It" / left for "Review Later" — same
    // outcome as the buttons below, just faster once flipped.
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
      You knew ${state.knownCount} of ${total} word${total === 1 ? "" : "s"}.
      ${state.reviewWords.length ? ` ${state.reviewWords.length} marked for review.` : ""}
    `;
    container.appendChild(summaryBox);

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    if (state.reviewWords.length > 0) {
      const reviewAgainBtn = document.createElement("button");
      reviewAgainBtn.type = "button";
      reviewAgainBtn.className = "btn";
      reviewAgainBtn.textContent = `Study ${state.reviewWords.length} Review Word${state.reviewWords.length === 1 ? "" : "s"}`;
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
