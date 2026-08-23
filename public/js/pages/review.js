import { getAvailableDatasets, loadVerbData } from "../data.js";
import { applyFilters, GENERATOR_COLUMNS } from "../filters.js";
import { renderDatasetSelector, renderFilterSidebar, renderCheckboxList } from "../widgets.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX, wrapHebrewSpans } from "../helpers.js";
import { printFlashcards } from "../print.js";

let state = null;

function freshState() {
  const available = getAvailableDatasets();
  return {
    datasets: { selected: available.length ? [available[0]] : [] },
    filters: Object.fromEntries(GENERATOR_COLUMNS.map((c) => [c, []])),
    visibleColumns: null, // null = "all"; set once we know the columns
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
    onChange: () => render(content, sidebarExtra, navigate),
  });

  // ---- Main content ----
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Verb Review</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the filters in the sidebar to narrow the table down to what you want to study.<br>
      Download the table as CSV/Excel, or print it as flashcards, to build study lists.
    </div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  const selected = state.datasets.selected;
  if (!selected || selected.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "Select at least one dataset.";
    content.appendChild(div);
    return;
  }

  let df = loadVerbData(selected);

  if (df.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No data found for selected datasets.";
    content.appendChild(div);
    return;
  }

  // Filters sidebar (computed against the unfiltered dataset selection)
  const filterHolder = document.createElement("div");
  filterHolder.className = "sidebar-section";
  sidebarExtra.appendChild(document.createElement("hr")).className = "sidebar-divider";
  sidebarExtra.appendChild(filterHolder);

  renderFilterSidebar(filterHolder, {
    rows: df,
    filtersState: state.filters,
    onChange: () => render(content, sidebarExtra, navigate),
  });

  df = applyFilters(df, state.filters);

  if (df.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No verbs match the selected filters.";
    content.appendChild(div);
    return;
  }

  // Visible columns selector
  const allColumns = Object.keys(df[0]);
  if (!state.visibleColumns || state.visibleColumns.some((c) => !allColumns.includes(c))) {
    state.visibleColumns = [...allColumns];
  }

  const colSidebarDivider = document.createElement("hr");
  colSidebarDivider.className = "sidebar-divider";
  sidebarExtra.appendChild(colSidebarDivider);

  const colWrap = document.createElement("div");
  colWrap.className = "sidebar-section";
  colWrap.innerHTML = `<h3 class="sidebar-title">Visible Columns</h3>`;
  const colList = document.createElement("div");
  colWrap.appendChild(colList);
  sidebarExtra.appendChild(colWrap);

  renderCheckboxList(colList, {
    options: allColumns,
    selected: state.visibleColumns,
    onChange: (next) => {
      state.visibleColumns = next.length ? next : [...allColumns];
      renderMainTable();
    },
  });

  // Table + downloads container (re-rendered independently so column
  // toggles don't rebuild the whole sidebar)
  const tableSection = document.createElement("div");
  content.appendChild(tableSection);

  function renderMainTable() {
    tableSection.innerHTML = "";
    const cols = state.visibleColumns.filter((c) => allColumns.includes(c));

    renderTable(tableSection, df, {
      columns: cols,
      cellRenderers: { Dataset: (v) => wrapHebrewSpans(v) },
    });

    const dlWrap = document.createElement("div");
    dlWrap.innerHTML = `<hr class="hr"/><h3>Download Data</h3>`;
    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    const csvBtn = document.createElement("button");
    csvBtn.className = "btn btn-block";
    csvBtn.textContent = "Download CSV";
    csvBtn.addEventListener("click", () => downloadCSV(df, cols, "verbs_filtered.csv"));

    const xlsxBtn = document.createElement("button");
    xlsxBtn.className = "btn btn-block";
    xlsxBtn.textContent = "Download Excel";
    xlsxBtn.addEventListener("click", () => downloadXLSX(df, cols, "verbs_filtered.xlsx", "Verbs"));

    const printBtn = document.createElement("button");
    printBtn.className = "btn btn-block";
    printBtn.textContent = "Print Flashcards";
    printBtn.title = "Prints up to 300 cards from the currently filtered table";
    printBtn.addEventListener("click", () =>
      printFlashcards(df.slice(0, 300), { title: "Verb Flashcards" })
    );

    btnRow.appendChild(csvBtn);
    btnRow.appendChild(xlsxBtn);
    btnRow.appendChild(printBtn);
    dlWrap.appendChild(btnRow);
    tableSection.appendChild(dlWrap);
  }

  renderMainTable();

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
