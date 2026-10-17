import { getAvailableDatasets, loadVerbData } from "../data.js";
import { applyFilters, GENERATOR_COLUMNS } from "../filters.js";
import { renderDatasetSelector, renderFilterSidebar } from "../widgets.js";
import { createColumnState, visibleColumns, renderColumnPicker } from "../review-columns.js";
import { createPrintState, renderReviewTools } from "../review-tools.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX, downloadXLSXSheets, wrapHebrewSpans } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { buildViewModel, viewHtml, exportSheets, STRONG_VERB, verbNameHtml } from "../verb-tables.js";
import { printVerbTables } from "../print-tables.js";

import { addTrayColumn, createItemTray } from "../item-tray.js";
import { verbFormSpec } from "../item-specs.js";
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
    columns: null, // the column picker's state; created once we know the columns
    print: createPrintState(),
    view: loadSavedView(), // "list" | "binyan" | "root"
    // By Verb Root only: put Strong Verb (קטל) beside every other verb. Off each visit.
    compareStrong: false,
    // ...and on blank worksheets, leave those Strong Verb columns empty too (otherwise
    // they are filled in, as a model to compare against). The answer key shows everything.
    strongBlank: false,
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
      Print the table (or a blank copy to practice on), download it as CSV/Excel, or print flashcards — all from the buttons just below.
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

  // ---- By Verb Root: compare with the Strong Verb ----
  if (state.view === "root") {
    const shownVerbs = [...new Set(df.map((r) => r.Dataset))];
    content.appendChild(
      renderCompareControls({
        hasOtherVerbs: shownVerbs.some((v) => v !== STRONG_VERB),
        onChange: () => render(content, sidebarExtra, navigate),
      })
    );
  }

  // ---- The two table views ----
  // (The Columns list only applies to the List view, so it isn't shown here.)
  if (state.view !== "list") {
    // The Strong Verb's rows for the comparison: always the Strong Verb (קטל), even if the
    // verb selection hides it, but cut down by the same Binyan / Mode / Person / Gender /
    // Number filters, so its columns line up with the verb's own.
    const strongRows = state.view === "root" && state.compareStrong ? applyFilters(loadVerbData([STRONG_VERB]), state.filters, { personal: false }) : null;
    const model = buildViewModel(state.view, df, { strongRows });
    const comparing = model.some((v) => v.root && v.root.compared);

    renderReviewTools(content, {
      title: "Verbs",
      print: state.print,
      customPrint: {
        description:
          "Prints the tables below (the verbs and filters you have selected). The blank table leaves the answers empty for practice, with a diagonal line through any cell the verb doesn't use." +
          (comparing
            ? ` With the Strong Verb comparison on, a wide table prints as two halves (each repeating Mode and PGN), the Strong Verb columns are shaded, and on a blank worksheet they ${state.strongBlank ? "are left empty too" : "stay filled in as a model"}. The answer key shows everything.`
            : ""),
        blank: () => printVerbTables(state.view, model, { blank: true, strongBlank: state.strongBlank }),
        key: () => printVerbTables(state.view, model),
      },
      downloads: [
        {
          text: "Download Excel",
          title: "One sheet per verb, laid out like the tables below (with the Strong Verb columns beside the verb's own when comparing)",
          onClick: () =>
            downloadXLSXSheets(
              exportSheets(state.view, model),
              state.view === "binyan" ? "verbs_by_binyan.xlsx" : comparing ? "verbs_by_root_with_strong_verb.xlsx" : "verbs_by_root.xlsx"
            ),
        },
      ],
    });

    const holder = document.createElement("div");
    holder.className = "verb-tables";
    holder.innerHTML = viewHtml(state.view, model);
    attachVerbTableTrays(holder);
    content.appendChild(holder);

    appendNavigation();
    return;
  }

  // Columns: show / hide / reorder (remembered). The table, downloads and
  // printed table all follow it.
  const allColumns = Object.keys(df[0]);
  if (!state.columns || state.columns.all.join("|") !== allColumns.join("|")) {
    state.columns = createColumnState("verb-review", allColumns);
  }
  renderColumnPicker(sidebarExtra, state.columns, {
    onChange: () => render(content, sidebarExtra, navigate),
  });
  const cols = visibleColumns(state.columns);

  // Print Table and Download & Print, above the (long) table.
  renderReviewTools(content, {
    title: "Verbs",
    print: state.print,
    getRows: () => df,
    getColumns: () => cols,
    hebrewColumns: ["Conjugation"],
    weights: { Dataset: 1.6, Binyan: 0.9, Mode: 1.1, Person: 0.7, Gender: 0.7, Number: 0.7, Conjugation: 1.2, "Gloss Translation": 2 },
    downloads: [
      { text: "Download CSV", onClick: () => downloadCSV(df, cols, "verbs_filtered.csv") },
      { text: "Download Excel", onClick: () => downloadXLSX(df, cols, "verbs_filtered.xlsx", "Verbs") },
      {
        text: "Print Flashcards",
        title: "Prints up to 300 cards from the currently filtered table",
        onClick: () => printFlashcards(df.slice(0, 300), { title: "Verb Flashcards" }),
      },
    ],
  });

  const tableSection = document.createElement("div");
  content.appendChild(tableSection);
  renderTable(tableSection, df, {
    columns: cols,
    cellRenderers: { Dataset: (v) => wrapHebrewSpans(v) },
  });
  // ☆ ✎ belong to the verb root; ⚑ names the exact form.
  addTrayColumn(tableSection, df, verbFormSpec, { noteColumn: false });

  appendNavigation();
}


/**
 * Star / note / report buttons for the By Binyan and By Verb Root views: one set beside each
 * verb's name (the star and note belong to the verb root), and, in the By Binyan view, a
 * report-only button beside each binyan so a mistake can be pinned to one table.
 */
function attachVerbTableTrays(holder) {
  holder.querySelectorAll("h2.verb-tables-title[data-verb]").forEach((h) => {
    const name = h.dataset.verb;
    const tray = createItemTray({ area: "verbs", key: name, label: name, reportLabel: name + " (table)" });
    tray.classList.add("verb-tables-tray");
    h.insertAdjacentElement("afterend", tray);
  });
  holder.querySelectorAll("h3.verb-tables-binyan-title[data-verb]").forEach((h) => {
    const { verb, binyan } = h.dataset;
    const tray = createItemTray(
      { area: "verbs", key: verb, label: verb, reportKey: `${verb}||${binyan}`, reportLabel: `${verb} · ${binyan} table` },
      { personal: false }
    );
    tray.classList.add("verb-tables-tray");
    h.insertAdjacentElement("afterend", tray);
  });
}

/**
 * The "Compare with Strong Verb (קטל)" switch above the By Verb Root tables, and, once
 * it is on, the choice of whether blank worksheets leave the Strong Verb columns empty.
 */
function renderCompareControls({ hasOtherVerbs, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "compare-controls";

  const row = document.createElement("label");
  row.className = "compare-toggle";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.id = "compare-strong";
  box.checked = state.compareStrong;
  box.addEventListener("change", () => {
    state.compareStrong = box.checked;
    onChange();
  });
  row.appendChild(box);
  const text = document.createElement("span");
  text.innerHTML = `Compare with ${verbNameHtml(STRONG_VERB)}`;
  row.appendChild(text);
  wrap.appendChild(row);

  const help = document.createElement("div");
  help.className = "caption compare-help";
  if (!hasOtherVerbs) {
    help.textContent = "Only the Strong Verb (קטל) is showing, so there is nothing to compare it with. Select other verbs in the sidebar.";
  } else if (!state.compareStrong) {
    help.textContent = "Puts the Strong Verb's column beside each verb's own, binyan by binyan (Qal קטל | Qal שחט | Niphal קטל | …). Works in printing and Excel too.";
  } else {
    help.textContent = "Shaded columns are the Strong Verb (קטל). It is always used, even if it isn't selected in the sidebar, and follows your Binyan / Mode / Person filters.";
  }
  wrap.appendChild(help);

  if (state.compareStrong && hasOtherVerbs) {
    const sub = document.createElement("label");
    sub.className = "compare-toggle compare-sub";
    const blankBox = document.createElement("input");
    blankBox.type = "checkbox";
    blankBox.id = "strong-blank";
    blankBox.checked = state.strongBlank;
    blankBox.addEventListener("change", () => {
      state.strongBlank = blankBox.checked;
      onChange();
    });
    sub.appendChild(blankBox);
    const subText = document.createElement("span");
    subText.textContent = "On blank worksheets, leave the Strong Verb columns empty too (otherwise they are filled in as a model)";
    sub.appendChild(subText);
    wrap.appendChild(sub);
  }
  return wrap;
}
