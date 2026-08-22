import {
  getCategoriesForRow,
  setCategoriesForRow,
  resetCategoriesForRow,
  hasCategoryOverride,
  addCustomCategory,
  getCategoryOptions,
  addCategoriesToRows,
  removeCategoryFromRows,
  getCategoryWordCounts,
  renameCategory,
  deleteCategory,
} from "./vocab-overrides.js";
import { wrapHebrewSpans } from "./helpers.js";

let openBackdrop = null;
let escHandler = null;

function closeModal() {
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  if (openBackdrop) {
    openBackdrop.remove();
    openBackdrop = null;
  }
}

/**
 * Opens a modal letting the person choose which categories `row`
 * belongs to (checkboxes, multiple allowed) and add a brand-new
 * category on the fly. Calls `onSave()` after a successful save so the
 * caller can re-render its table/list with the change reflected.
 */
export function openCategoryEditor(row, onSave) {
  closeModal(); // in case one was already open somehow

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "vocab-category-editor-modal";

  const box = document.createElement("div");
  box.className = "modal-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "vocab-category-editor-title");

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h3");
  title.id = "vocab-category-editor-title";
  title.innerHTML = `Categories: ${wrapHebrewSpans(row.Hebrew || "")}`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", closeModal);
  header.appendChild(title);
  header.appendChild(closeBtn);
  box.appendChild(header);

  const englishCaption = document.createElement("div");
  englishCaption.className = "caption";
  englishCaption.style.marginBottom = "12px";
  englishCaption.textContent = row.English || "";
  box.appendChild(englishCaption);

  const selected = new Set(getCategoriesForRow(row));

  const listWrap = document.createElement("div");
  listWrap.style.maxHeight = "260px";
  listWrap.style.overflowY = "auto";
  listWrap.style.marginBottom = "14px";
  listWrap.style.border = "1px solid var(--hairline)";
  listWrap.style.borderRadius = "var(--radius)";
  listWrap.style.padding = "10px 12px";
  box.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = "";
    const options = getCategoryOptions();
    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "caption";
      empty.textContent = "No categories yet — add one below.";
      listWrap.appendChild(empty);
      return;
    }
    for (const cat of options) {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.style.padding = "4px 0";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(cat);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(cat);
        else selected.delete(cat);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(cat));
      listWrap.appendChild(label);
    }
  }
  renderList();

  const addRow = document.createElement("div");
  addRow.style.display = "flex";
  addRow.style.gap = "8px";
  addRow.style.marginBottom = "16px";

  const addInput = document.createElement("input");
  addInput.type = "text";
  addInput.placeholder = "New category name";
  addInput.style.flex = "1";
  addInput.style.padding = "8px 10px";
  addInput.style.borderRadius = "var(--radius)";
  addInput.style.border = "1px solid var(--hairline)";

  function addCategoryFromInput() {
    const name = addCustomCategory(addInput.value, getCategoryOptions());
    if (name) {
      selected.add(name);
      addInput.value = "";
      renderList();
      addInput.focus();
    }
  }

  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCategoryFromInput();
    }
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn-outline btn-sm";
  addBtn.style.flexShrink = "0";
  addBtn.textContent = "Add Category";
  addBtn.addEventListener("click", addCategoryFromInput);

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  box.appendChild(addRow);

  if (hasCategoryOverride(row)) {
    const resetRow = document.createElement("div");
    resetRow.style.marginBottom = "12px";
    const resetLink = document.createElement("button");
    resetLink.type = "button";
    resetLink.className = "btn btn-secondary btn-sm";
    resetLink.textContent = "Reset to Original Category";
    resetLink.addEventListener("click", () => {
      resetCategoriesForRow(row);
      closeModal();
      onSave();
    });
    resetRow.appendChild(resetLink);
    box.appendChild(resetRow);
  }

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    setCategoriesForRow(row, [...selected]);
    closeModal();
    onSave();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeModal);

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  box.appendChild(btnRow);

  backdrop.appendChild(box);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.body.appendChild(backdrop);
  openBackdrop = backdrop;

  escHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", escHandler);

  addInput.focus();
}

/**
 * Opens a modal for assigning/removing categories across MULTIPLE
 * words at once. Checked categories are ADDED to every word in `rows`
 * (existing categories are kept, never replaced) — a separate section
 * below handles removing one category from all of them. Calls
 * `onSave()` after either action so the caller can re-render.
 */
export function openBulkCategoryEditor(rows, onSave) {
  closeModal();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "vocab-category-editor-modal";

  const box = document.createElement("div");
  box.className = "modal-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h3");
  title.textContent = `Bulk Edit Categories (${rows.length} word${rows.length === 1 ? "" : "s"})`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", closeModal);
  header.appendChild(title);
  header.appendChild(closeBtn);
  box.appendChild(header);

  const note = document.createElement("div");
  note.className = "caption";
  note.style.marginBottom = "12px";
  note.textContent = "Categories checked below will be ADDED to all selected words — existing categories are kept.";
  box.appendChild(note);

  const toAdd = new Set();

  const listWrap = document.createElement("div");
  listWrap.style.maxHeight = "220px";
  listWrap.style.overflowY = "auto";
  listWrap.style.marginBottom = "14px";
  listWrap.style.border = "1px solid var(--hairline)";
  listWrap.style.borderRadius = "var(--radius)";
  listWrap.style.padding = "10px 12px";
  box.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = "";
    const options = getCategoryOptions();
    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "caption";
      empty.textContent = "No categories yet — add one below.";
      listWrap.appendChild(empty);
      return;
    }
    for (const cat of options) {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.style.padding = "4px 0";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = toAdd.has(cat);
      cb.addEventListener("change", () => {
        if (cb.checked) toAdd.add(cat);
        else toAdd.delete(cat);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(cat));
      listWrap.appendChild(label);
    }
  }
  renderList();

  const addRow = document.createElement("div");
  addRow.style.display = "flex";
  addRow.style.gap = "8px";
  addRow.style.marginBottom = "16px";

  const addInput = document.createElement("input");
  addInput.type = "text";
  addInput.placeholder = "New category name";
  addInput.style.flex = "1";
  addInput.style.padding = "8px 10px";
  addInput.style.borderRadius = "var(--radius)";
  addInput.style.border = "1px solid var(--hairline)";

  function addCategoryFromInput() {
    const name = addCustomCategory(addInput.value, getCategoryOptions());
    if (name) {
      toAdd.add(name);
      addInput.value = "";
      renderList();
      addInput.focus();
    }
  }
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCategoryFromInput();
    }
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn-outline btn-sm";
  addBtn.style.flexShrink = "0";
  addBtn.textContent = "Add Category";
  addBtn.addEventListener("click", addCategoryFromInput);

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  box.appendChild(addRow);

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const applyBtn = document.createElement("button");
  applyBtn.className = "btn";
  applyBtn.textContent = `Add to ${rows.length} Word${rows.length === 1 ? "" : "s"}`;
  applyBtn.addEventListener("click", () => {
    addCategoriesToRows(rows, [...toAdd]);
    closeModal();
    onSave();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeModal);

  btnRow.appendChild(applyBtn);
  btnRow.appendChild(cancelBtn);
  box.appendChild(btnRow);

  box.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const removeLabel = document.createElement("div");
  removeLabel.className = "sidebar-label";
  removeLabel.style.marginBottom = "8px";
  removeLabel.textContent = `Remove a category from these ${rows.length} word${rows.length === 1 ? "" : "s"}:`;
  box.appendChild(removeLabel);

  const removeRow = document.createElement("div");
  removeRow.style.display = "flex";
  removeRow.style.gap = "8px";

  const removeSelect = document.createElement("select");
  removeSelect.style.flex = "1";
  removeSelect.style.padding = "8px 10px";
  removeSelect.style.borderRadius = "var(--radius)";
  removeSelect.style.border = "1px solid var(--hairline)";
  for (const cat of getCategoryOptions()) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    removeSelect.appendChild(opt);
  }

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-secondary btn-sm";
  removeBtn.style.flexShrink = "0";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    if (!removeSelect.value) return;
    removeCategoryFromRows(rows, removeSelect.value);
    closeModal();
    onSave();
  });

  removeRow.appendChild(removeSelect);
  removeRow.appendChild(removeBtn);
  box.appendChild(removeRow);

  backdrop.appendChild(box);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.body.appendChild(backdrop);
  openBackdrop = backdrop;

  escHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", escHandler);

  addInput.focus();
}

/**
 * Opens a modal listing every category with its current word count,
 * letting the person rename or delete a category (affecting every word
 * currently assigned to it) or click its name to filter the main table
 * down to it. `onFilterByCategory(name)` handles that last part; the
 * caller is responsible for actually applying the filter and closing.
 */
export function openCategoryAdmin(allRows, { onSave, onFilterByCategory }) {
  closeModal();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "vocab-category-editor-modal";

  const box = document.createElement("div");
  box.className = "modal-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h3");
  title.textContent = "Manage Categories";
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", closeModal);
  header.appendChild(title);
  header.appendChild(closeBtn);
  box.appendChild(header);

  const note = document.createElement("div");
  note.className = "caption";
  note.style.marginBottom = "12px";
  note.textContent =
    "Click a category to filter the table to it. Renaming or deleting affects every word currently in that category.";
  box.appendChild(note);

  const listWrap = document.createElement("div");
  listWrap.style.maxHeight = "340px";
  listWrap.style.overflowY = "auto";
  box.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = "";
    const options = getCategoryOptions();
    const counts = getCategoryWordCounts(allRows);

    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "caption";
      empty.textContent = "No categories yet.";
      listWrap.appendChild(empty);
      return;
    }

    for (const cat of options) {
      const row = document.createElement("div");
      row.className = "vocab-cat-admin-row";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 0";
      row.style.borderBottom = "1px solid var(--hairline)";

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "btn btn-secondary btn-sm vocab-cat-admin-filter-btn";
      nameBtn.style.flex = "1";
      nameBtn.style.textAlign = "left";
      nameBtn.textContent = `${cat} (${counts.get(cat) || 0})`;
      nameBtn.addEventListener("click", () => {
        closeModal();
        onFilterByCategory(cat);
      });

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "btn btn-outline btn-sm vocab-cat-admin-rename-btn";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", () => {
        const next = window.prompt(`Rename "${cat}" to:`, cat);
        if (next && next.trim() && next.trim() !== cat) {
          renameCategory(allRows, cat, next.trim());
          renderList();
          onSave();
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-secondary btn-sm vocab-cat-admin-delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        const count = counts.get(cat) || 0;
        const ok = window.confirm(
          `Delete "${cat}"? It will be removed from ${count} word${count === 1 ? "" : "s"}. This can't be undone.`
        );
        if (ok) {
          deleteCategory(allRows, cat);
          renderList();
          onSave();
        }
      });

      row.appendChild(nameBtn);
      row.appendChild(renameBtn);
      row.appendChild(deleteBtn);
      listWrap.appendChild(row);
    }
  }
  renderList();

  const closeRow = document.createElement("div");
  closeRow.className = "button-row";
  closeRow.style.marginTop = "14px";
  const doneBtn = document.createElement("button");
  doneBtn.className = "btn btn-secondary";
  doneBtn.textContent = "Close";
  doneBtn.addEventListener("click", closeModal);
  closeRow.appendChild(doneBtn);
  box.appendChild(closeRow);

  backdrop.appendChild(box);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.body.appendChild(backdrop);
  openBackdrop = backdrop;

  escHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", escHandler);
}
