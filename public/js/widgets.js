import { GENERATOR_COLUMNS } from "./constants.js";
import { orderedOptionsFromRows } from "./filters.js";
import { wrapHebrewSpans } from "./helpers.js";
import { listPresets, savePreset, deletePreset, getPreset } from "./filter-presets.js";

let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}_${uidCounter}`;
}

/**
 * Renders a "Saved Filters" control: a dropdown of named presets for
 * this page (applying one on selection), a "Save Current…" button that
 * prompts for a name and stores whatever `getSnapshot()` returns right
 * now, and a "Delete" button for whichever preset is selected.
 *
 * `pageKey` scopes storage — presets never leak between pages.
 * `getSnapshot()` returns the current filter state to save (any JSON-
 * serializable shape the page uses, e.g. `{ filters, minFrequency }`).
 * `applySnapshot(snapshot)` restores it and should trigger the page's
 * own re-render/restart.
 */
export function renderPresetControls(container, { pageKey, getSnapshot, applySnapshot }) {
  container.innerHTML = "";

  const label = document.createElement("div");
  label.className = "sidebar-label";
  label.textContent = "Saved Filters";
  container.appendChild(label);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "6px";
  row.style.marginBottom = "8px";

  const select = document.createElement("select");
  select.style.flex = "1";
  select.style.padding = "6px 8px";
  select.style.borderRadius = "var(--radius)";
  select.style.border = "1px solid var(--hairline)";
  select.style.background = "var(--paper-raised)";
  select.style.color = "var(--ink)";

  function refreshOptions(selectValue) {
    const presets = listPresets(pageKey);
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = presets.length ? "Choose a preset…" : "No saved presets yet";
    select.appendChild(placeholder);
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      select.appendChild(opt);
    }
    select.value = selectValue && presets.some((p) => p.name === selectValue) ? selectValue : "";
    deleteBtn.disabled = !select.value;
  }

  select.addEventListener("change", () => {
    deleteBtn.disabled = !select.value;
    if (!select.value) return;
    const preset = getPreset(pageKey, select.value);
    if (preset) applySnapshot(preset.snapshot);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-outline btn-sm";
  deleteBtn.style.flexShrink = "0";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    if (!select.value) return;
    const ok = window.confirm(`Delete the saved preset "${select.value}"?`);
    if (!ok) return;
    deletePreset(pageKey, select.value);
    refreshOptions(null);
  });

  row.appendChild(select);
  row.appendChild(deleteBtn);
  container.appendChild(row);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-outline btn-sm btn-block";
  saveBtn.textContent = "Save Current as…";
  saveBtn.addEventListener("click", () => {
    const name = window.prompt("Name this filter preset:", select.value || "");
    if (!name || !name.trim()) return;
    savePreset(pageKey, name, getSnapshot());
    refreshOptions(name.trim());
  });
  container.appendChild(saveBtn);

  refreshOptions(null);
}

/**
 * Render a labeled scrollable checkbox list.
 * options: string[]
 * selected: string[] (current selection, mutated in place is NOT done - caller manages state)
 * onChange(newSelectedArray)
 */
export function renderCheckboxList(container, { label, options, selected, onChange, emptyText }) {
  container.innerHTML = "";

  if (label) {
    const lbl = document.createElement("div");
    lbl.className = "sidebar-label";
    lbl.textContent = label;
    container.appendChild(lbl);
  }

  if (!options || options.length === 0) {
    const div = document.createElement("div");
    div.className = "caption";
    div.textContent = emptyText || "No options available.";
    container.appendChild(div);
    return;
  }

  const selectedSet = new Set(selected || []);
  const allSelected = options.every((o) => selectedSet.has(o));

  const toggleAll = document.createElement("button");
  toggleAll.type = "button";
  toggleAll.className = "select-all-btn";
  toggleAll.textContent = allSelected ? "Clear all" : "Select all";
  toggleAll.addEventListener("click", () => {
    onChange(allSelected ? [] : [...options]);
  });
  container.appendChild(toggleAll);

  const list = document.createElement("div");
  list.className = "checkbox-list";

  for (const opt of options) {
    const id = uid("cb");
    const wrapLabel = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt;
    cb.id = id;
    cb.checked = selectedSet.has(opt);
    cb.addEventListener("change", () => {
      const next = new Set(selectedSet);
      if (cb.checked) next.add(opt);
      else next.delete(opt);
      selectedSet.clear();
      for (const v of next) selectedSet.add(v);
      onChange([...next]);
    });
    const textSpan = document.createElement("span");
    textSpan.innerHTML = " " + wrapHebrewSpans(opt);

    wrapLabel.appendChild(cb);
    wrapLabel.appendChild(textSpan);
    list.appendChild(wrapLabel);
  }

  container.appendChild(list);
}

/**
 * Renders the "Verbal Roots" dataset selector.
 * state: { selected: string[] } — mutated in place; onChange invoked with new selection.
 */
export function renderDatasetSelector(container, { availableDatasets, state, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "sidebar-section";

  const title = document.createElement("h3");
  title.className = "sidebar-title";
  title.textContent = "Verbal Roots";
  wrap.appendChild(title);

  const listContainer = document.createElement("div");
  wrap.appendChild(listContainer);

  renderCheckboxList(listContainer, {
    options: availableDatasets,
    selected: state.selected,
    onChange: (next) => {
      state.selected = next;
      onChange(next);
    },
  });

  container.appendChild(wrap);
}

/**
 * Renders filter checklists for each GENERATOR_COLUMNS entry, plus a
 * "Reset Filters" button. `rows` should be the *unfiltered* dataset rows
 * (used to compute available options per column).
 *
 * filtersState: { [column]: string[] } — mutated in place.
 * onChange(filtersState) called whenever any filter changes (after mutation).
 */
export function renderFilterSidebar(container, { rows, filtersState, onChange, disabled = false }) {
  const wrap = document.createElement("div");
  wrap.className = "sidebar-section";

  const title = document.createElement("h3");
  title.className = "sidebar-title";
  title.textContent = "Filters";
  wrap.appendChild(title);

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn btn-outline btn-block";
  resetBtn.textContent = "Reset Filters";
  resetBtn.disabled = disabled;
  resetBtn.style.marginBottom = "12px";
  resetBtn.addEventListener("click", () => {
    for (const col of GENERATOR_COLUMNS) filtersState[col] = [];
    onChange(filtersState);
  });
  wrap.appendChild(resetBtn);

  for (const col of GENERATOR_COLUMNS) {
    const colDiv = document.createElement("div");
    colDiv.style.marginBottom = "12px";

    const opts = orderedOptionsFromRows(rows, col);
    // Drop any selections that are no longer valid for the current dataset.
    filtersState[col] = (filtersState[col] || []).filter((v) => opts.includes(v));

    renderCheckboxList(colDiv, {
      label: col,
      options: opts,
      selected: filtersState[col],
      onChange: (next) => {
        filtersState[col] = next;
        onChange(filtersState);
      },
    });

    if (disabled) {
      colDiv.querySelectorAll("input").forEach((el) => (el.disabled = true));
    }

    wrap.appendChild(colDiv);
  }

  container.appendChild(wrap);
}
