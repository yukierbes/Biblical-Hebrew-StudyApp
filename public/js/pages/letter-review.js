import { getLetterSet, freshFilters, applyLetterFilters } from "../letter-sets.js";
import { selectFiltersMessage } from "../filter-state.js";
import { renderLetterFilters, resetSidebarKeepingScroll } from "../letter-sidebar.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { createColumnState, visibleColumns, renderColumnPicker } from "../review-columns.js";
import { createPrintState, renderReviewTools } from "../review-tools.js";

import { addTrayColumn } from "../item-tray.js";
import { letterSpec } from "../item-specs.js";
/**
 * The Review page for the Consonants or Vowels set: a filterable table with
 * the Print Table and Download & Print sections above it. Written once and
 * used for both sets — see letter-sets.js for what differs between them.
 */
export function createReviewPage(setId) {
  const set = getLetterSet(setId);
  const pageKey = `${set.pagePrefix}-review`;
  let state = null;

  function mount({ content, sidebarExtra, navigate }) {
    state = {
      filters: freshFilters(set),
      columns: createColumnState(pageKey, set.columns),
      // The Keyboard Key column is left out of printed tables unless it is ticked.
      print: createPrintState({ excluded: ["Keyboard"] }),
    };
    render(content, sidebarExtra, navigate);
  }

  function unmount() {
    state = null;
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

    const again = () => render(content, sidebarExtra, navigate);
    renderLetterFilters(sidebarExtra, { set, state, pageKey, onChange: again });
    renderColumnPicker(sidebarExtra, state.columns, { labels: set.columnLabels, onChange: again });

    const filterNames = set.filters.map((f) => f.label).join(" and ");
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <h1 class="page-title">${set.title} Review</h1>
      <div class="info-box">
        <b>Instructions</b><br>
        Use the ${filterNames} filter${set.filters.length > 1 ? "s" : ""} in the sidebar to narrow the list down to what you want to study, and the Columns list to choose what the table shows.<br>
        Print the table (or a blank copy to practice on), download it, or print flashcards — all from the buttons just below.
      </div>
      <hr class="hr" />
    `;
    content.appendChild(wrap);

    const filtered = applyLetterFilters(set, allRows, state.filters);
    const cols = visibleColumns(state.columns);

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = selectFiltersMessage(state.filters, Object.fromEntries(set.filters.map((f) => [f.key, f.label])), `No ${set.plural} match the selected filters.`);
      content.appendChild(div);
    } else {
      renderReviewTools(content, {
        title: set.title,
        print: state.print,
        getRows: () => filtered,
        getColumns: () => cols,
        labels: set.columnLabels,
        hebrewColumns: set.hebrewColumns,
        weights: set.printWeights,
        downloads: [
          { text: "Download CSV", onClick: () => downloadCSV(filtered, cols, `${set.csvName}.csv`) },
          { text: "Download Excel", onClick: () => downloadXLSX(filtered, cols, `${set.csvName}.xlsx`, set.title) },
          {
            text: "Print Flashcards",
            title: "Prints the currently filtered table as double-sided flashcards (15 per sheet)",
            onClick: () => printFlashcards(filtered.slice(0, 300).map(set.printRow), { title: `${set.title} Flashcards`, ...set.print }),
          },
        ],
      });

      const caption = document.createElement("div");
      caption.className = "caption";
      caption.textContent = `${filtered.length} of ${allRows.length} ${set.plural}.`;
      content.appendChild(caption);

      const tableContainer = document.createElement("div");
      content.appendChild(tableContainer);
      renderTable(tableContainer, filtered, {
        columns: cols,
        cellRenderers: {
          Form: (v) => `<span class="letter-form-cell" lang="he">${v || ""}</span>`,
          Category: (v) => (v ? v : `<span class="caption">—</span>`),
          Transliteration: (v) => (v ? `<span class="letter-translit">${v}</span>` : `<span class="caption">—</span>`),
        },
      });
      // The table header shows raw column keys by default — relabel them.
      tableContainer.querySelectorAll("thead th").forEach((th, i) => {
        const label = set.columnLabels[cols[i]];
        if (label) th.textContent = label;
      });
      addTrayColumn(tableContainer, filtered, (row) => letterSpec(set, row));
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
