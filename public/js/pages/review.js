import { getAvailableDatasets, loadVerbData } from "../data.js";
import { applyFilters, GENERATOR_COLUMNS } from "../filters.js";
import { renderDatasetSelector, renderFilterSidebar, renderCheckboxList } from "../widgets.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX, downloadXLSXSheets, wrapHebrewSpans } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { buildViewModel, viewHtml, exportSheets } from "../verb-tables.js";
import { printVerbTables } from "../print-tables.js";

let state = null;

// The three ways to look at the verbs. The choice is remembered between visits.
const VIEWS = [
  ["list", "List"],
  ["binyan", "By Binyan"],
  ["root", "By Verb Root"],
];
const VIEW_STORAGE_KEY = "verbReviewView";

function loadSavedView() {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEWS.some(([key]) => key === saved) ? saved : "list";
  } catch (e) {
    return "list";
  }
}

function saveView(view) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch (e) {
    /* storage unavailable — the choice just isn't remembered */
  }
}

function freshState() {
  const available = getAvailableDatasets();
  return {
    datasets: { selected: available.length ? [available[0]] : [] },
    filters: Object.fromEntries(GENERATOR_COLUMNS.map((c) => [c, []])),
    visibleColumns: null, // null = "all"; set once we know the columns
    view: loadSavedView(), // "list" | "binyan" | "root"
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
      Use the filters in the sidebar to narrow down what you want to study.<br>
      Switch views below: <b>List</b> (every form as a row), <b>By Binyan</b> (a table for each binyan and mode),
      or <b>By Verb Root</b> (one table per verb, with a column for each binyan).<br>
      Download the data as CSV/Excel, print it as flashcards, or print the tables, to build study lists.
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

  // Navigation (shared by every view)
  function appendNavigation() {
    const navWrap = document.createElement("div");
    navWrap.innerHTML = `<hr class="hr"/>`;
    const homeBtn = document.createElement("button");
    homeBtn.className = "btn btn-secondary";
    homeBtn.textContent = "Return to Home Page";
    homeBtn.addEventListener("click", () => navigate("home"));
    navWrap.appendChild(homeBtn);
    content.appendChild(navWrap);
  }

  // ---- View switcher: List | By Binyan | By Verb Root ----
  const toolbar = document.createElement("div");
  toolbar.className = "verb-tables-toolbar";
  const switcher = document.createElement("div");
  switcher.className = "view-switch";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "How to view the verbs");
  for (const [key, label] of VIEWS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.view = key;
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(state.view === key));
    btn.addEventListener("click", () => {
      if (state.view === key) return;
      state.view = key;
      saveView(key);
      render(content, sidebarExtra, navigate);
    });
    switcher.appendChild(btn);
  }
  toolbar.appendChild(switcher);
  content.appendChild(toolbar);

  // ---- The two table views ----
  // (Visible Columns only applies to the List view, so it isn't shown here.)
  if (state.view !== "list") {
    const model = buildViewModel(state.view, df);

    const actions = document.createElement("div");
    actions.className = "verb-tables-actions";

    const xlsxBtn = document.createElement("button");
    xlsxBtn.className = "btn";
    xlsxBtn.textContent = "Download Excel";
    xlsxBtn.title = "One sheet per verb, laid out like the tables below";
    xlsxBtn.addEventListener("click", () =>
      downloadXLSXSheets(exportSheets(state.view, model), state.view === "binyan" ? "verbs_by_binyan.xlsx" : "verbs_by_root.xlsx")
    );

    const printBtn = document.createElement("button");
    printBtn.className = "btn btn-secondary";
    printBtn.textContent = "Print Tables";
    printBtn.addEventListener("click", () => printVerbTables(state.view, model));

    actions.appendChild(xlsxBtn);
    actions.appendChild(printBtn);
    toolbar.appendChild(actions);

    const holder = document.createElement("div");
    holder.className = "verb-tables";
    holder.innerHTML = viewHtml(state.view, model);
    content.appendChild(holder);

    appendNavigation();
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

  appendNavigation();
}
