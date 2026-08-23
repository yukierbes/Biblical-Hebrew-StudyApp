import { getAccentRows, getTypeOrder, getGroupOrder } from "../accent-data.js";
import { applyAccentFilters } from "../accent-filters.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX, wrapHebrewSpans } from "../helpers.js";
import { printFlashcards } from "../print.js";

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
  return { filters: { Type: [], Group: [] } };
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
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    __scrollContainer.scrollTop = __sidebarScrollTop;
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
    state.filters = { Type: [], Group: [] };
    render(content, sidebarExtra, navigate);
  });
  filterWrap.appendChild(resetBtn);

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "accent-review",
    getSnapshot: () => ({ filters: state.filters }),
    applySnapshot: (snap) => {
      state.filters = { Type: [], Group: [], ...snap.filters };
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

  // ---- Main content ----
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Accents Review</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the Type and Group filters in the sidebar to narrow the list down to what you want to study.<br>
      Download the table as CSV/Excel to build study lists.
    </div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  const tableSection = document.createElement("div");
  content.appendChild(tableSection);

  function renderMainTable() {
    const filtered = applyAccentFilters(allRows, state.filters);
    tableSection.innerHTML = "";

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = "No accents match the selected filters.";
      tableSection.appendChild(div);
      return;
    }

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = `${filtered.length} of ${allRows.length} accents.`;
    tableSection.appendChild(caption);

    const tableContainer = document.createElement("div");
    tableSection.appendChild(tableContainer);
    renderTable(tableContainer, filtered, {
      columns: DISPLAY_COLUMNS,
      cellRenderers: {
        HebrewName: (v) => wrapHebrewSpans(v),
        Symbol: (v) => `<span class="accent-symbol-cell" lang="he">${v || ""}</span>`,
        Placement: (v) => wrapHebrewSpans(v),
        Group: (v) => (v ? v : `<span class="caption">—</span>`),
      },
    });
    // Table header uses raw column keys by default — relabel them.
    tableContainer.querySelectorAll("thead th").forEach((th, i) => {
      const key = DISPLAY_COLUMNS[i];
      if (COLUMN_LABELS[key]) th.textContent = COLUMN_LABELS[key];
    });

    const dlWrap = document.createElement("div");
    dlWrap.innerHTML = `<hr class="hr"/><h3>Download Data</h3>`;
    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    const csvBtn = document.createElement("button");
    csvBtn.className = "btn btn-block";
    csvBtn.textContent = "Download CSV";
    csvBtn.addEventListener("click", () => downloadCSV(filtered, DISPLAY_COLUMNS, "accents_filtered.csv"));

    const xlsxBtn = document.createElement("button");
    xlsxBtn.className = "btn btn-block";
    xlsxBtn.textContent = "Download Excel";
    xlsxBtn.addEventListener("click", () =>
      downloadXLSX(filtered, DISPLAY_COLUMNS, "accents_filtered.xlsx", "Accents")
    );

    const printBtn = document.createElement("button");
    printBtn.className = "btn btn-block";
    printBtn.textContent = "Print Flashcards";
    printBtn.title = "Prints up to 300 cards from the currently filtered table";
    printBtn.addEventListener("click", () =>
      printFlashcards(filtered.slice(0, 300), {
        title: "Accents Flashcards",
        frontField: "Placement",
        backField: "HebrewName",
        backFieldIsHebrew: true,
        secondaryField: "EnglishName",
        metaFields: ["Type", "Group"],
      })
    );

    btnRow.appendChild(csvBtn);
    btnRow.appendChild(xlsxBtn);
    btnRow.appendChild(printBtn);
    dlWrap.appendChild(btnRow);
    tableSection.appendChild(dlWrap);
  }

  renderMainTable();
}
