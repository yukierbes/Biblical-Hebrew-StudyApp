import { getAccentRows, getTypeOrder, getGroupOrder } from "../accent-data.js";
import { selectFiltersMessage } from "../filter-state.js";
import { applyAccentFilters } from "../accent-filters.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX, wrapHebrewSpans } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { createColumnState, visibleColumns, renderColumnPicker } from "../review-columns.js";
import { createPrintState, renderReviewTools } from "../review-tools.js";

import { renderMyListFilter, setListMode } from "../personal.js";
import { addTrayColumn } from "../item-tray.js";
import { accentSpec } from "../item-specs.js";
const DISPLAY_COLUMNS = ["Type", "Group", "HebrewName", "EnglishName", "Symbol", "Placement", "Keyboard"];
const COLUMN_LABELS = {
  Type: "Type",
  Group: "Group",
  HebrewName: "Hebrew Name",
  EnglishName: "English Name",
  Symbol: "Symbol",
  Placement: "Placement",
  Keyboard: "Keyboard Key",
};

let state = null;

function freshState() {
  return {
    filters: { Type: null, Group: null },
    columns: createColumnState("accent-review", DISPLAY_COLUMNS),
    // The Keyboard Key column is left out of printed tables unless it is ticked.
    print: createPrintState({ excluded: ["Keyboard"] }),
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();
  render(content, sidebarExtra, navigate);
}

export function unmount() {
  state = null;
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
  // Each individual checkbox list (Lesson/POS/Category/Root/etc., a
  // separately-scrollable box — see .checkbox-list in css/style.css) is
  // also torn down and rebuilt as a brand-new element by renderCheckboxList
  // every time any box anywhere changes, so it needs its own scroll
  // restored too, in addition to the outer panel above. Matched up by
  // position, since every page here renders its lists in the same fixed
  // order every time.
  const __checklistScrollTops = [...sidebarExtra.querySelectorAll(".checkbox-list")].map(
    (el) => el.scrollTop
  );
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    __scrollContainer.scrollTop = __sidebarScrollTop;
    const newLists = sidebarExtra.querySelectorAll(".checkbox-list");
    newLists.forEach((el, i) => {
      if (__checklistScrollTops[i] != null) el.scrollTop = __checklistScrollTops[i];
    });
  });
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
    state.filters = { Type: null, Group: null };
    setListMode("accents", "all");
    render(content, sidebarExtra, navigate);
  });
  filterWrap.appendChild(resetBtn);
  renderMyListFilter(filterWrap, { area: "accents", onChange: () => { render(content, sidebarExtra, navigate); } });

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "accent-review",
    getSnapshot: () => ({ filters: state.filters }),
    applySnapshot: (snap) => {
      state.filters = { Type: null, Group: null, ...snap.filters };
      render(content, sidebarExtra, navigate);
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
      render(content, sidebarExtra, navigate);
    },
  });
  filterWrap.appendChild(typeDiv);

  // Conjunctive accents don't carry a Group (blank by design) — there's
  // no synthetic "blank" entry here, same as Vocabulary's Category
  // list; a conjunctive row still shows up regardless of which Groups
  // are checked.
  const groupDiv = document.createElement("div");
  groupDiv.style.marginBottom = "14px";
  renderCheckboxList(groupDiv, {
    label: "Group",
    options: getGroupOrder(),
    selected: state.filters.Group,
    onChange: (next) => {
      state.filters.Group = next;
      render(content, sidebarExtra, navigate);
    },
  });
  filterWrap.appendChild(groupDiv);

  sidebarExtra.appendChild(filterWrap);

  renderColumnPicker(sidebarExtra, state.columns, {
    labels: COLUMN_LABELS,
    onChange: () => render(content, sidebarExtra, navigate),
  });

  // ---- Main content ----
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Accents Review</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the Type and Group filters in the sidebar to narrow the list down to what you want to study, and the Columns list to choose what the table shows.<br>
      Print the table (or a blank copy to practice on), download it, or print flashcards — all from the buttons just below.
    </div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  const filtered = applyAccentFilters(allRows, state.filters);
  const cols = visibleColumns(state.columns);

  if (filtered.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = selectFiltersMessage(state.filters, { Type: "Type", Group: "Group" }, "No accents match the selected filters.");
    content.appendChild(div);
    return;
  }

  renderReviewTools(content, {
    title: "Accents",
    print: state.print,
    getRows: () => filtered,
    getColumns: () => cols,
    labels: COLUMN_LABELS,
    hebrewColumns: ["HebrewName", "Symbol", "Placement"],
    weights: { Type: 1, Group: 1, HebrewName: 1.3, EnglishName: 1.5, Symbol: 0.8, Placement: 1.2, Keyboard: 1.2 },
    downloads: [
      { text: "Download CSV", onClick: () => downloadCSV(filtered, cols, "accents_filtered.csv") },
      { text: "Download Excel", onClick: () => downloadXLSX(filtered, cols, "accents_filtered.xlsx", "Accents") },
      {
        text: "Print Flashcards",
        title: "Prints up to 300 cards from the currently filtered table",
        onClick: () =>
          printFlashcards(filtered.slice(0, 300), {
            title: "Accents Flashcards",
            frontField: "Placement",
            backField: "HebrewName",
            backFieldIsHebrew: true,
            secondaryField: "EnglishName",
            metaFields: ["Type", "Group"],
          }),
      },
    ],
  });

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = `${filtered.length} of ${allRows.length} accents.`;
  content.appendChild(caption);

  const tableContainer = document.createElement("div");
  content.appendChild(tableContainer);
  renderTable(tableContainer, filtered, {
    columns: cols,
    cellRenderers: {
      HebrewName: (v) => wrapHebrewSpans(v),
      Symbol: (v) => `<span class="accent-symbol-cell" lang="he">${v || ""}</span>`,
      Placement: (v) => wrapHebrewSpans(v),
      Group: (v) => (v ? v : `<span class="caption">—</span>`),
    },
  });
  // Table header uses raw column keys by default — relabel them.
  tableContainer.querySelectorAll("thead th").forEach((th, i) => {
    const key = cols[i];
    if (COLUMN_LABELS[key]) th.textContent = COLUMN_LABELS[key];
  });
  addTrayColumn(tableContainer, filtered, accentSpec);
}
