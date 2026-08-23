import { getAvailableDatasets, loadVerbData } from "../data.js";
import { getVocabRows } from "../vocab-data.js";
import { getCategoriesDisplay, vocabRowKey } from "../vocab-overrides.js";
import { getAccentRows } from "../accent-data.js";
import { renderDatasetSelector } from "../widgets.js";
import { renderTable } from "../table.js";
import { wrapHebrewSpans, stripNiqqud } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { openHebrewKeyboard } from "../hebrew-keyboard.js";
import { setDeepLink } from "../deep-link.js";

const RESULT_CAP = 200;
const DISPLAY_COLUMNS = ["Dataset", "Binyan", "Mode", "Person", "Gender", "Number", "Conjugation", "Gloss Translation"];
const VOCAB_DISPLAY_COLUMNS = ["Lesson", "Hebrew", "English", "POS", "Category", "Frequency"];
const ACCENT_DISPLAY_COLUMNS = ["Type", "Group", "HebrewName", "EnglishName", "Symbol", "Placement", "Keyboard"];

let state = null;

function freshState() {
  const available = getAvailableDatasets();
  return {
    // Defaults to every dataset — this is a quick reference tool, not a
    // practice session, so it should search the whole corpus unless the
    // person narrows it down themselves.
    datasets: { selected: [...available] },
    query: "",
    searchHebrew: true,
    searchGloss: true,
    ignoreNiqqud: true,
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();
  render(content, sidebarExtra, navigate);
}

export function unmount() {
  state = null;
}

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(content, sidebarExtra, navigate) {
  // Preserve the sidebar's scroll position across a filter change — every
  // checkbox toggle calls this same render() to rebuild the whole panel
  // (so derived bits like "Select all"/"Clear all" and dependent option
  // lists stay in sync), which would otherwise reset scroll to the top
  // each time and make picking several boxes in a row from a scrolled-down
  // section (e.g. several lessons) annoying. rAF runs after this
  // function finishes rebuilding the DOM below, so the restore sticks.
  // The panel that actually scrolls is the outer #sidebar element (see
  // css/style.css), not sidebarExtra itself — sidebarExtra is just one
  // inner section of it, alongside Navigation/Account/Progress/etc.
  const __scrollContainer = sidebarExtra.closest("#sidebar") || sidebarExtra;
  const __sidebarScrollTop = __scrollContainer.scrollTop;
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    __scrollContainer.scrollTop = __sidebarScrollTop;
  });
  content.innerHTML = "";

  const available = getAvailableDatasets();

  sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));
  renderDatasetSelector(sidebarExtra, {
    availableDatasets: available,
    state: state.datasets,
    onChange: () => render(content, sidebarExtra, navigate),
  });

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Word Lookup</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Type a Hebrew word (or part of one) to find every verb parsing and vocabulary word that matches it,<br>
      or type an English word to search the glosses and vocabulary translations instead.<br>
      With <i>Ignore Niqqud</i> on (the default), a search without vowel points matches words that have them — e.g. "קטל" finds "קָטַל".
    </div>
  `;
  content.appendChild(wrap);

  const searchBox = document.createElement("div");
  searchBox.style.maxWidth = "480px";
  searchBox.style.margin = "0 auto 20px auto";

  const searchRow = document.createElement("div");
  searchRow.style.display = "flex";
  searchRow.style.gap = "8px";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "e.g. קָטַל or \"he killed\"";
  input.value = state.query;
  input.setAttribute("dir", "auto");
  input.style.flex = "1";
  input.style.padding = "10px 12px";
  input.style.fontSize = "1.1rem";
  input.style.borderRadius = "var(--radius)";
  input.style.border = "1px solid var(--hairline)";
  input.style.fontFamily = "var(--font-hebrew), var(--font-body)";
  input.addEventListener("input", () => {
    state.query = input.value;
    renderResults();
  });
  searchRow.appendChild(input);

  const kbBtn = document.createElement("button");
  kbBtn.type = "button";
  kbBtn.className = "btn btn-outline btn-sm";
  kbBtn.style.flexShrink = "0";
  kbBtn.textContent = "Hebrew Keyboard";
  kbBtn.addEventListener("click", () => openHebrewKeyboard(input));
  searchRow.appendChild(kbBtn);

  searchBox.appendChild(searchRow);

  const optionsRow = document.createElement("div");
  optionsRow.className = "radio-row";
  optionsRow.style.marginTop = "10px";
  optionsRow.style.justifyContent = "center";

  const hebLabel = document.createElement("label");
  const hebCb = document.createElement("input");
  hebCb.type = "checkbox";
  hebCb.checked = state.searchHebrew;
  hebCb.addEventListener("change", () => {
    state.searchHebrew = hebCb.checked;
    renderResults();
  });
  hebLabel.appendChild(hebCb);
  hebLabel.appendChild(document.createTextNode(" Search Hebrew"));

  const glossLabel = document.createElement("label");
  const glossCb = document.createElement("input");
  glossCb.type = "checkbox";
  glossCb.checked = state.searchGloss;
  glossCb.addEventListener("change", () => {
    state.searchGloss = glossCb.checked;
    renderResults();
  });
  glossLabel.appendChild(glossCb);
  glossLabel.appendChild(document.createTextNode(" Search Gloss / English"));

  const niqqudLabel = document.createElement("label");
  const niqqudCb = document.createElement("input");
  niqqudCb.type = "checkbox";
  niqqudCb.checked = state.ignoreNiqqud;
  niqqudCb.addEventListener("change", () => {
    state.ignoreNiqqud = niqqudCb.checked;
    renderResults();
  });
  niqqudLabel.appendChild(niqqudCb);
  niqqudLabel.appendChild(document.createTextNode(" Ignore Niqqud (vowel points)"));

  optionsRow.appendChild(hebLabel);
  optionsRow.appendChild(glossLabel);
  optionsRow.appendChild(niqqudLabel);
  searchBox.appendChild(optionsRow);

  content.appendChild(searchBox);
  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const resultsSection = document.createElement("div");
  content.appendChild(resultsSection);

  function renderResults() {
    resultsSection.innerHTML = "";

    const query = state.query.trim();
    if (!query) {
      const div = document.createElement("div");
      div.className = "alert alert-info";
      div.textContent = "Start typing to search.";
      resultsSection.appendChild(div);
      return;
    }

    if (!state.searchHebrew && !state.searchGloss) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = "Turn on at least one of Search Hebrew / Search Gloss.";
      resultsSection.appendChild(div);
      return;
    }

    const queryLower = query.toLowerCase();
    const queryStripped = stripNiqqud(query);

    // ---- Verb forms ----
    const verbHeading = document.createElement("h3");
    verbHeading.textContent = "Verb Forms";
    resultsSection.appendChild(verbHeading);

    const selected = state.datasets.selected;
    if (!selected || selected.length === 0) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = "Select at least one dataset in the sidebar to search verb forms.";
      resultsSection.appendChild(div);
    } else {
      const df = loadVerbData(selected);

      const verbMatches = df.filter((row) => {
        const conjugation = row.Conjugation || "";
        const inHebrew =
          state.searchHebrew &&
          (state.ignoreNiqqud ? stripNiqqud(conjugation).includes(queryStripped) : conjugation.includes(query));
        const inGloss =
          state.searchGloss && (row["Gloss Translation"] || "").toLowerCase().includes(queryLower);
        return inHebrew || inGloss;
      });

      const caption = document.createElement("div");
      caption.className = "caption";
      caption.textContent =
        verbMatches.length === 0
          ? "No matches."
          : verbMatches.length > RESULT_CAP
          ? `Showing first ${RESULT_CAP} of ${verbMatches.length} matches — narrow your search or datasets for more precise results.`
          : `${verbMatches.length} match${verbMatches.length === 1 ? "" : "es"}.`;
      resultsSection.appendChild(caption);

      if (verbMatches.length > 0) {
        const shown = verbMatches.slice(0, RESULT_CAP);
        const tableWrap = document.createElement("div");
        renderTable(tableWrap, shown, {
          columns: DISPLAY_COLUMNS,
          cellRenderers: { Dataset: (v) => wrapHebrewSpans(v) },
        });
        resultsSection.appendChild(tableWrap);

        const printBtn = document.createElement("button");
        printBtn.className = "btn btn-block";
        printBtn.style.marginTop = "14px";
        printBtn.textContent = "Print These as Flashcards";
        printBtn.addEventListener("click", () => printFlashcards(shown, { title: `Search: ${query}` }));
        resultsSection.appendChild(printBtn);
      }
    }

    resultsSection.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    // ---- Vocabulary ----
    const vocabHeading = document.createElement("h3");
    vocabHeading.textContent = "Vocabulary";
    resultsSection.appendChild(vocabHeading);

    const vocabMatches = getVocabRows().filter((row) => {
      const hebrew = row.Hebrew || "";
      const inHebrew =
        state.searchHebrew &&
        (state.ignoreNiqqud ? stripNiqqud(hebrew).includes(queryStripped) : hebrew.includes(query));
      const inEnglish = state.searchGloss && (row.English || "").toLowerCase().includes(queryLower);
      return inHebrew || inEnglish;
    });

    const vocabCaption = document.createElement("div");
    vocabCaption.className = "caption";
    vocabCaption.textContent =
      vocabMatches.length === 0
        ? "No matches."
        : vocabMatches.length > RESULT_CAP
        ? `Showing first ${RESULT_CAP} of ${vocabMatches.length} matches — narrow your search for more precise results.`
        : `${vocabMatches.length} match${vocabMatches.length === 1 ? "" : "es"}.`;
    resultsSection.appendChild(vocabCaption);

    if (vocabMatches.length > 0) {
      const vocabShown = vocabMatches.slice(0, RESULT_CAP);
      const vocabTableWrap = document.createElement("div");
      renderTable(vocabTableWrap, vocabShown, {
        columns: [...VOCAB_DISPLAY_COLUMNS, "Edit"],
        cellRenderers: {
          Hebrew: (v) => wrapHebrewSpans(v),
          Category: (v, row) => escapeHtml(getCategoriesDisplay(row)) || "—",
          Edit: (v, row) =>
            `<button type="button" class="btn btn-outline btn-sm vocab-search-edit-btn" data-key="${encodeURIComponent(
              vocabRowKey(row)
            )}">Edit Category →</button>`,
        },
      });
      resultsSection.appendChild(vocabTableWrap);

      vocabTableWrap.querySelectorAll(".vocab-search-edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = decodeURIComponent(btn.dataset.key);
          const row = vocabShown.find((r) => vocabRowKey(r) === key);
          if (!row) return;
          setDeepLink({ type: "vocab-review-edit-category", row });
          navigate("vocabulary");
        });
      });

      const vocabPrintBtn = document.createElement("button");
      vocabPrintBtn.className = "btn btn-block";
      vocabPrintBtn.style.marginTop = "14px";
      vocabPrintBtn.textContent = "Print These as Flashcards";
      vocabPrintBtn.addEventListener("click", () =>
        printFlashcards(vocabShown, {
          title: `Search: ${query}`,
          frontField: "Hebrew",
          backField: "English",
          metaFields: ["Lesson", "POS", "Frequency"],
        })
      );
      resultsSection.appendChild(vocabPrintBtn);
    }

    resultsSection.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

    // ---- Accents ----
    const accentHeading = document.createElement("h3");
    accentHeading.textContent = "Accents";
    resultsSection.appendChild(accentHeading);

    const accentMatches = getAccentRows().filter((row) => {
      const hebrew = row.HebrewName || "";
      const inHebrew =
        state.searchHebrew &&
        (state.ignoreNiqqud ? stripNiqqud(hebrew).includes(queryStripped) : hebrew.includes(query));
      const inEnglish = state.searchGloss && (row.EnglishName || "").toLowerCase().includes(queryLower);
      return inHebrew || inEnglish;
    });

    const accentCaption = document.createElement("div");
    accentCaption.className = "caption";
    accentCaption.textContent =
      accentMatches.length === 0
        ? "No matches."
        : accentMatches.length > RESULT_CAP
        ? `Showing first ${RESULT_CAP} of ${accentMatches.length} matches — narrow your search for more precise results.`
        : `${accentMatches.length} match${accentMatches.length === 1 ? "" : "es"}.`;
    resultsSection.appendChild(accentCaption);

    if (accentMatches.length > 0) {
      const accentShown = accentMatches.slice(0, RESULT_CAP);
      const accentTableWrap = document.createElement("div");
      renderTable(accentTableWrap, accentShown, {
        columns: ACCENT_DISPLAY_COLUMNS,
        cellRenderers: {
          HebrewName: (v) => wrapHebrewSpans(v),
          Symbol: (v) => `<span class="accent-symbol-cell" lang="he">${v || ""}</span>`,
          Placement: (v) => wrapHebrewSpans(v),
          Group: (v) => (v ? v : `<span class="caption">—</span>`),
        },
      });
      resultsSection.appendChild(accentTableWrap);

      const accentPrintBtn = document.createElement("button");
      accentPrintBtn.className = "btn btn-block";
      accentPrintBtn.style.marginTop = "14px";
      accentPrintBtn.textContent = "Print These as Flashcards";
      accentPrintBtn.addEventListener("click", () =>
        printFlashcards(accentShown, {
          title: `Search: ${query}`,
          frontField: "Placement",
          backField: "HebrewName",
          backFieldIsHebrew: true,
          secondaryField: "EnglishName",
          metaFields: ["Type", "Group"],
        })
      );
      resultsSection.appendChild(accentPrintBtn);
    }
  }

  renderResults();

  const navWrap = document.createElement("div");
  navWrap.innerHTML = `<hr class="hr"/>`;
  const homeBtn = document.createElement("button");
  homeBtn.className = "btn btn-secondary";
  homeBtn.textContent = "Return to Home Page";
  homeBtn.addEventListener("click", () => navigate("home"));
  navWrap.appendChild(homeBtn);
  content.appendChild(navWrap);
}
