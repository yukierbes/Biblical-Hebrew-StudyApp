import { getLetterSet, freshFilters, applyLetterFilters } from "../letter-sets.js";
import { selectFiltersMessage } from "../filter-state.js";
import { renderLetterFilters, resetSidebarKeepingScroll } from "../letter-sidebar.js";
import { renderAmbiguityHintPanel } from "../letter-answer-matching.js";
import { sortByPriority, recordItemResult, recordStreakActivity, getMasteryStats } from "../srs.js";
import { attachSwipeToMark } from "../swipe-card.js";

/**
 * Flashcards for the Consonants or Vowels set. The Hebrew is on the front;
 * the back shows the name and its transliteration (consonants) or its class
 * and length (vowels). Cards you miss come back sooner (spaced repetition).
 */
export function createFlashcardsPage(setId) {
  const set = getLetterSet(setId);
  const SRS_MODE = `${set.srsPrefix}-flashcards`;
  const pageKey = `${set.pagePrefix}-flashcards`;
  let state = null;

  function freshState() {
    return {
      filters: freshFilters(set),
      started: false,
      deck: [],
      index: 0,
      flipped: false,
      knownCount: 0,
      reviewWords: [],
      hintsRevealed: 0, // the "two vowels share this mark" hint, per card
    };
  }

  function mount({ content, sidebarExtra, navigate }) {
    state = freshState();
    render(content, sidebarExtra, navigate);
  }

  function unmount() {
    state = null;
  }

  function startRound(pool) {
    state.deck = sortByPriority(SRS_MODE, pool, set.rowKey);
    state.index = 0;
    state.flipped = false;
    state.knownCount = 0;
    state.reviewWords = [];
    state.hintsRevealed = 0;
  }

  function render(content, sidebarExtra, navigate) {
    resetSidebarKeepingScroll(sidebarExtra);
    content.innerHTML = "";

    const allRows = set.rows();
    if (!allRows.length) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = `No ${set.plural} data found.`;
      content.appendChild(div);
      return;
    }

    function pool() {
      return applyLetterFilters(set, allRows, state.filters);
    }
    function restartAndRender() {
      startRound(pool());
      render(content, sidebarExtra, navigate);
    }

    renderLetterFilters(sidebarExtra, { set, state, pageKey, onChange: restartAndRender });

    if (!state.started) {
      startRound(pool());
      state.started = true;
    }

    const filterNames = set.filters.map((f) => f.label).join(" and ");
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <h1 class="page-title">${set.title} Flashcards</h1>
      <div class="info-box">
        <b>Instructions</b><br>
        Use the ${filterNames} filter${set.filters.length > 1 ? "s" : ""} in the sidebar to choose which ${set.plural} to study.<br>
        Each card shows the ${set.singular} in Hebrew — click to flip it and reveal its ${
          set.id === "vowels" ? "name, class, and length" : "name and transliteration"
        }.<br>
        Cards are ordered to bring back ${set.plural} you've missed sooner — this deck adapts as you study.
      </div>
      <hr class="hr" />
    `;
    content.appendChild(wrap);

    const stats = getMasteryStats(SRS_MODE, pool(), set.rowKey);
    const statsCaption = document.createElement("div");
    statsCaption.className = "caption";
    statsCaption.style.marginBottom = "14px";
    statsCaption.textContent = `In this filtered set: ${stats.newCount} new · ${stats.learning} learning · ${stats.mastered} mastered (of ${stats.total})`;
    content.appendChild(statsCaption);

    const studyArea = document.createElement("div");
    content.appendChild(studyArea);

    const currentPool = pool();
    if (currentPool.length === 0) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = selectFiltersMessage(state.filters, Object.fromEntries(set.filters.map((f) => [f.key, f.label])), `No ${set.plural} match the selected filters.`);
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

    function advance() {
      state.index += 1;
      state.flipped = false;
      state.hintsRevealed = 0;
      render(content, sidebarExtra, navigate);
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
          <div class="flashcard-interactive-face flashcard-interactive-hebrew">${set.frontHtml(row)}</div>
          <div class="flashcard-interactive-hint">Tap to flip</div>
        `;
      } else {
        const secondary = set.backSecondary(row);
        const meta = set.backMeta(row);
        cardBtn.innerHTML = `
          <div class="flashcard-interactive-face flashcard-interactive-english">${row.Name}</div>
          ${secondary ? `<div class="flashcard-interactive-face flashcard-interactive-english" style="font-size:1.3rem;">${secondary}</div>` : ""}
          ${meta ? `<div class="flashcard-interactive-meta">${meta}</div>` : ""}
          <div class="flashcard-swipe-hint">← Review Later &nbsp;·&nbsp; Know It →</div>
        `;
      }
      cardBtn.addEventListener("click", () => {
        state.flipped = !state.flipped;
        render(content, sidebarExtra, navigate);
      });
      container.appendChild(cardBtn);

      // qameṣ and qameṣ-ḥaṭuf look the same on the front: offer the class as a hint.
      if (!state.flipped) {
        renderAmbiguityHintPanel(container, set, row, state, () => render(content, sidebarExtra, navigate));
      }

      function markKnown() {
        recordItemResult(SRS_MODE, set.rowKey(row), true);
        recordStreakActivity();
        state.knownCount += 1;
        advance();
      }
      function markReview() {
        recordItemResult(SRS_MODE, set.rowKey(row), false);
        recordStreakActivity();
        state.reviewWords.push(row);
        advance();
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
        You knew ${state.knownCount} of ${total} ${total === 1 ? set.singular : set.plural}.
        ${state.reviewWords.length ? ` ${state.reviewWords.length} marked for review.` : ""}
      `;
      container.appendChild(summaryBox);

      const btnRow = document.createElement("div");
      btnRow.className = "button-row";

      if (state.reviewWords.length > 0) {
        const again = document.createElement("button");
        again.type = "button";
        again.className = "btn";
        const n = state.reviewWords.length;
        again.textContent = `Study ${n} Review ${n === 1 ? set.Singular : set.Singular + "s"}`;
        again.addEventListener("click", () => {
          startRound(state.reviewWords);
          render(content, sidebarExtra, navigate);
        });
        btnRow.appendChild(again);
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

    const navWrap = document.createElement("div");
    navWrap.innerHTML = `<hr class="hr"/>`;
    const homeBtn = document.createElement("button");
    homeBtn.className = "btn btn-secondary";
    homeBtn.textContent = "Return to Home Page";
    homeBtn.addEventListener("click", () => navigate("home"));
    navWrap.appendChild(homeBtn);
    content.appendChild(navWrap);
  }

  return { mount, unmount };
}
