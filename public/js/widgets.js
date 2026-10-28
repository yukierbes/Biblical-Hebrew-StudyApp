import { GENERATOR_COLUMNS } from "./constants.js";
import { orderedOptionsFromRows } from "./filters.js";
import { wrapHebrewSpans } from "./helpers.js";
import { listPresets, savePreset, deletePreset, getPreset } from "./filter-presets.js";
import { readCollapsed, writeCollapsed } from "./sidebar-collapse.js";
import { upgradeSnapshotFilters } from "./filter-state.js";

import { renderMyListFilter, setListMode } from "./personal.js";
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
  select.setAttribute("aria-label", "Saved filters");
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
    if (preset) applySnapshot(upgradeSnapshotFilters(preset.snapshot));
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
    savePreset(pageKey, name, { ...getSnapshot(), fv: 2 });
    refreshOptions(name.trim());
  });
  container.appendChild(saveBtn);

  refreshOptions(null);
}

/**
 * Render a labeled scrollable checkbox list.
 * options: string[]
 * selected: null/undefined = every option ticked (the default), otherwise the ticked
 *   options; an empty array means nothing is ticked (see filter-state.js).
 *   (Not mutated in place - the caller manages state.)
 * onChange(next): `next` is null when every option ends up ticked, else the array.
 */
export function renderCheckboxList(container, { label, options, selected, onChange, emptyText }) {
  container.innerHTML = "";

  // A labelled box folds down to just its label (a button), with a short summary
  // after it — "all" or "3 of 12" — so a closed box still shows what it is
  // filtering. Open/closed is remembered by label and starts closed. Everything
  // after the label (Select all row, the list) is hidden by CSS when closed, so the
  // label, button row and list stay siblings in the same order as always.
  if (label) {
    const key = `box:${label}`;
    const lbl = document.createElement("button");
    lbl.type = "button";
    lbl.className = "sidebar-label filter-box-toggle";
    lbl.textContent = label;

    const total = (options || []).length;
    const chosen = selected == null ? total : (options || []).filter((o) => selected.includes(o)).length;
    const active = chosen < total; // anything but "all ticked" narrows the list (none ticked shows nothing)
    lbl.dataset.summary = chosen === total ? "all" : chosen === 0 ? "none" : `${chosen} of ${total}`;
    lbl.dataset.filterActive = String(active);

    const apply = (collapsed) => {
      container.classList.toggle("filter-box-collapsed", collapsed);
      lbl.setAttribute("aria-expanded", String(!collapsed));
    };
    apply(readCollapsed(key, true));
    lbl.addEventListener("click", () => {
      const nowCollapsed = !container.classList.contains("filter-box-collapsed");
      apply(nowCollapsed);
      writeCollapsed(key, nowCollapsed);
    });
    container.appendChild(lbl);
  } else {
    container.classList.remove("filter-box-collapsed");
  }

  if (!options || options.length === 0) {
    const div = document.createElement("div");
    div.className = "caption";
    div.textContent = emptyText || "No options available.";
    container.appendChild(div);
    return;
  }

  const selectedSet = new Set(selected == null ? options : selected);
  const allSelected = options.every((o) => selectedSet.has(o));
  // Every box ticked is stored as null ("all"), so options added later (a new
  // category, say) are included automatically.
  const report = (next) => onChange(options.every((o) => next.includes(o)) ? null : next);

  // "Select all" sits at the left and "Clear all" at the right, lined up
  // with the edge of the box below, so a person can wipe out just THIS
  // filter's choices without touching any of the others (the sidebar's
  // "Reset Filters" button, by contrast, resets every filter at once).
  // Whichever one wouldn't change anything is greyed out.
  const buttonRow = document.createElement("div");
  buttonRow.className = "select-all-row";

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.className = "select-all-btn";
  selectAllBtn.textContent = "Select all";
  selectAllBtn.disabled = allSelected;
  if (label) selectAllBtn.setAttribute("aria-label", `Select all: ${label}`);
  selectAllBtn.addEventListener("click", () => report([...options]));

  const clearAllBtn = document.createElement("button");
  clearAllBtn.type = "button";
  clearAllBtn.className = "select-all-btn clear-all-btn";
  clearAllBtn.textContent = "Clear all";
  clearAllBtn.disabled = selectedSet.size === 0;
  if (label) clearAllBtn.setAttribute("aria-label", `Clear all: ${label}`);
  clearAllBtn.addEventListener("click", () => report([]));

  buttonRow.appendChild(selectAllBtn);
  buttonRow.appendChild(clearAllBtn);
  container.appendChild(buttonRow);

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
      report([...next]);
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
    setListMode("verbs", "all");
    onChange(filtersState);
  });
  wrap.appendChild(resetBtn);
  // My list: study only the verb roots the student has starred (or written a note on).
  if (!disabled) renderMyListFilter(wrap, { area: "verbs", onChange: () => onChange(filtersState) });

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
