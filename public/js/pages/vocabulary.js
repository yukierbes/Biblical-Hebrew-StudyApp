import { loadVocabData, getVocabRows, getLessonOrder, getPosOrder } from "../vocab-data.js";
import { renderCheckboxList, renderPresetControls } from "../widgets.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX, wrapHebrewSpans } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { getCategoriesForRow, getCategoryOptions, vocabRowKey, applyVocabFilters } from "../vocab-overrides.js";
import { openCategoryEditor, openBulkCategoryEditor, openCategoryAdmin } from "../category-editor.js";
import { getRootForWord, getRootOptions, applyRootFilter } from "../vocab-roots.js";
import { openRootEditor, openBulkRootEditor, openRootAdmin } from "../root-editor.js";
import { consumeDeepLink } from "../deep-link.js";

const DISPLAY_COLUMNS = ["Lesson", "Hebrew", "English", "POS", "Category", "Root", "Frequency"];

let state = null;

function freshState() {
  return {
    filters: { Lesson: [], POS: [], Category: [], Root: [] },
    minFrequency: "",
    visibleColumns: [...DISPLAY_COLUMNS],
    selectedKeys: new Set(),
  };
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();

  const link = consumeDeepLink();
  if (link && link.type === "vocab-review-edit-category" && link.row) {
    if (link.row.Lesson) state.filters.Lesson = [link.row.Lesson];
    render(content, sidebarExtra, navigate);
    openCategoryEditor(link.row, () => render(content, sidebarExtra, navigate));
    return;
  }
  if (link && link.type === "vocab-review-filter-category" && link.category) {
    state.filters.Category = [link.category];
  }

  render(content, sidebarExtra, navigate);
}

export function unmount() {
  state = null;
}

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(content, sidebarExtra, navigate) {
  sidebarExtra.innerHTML = "";
  content.innerHTML = "";

  const allRows = getVocabRows();

  if (!allRows.length) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.textContent = "No vocabulary data found.";
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
    state.filters = { Lesson: [], POS: [], Category: [], Root: [] };
    state.minFrequency = "";
    render(content, sidebarExtra, navigate);
  });
  filterWrap.appendChild(resetBtn);

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey: "vocabulary",
    getSnapshot: () => ({ filters: state.filters, minFrequency: state.minFrequency }),
    applySnapshot: (snap) => {
      state.filters = { Lesson: [], POS: [], Category: [], Root: [], ...snap.filters };
      state.minFrequency = snap.minFrequency || "";
      render(content, sidebarExtra, navigate);
    },
  });
  filterWrap.appendChild(presetDiv);

  // Lesson — keeps the true pedagogical sequence (1A, 1B, ... 5Z, 5AA,
  // 5BB), not a plain alphabetical sort.
  const lessonDiv = document.createElement("div");
  lessonDiv.style.marginBottom = "14px";
  renderCheckboxList(lessonDiv, {
    label: "Lesson",
    options: getLessonOrder(),
    selected: state.filters.Lesson,
    onChange: (next) => {
      state.filters.Lesson = next;
      render(content, sidebarExtra, navigate);
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
      render(content, sidebarExtra, navigate);
    },
  });
  filterWrap.appendChild(posDiv);

  // Blank categories (~549 words with none assigned) are intentionally
  // left out of this list rather than given a synthetic "Uncategorized"
  // entry — they still show up normally whenever no Category filter is
  // active, same as every other filter on this page. This list also
  // includes any custom categories added via the editor below, and any
  // category currently assigned via a saved override.
  const categoryDiv = document.createElement("div");
  categoryDiv.style.marginBottom = "14px";
  renderCheckboxList(categoryDiv, {
    label: "Category",
    options: getCategoryOptions(),
    selected: state.filters.Category,
    onChange: (next) => {
      state.filters.Category = next;
      render(content, sidebarExtra, navigate);
    },
  });
  filterWrap.appendChild(categoryDiv);

  const manageCatBtn = document.createElement("button");
  manageCatBtn.className = "btn btn-outline btn-sm btn-block";
  manageCatBtn.style.marginBottom = "14px";
  manageCatBtn.textContent = "Manage Categories";
  manageCatBtn.addEventListener("click", () => {
    openCategoryAdmin(allRows, {
      onSave: () => render(content, sidebarExtra, navigate),
      onFilterByCategory: (cat) => {
        state.filters.Category = [cat];
        render(content, sidebarExtra, navigate);
      },
    });
  });
  filterWrap.appendChild(manageCatBtn);

  // Root families are entirely user-defined (the dataset has no root
  // column) — a word with no root assigned always shows, same blank-
  // handling as Category above.
  const rootDiv = document.createElement("div");
  rootDiv.style.marginBottom = "14px";
  renderCheckboxList(rootDiv, {
    label: "Root",
    options: getRootOptions(),
    selected: state.filters.Root,
    onChange: (next) => {
      state.filters.Root = next;
      render(content, sidebarExtra, navigate);
    },
  });
  filterWrap.appendChild(rootDiv);

  const manageRootBtn = document.createElement("button");
  manageRootBtn.className = "btn btn-outline btn-sm btn-block";
  manageRootBtn.style.marginBottom = "14px";
  manageRootBtn.textContent = "Manage Roots";
  manageRootBtn.addEventListener("click", () => {
    openRootAdmin(allRows, {
      onSave: () => render(content, sidebarExtra, navigate),
      onFilterByRoot: (root) => {
        state.filters.Root = [root];
        render(content, sidebarExtra, navigate);
      },
    });
  });
  filterWrap.appendChild(manageRootBtn);

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
    state.minFrequency = freqInput.value;
    renderMainTable();
  });
  freqDiv.appendChild(freqLabel);
  freqDiv.appendChild(freqInput);
  filterWrap.appendChild(freqDiv);

  sidebarExtra.appendChild(filterWrap);

  // ---- Main content ----
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Vocabulary Review</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Use the filters in the sidebar to narrow the list down to what you want to study.<br>
      Click <i>Edit</i> next to a word's Category to reassign it — a word can belong to more than one category, and you can add brand-new categories on the fly.<br>
      Click <i>Edit</i> next to a word's Root to group it with its root family (one root per word) — use <i>Manage Roots</i> in the sidebar to rename, delete, or filter by a root.<br>
      Check multiple rows to bulk-assign or remove a category or root at once.<br>
      Download the table as CSV/Excel to build study lists.
    </div>
    <hr class="hr" />
  `;
  content.appendChild(wrap);

  let filtered = applyRootFilter(applyVocabFilters(allRows, state.filters, state.minFrequency), state.filters.Root);

  const tableSection = document.createElement("div");
  content.appendChild(tableSection);

  // Visible columns selector (uses the live-filtered row count for the
  // "no matches" case, but the column list itself never changes).
  const colDivider = document.createElement("hr");
  colDivider.className = "sidebar-divider";
  sidebarExtra.appendChild(colDivider);

  const colWrap = document.createElement("div");
  colWrap.className = "sidebar-section";
  colWrap.innerHTML = `<h3 class="sidebar-title">Visible Columns</h3>`;
  const colList = document.createElement("div");
  colWrap.appendChild(colList);
  sidebarExtra.appendChild(colWrap);

  renderCheckboxList(colList, {
    options: DISPLAY_COLUMNS,
    selected: state.visibleColumns,
    onChange: (next) => {
      state.visibleColumns = next.length ? next : [...DISPLAY_COLUMNS];
      renderMainTable();
    },
  });

  function renderMainTable() {
    filtered = applyRootFilter(applyVocabFilters(allRows, state.filters, state.minFrequency), state.filters.Root);
    tableSection.innerHTML = "";

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = "No vocabulary matches the selected filters.";
      tableSection.appendChild(div);
      return;
    }

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = `${filtered.length} of ${allRows.length} words.`;
    tableSection.appendChild(caption);

    // ---- Bulk selection toolbar ----
    const bulkBar = document.createElement("div");
    bulkBar.className = "button-row";
    bulkBar.style.alignItems = "center";
    bulkBar.style.marginBottom = "10px";

    const selectAllBtn = document.createElement("button");
    selectAllBtn.className = "btn btn-outline btn-sm narrow";
    selectAllBtn.textContent = "Select All Filtered";
    selectAllBtn.addEventListener("click", () => {
      for (const r of filtered) state.selectedKeys.add(vocabRowKey(r));
      renderMainTable();
    });

    const clearSelectBtn = document.createElement("button");
    clearSelectBtn.className = "btn btn-outline btn-sm narrow";
    clearSelectBtn.textContent = "Clear Selection";
    clearSelectBtn.addEventListener("click", () => {
      state.selectedKeys.clear();
      renderMainTable();
    });

    const bulkEditBtn = document.createElement("button");
    bulkEditBtn.className = "btn btn-sm narrow";
    bulkEditBtn.disabled = state.selectedKeys.size === 0;

    const bulkRootBtn = document.createElement("button");
    bulkRootBtn.className = "btn btn-sm narrow";
    bulkRootBtn.disabled = state.selectedKeys.size === 0;

    const selectedCountLabel = document.createElement("span");
    selectedCountLabel.className = "caption";
    selectedCountLabel.style.marginLeft = "6px";

    function updateBulkBarLabel() {
      const n = state.selectedKeys.size;
      bulkEditBtn.textContent = `Bulk Edit Categories (${n})`;
      bulkEditBtn.disabled = n === 0;
      bulkRootBtn.textContent = `Set Root (${n})`;
      bulkRootBtn.disabled = n === 0;
      selectedCountLabel.textContent = n > 0 ? `${n} selected` : "";
    }
    updateBulkBarLabel();

    bulkEditBtn.addEventListener("click", () => {
      const selectedRows = allRows.filter((r) => state.selectedKeys.has(vocabRowKey(r)));
      if (selectedRows.length === 0) return;
      openBulkCategoryEditor(selectedRows, renderMainTable);
    });

    bulkRootBtn.addEventListener("click", () => {
      const selectedRows = allRows.filter((r) => state.selectedKeys.has(vocabRowKey(r)));
      if (selectedRows.length === 0) return;
      openBulkRootEditor(selectedRows, renderMainTable);
    });

    bulkBar.appendChild(selectAllBtn);
    bulkBar.appendChild(clearSelectBtn);
    bulkBar.appendChild(bulkEditBtn);
    bulkBar.appendChild(bulkRootBtn);
    bulkBar.appendChild(selectedCountLabel);
    tableSection.appendChild(bulkBar);

    const cols = state.visibleColumns.filter((c) => DISPLAY_COLUMNS.includes(c));
    const tableContainer = document.createElement("div");
    tableSection.appendChild(tableContainer);
    renderTable(tableContainer, filtered, {
      columns: ["Select", ...cols],
      cellRenderers: {
        Select: (v, row) => {
          const key = encodeURIComponent(vocabRowKey(row));
          const checked = state.selectedKeys.has(vocabRowKey(row)) ? "checked" : "";
          return `<input type="checkbox" class="vocab-row-select" data-key="${key}" ${checked} aria-label="Select this word" />`;
        },
        Hebrew: (v) => wrapHebrewSpans(v),
        Category: (v, row) => {
          const catsText = getCategoriesForRow(row).join(", ");
          const display = catsText ? escapeHtml(catsText) : `<span class="caption">—</span>`;
          return `${display} <button type="button" class="btn btn-outline btn-sm vocab-cat-edit-btn" data-key="${encodeURIComponent(vocabRowKey(row))}">Edit</button>`;
        },
        Root: (v, row) => {
          const root = getRootForWord(row);
          const display = root ? wrapHebrewSpans(root) : `<span class="caption">—</span>`;
          return `${display} <button type="button" class="btn btn-outline btn-sm vocab-root-edit-btn" data-key="${encodeURIComponent(vocabRowKey(row))}">Edit</button>`;
        },
      },
    });

    tableContainer.querySelectorAll(".vocab-row-select").forEach((cb) => {
      cb.addEventListener("change", () => {
        const key = decodeURIComponent(cb.dataset.key);
        if (cb.checked) state.selectedKeys.add(key);
        else state.selectedKeys.delete(key);
        updateBulkBarLabel();
      });
    });

    tableContainer.querySelectorAll(".vocab-cat-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = decodeURIComponent(btn.dataset.key);
        const row = filtered.find((r) => vocabRowKey(r) === key);
        if (row) openCategoryEditor(row, renderMainTable);
      });
    });

    tableContainer.querySelectorAll(".vocab-root-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = decodeURIComponent(btn.dataset.key);
        const row = filtered.find((r) => vocabRowKey(r) === key);
        if (row) openRootEditor(row, renderMainTable);
      });
    });

    const dlWrap = document.createElement("div");
    dlWrap.innerHTML = `<hr class="hr"/><h3>Download Data</h3>`;
    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    // Exports reflect each word's current (override-aware) categories
    // and root, not just the dataset's original Category field.
    const exportRows = filtered.map((r) => ({ ...r, Category: getCategoriesForRow(r).join(", "), Root: getRootForWord(r) }));

    const csvBtn = document.createElement("button");
    csvBtn.className = "btn btn-block";
    csvBtn.textContent = "Download CSV";
    csvBtn.addEventListener("click", () => downloadCSV(exportRows, cols, "vocabulary_filtered.csv"));

    const xlsxBtn = document.createElement("button");
    xlsxBtn.className = "btn btn-block";
    xlsxBtn.textContent = "Download Excel";
    xlsxBtn.addEventListener("click", () => downloadXLSX(exportRows, cols, "vocabulary_filtered.xlsx", "Vocabulary"));

    const printBtn = document.createElement("button");
    printBtn.className = "btn btn-block";
    printBtn.textContent = "Print Flashcards";
    printBtn.title = "Prints up to 300 cards from the currently filtered table";
    printBtn.addEventListener("click", () =>
      printFlashcards(filtered.slice(0, 300), {
        title: "Vocabulary Flashcards",
        frontField: "Hebrew",
        backField: "English",
        metaFields: ["Lesson", "POS", "Frequency"],
      })
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
