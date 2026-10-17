import { renderCheckboxList, renderPresetControls } from "./widgets.js";
import { freshFilters } from "./letter-sets.js";

import { renderMyListFilter, setListMode } from "./personal.js";
/**
 * Clears the sidebar's extra section and, after the page has been rebuilt,
 * puts the sidebar (and each checkbox list inside it) back at the scroll
 * position it had — every filter click rebuilds the whole panel, which would
 * otherwise jump it to the top. Same behavior as the other pages' filters.
 */
export function resetSidebarKeepingScroll(sidebarExtra) {
  const scrollContainer = sidebarExtra.closest("#sidebar") || sidebarExtra;
  const sidebarScrollTop = scrollContainer.scrollTop;
  const listScrollTops = [...sidebarExtra.querySelectorAll(".checkbox-list")].map((el) => el.scrollTop);
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    scrollContainer.scrollTop = sidebarScrollTop;
    sidebarExtra.querySelectorAll(".checkbox-list").forEach((el, i) => {
      if (listScrollTops[i] != null) el.scrollTop = listScrollTops[i];
    });
  });
}

/**
 * Adds the standard "Filters" block to the sidebar: Reset Filters, saved
 * presets, and one checkbox list per filter the set defines (each with the
 * usual Select all / Clear all).
 *
 *   state.filters  — { [filterKey]: string[] }, mutated here
 *   pageKey        — presets are saved per page (e.g. "vowel-review")
 *   onChange       — called after any change so the page can rebuild
 */
export function renderLetterFilters(sidebarExtra, { set, state, pageKey, onChange }) {
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
    state.filters = freshFilters(set);
    setListMode(set.id, "all");
    onChange();
  });
  filterWrap.appendChild(resetBtn);
  renderMyListFilter(filterWrap, { area: set.id, onChange });

  const presetDiv = document.createElement("div");
  presetDiv.style.marginBottom = "16px";
  renderPresetControls(presetDiv, {
    pageKey,
    getSnapshot: () => ({ filters: state.filters }),
    applySnapshot: (snap) => {
      state.filters = { ...freshFilters(set), ...snap.filters };
      onChange();
    },
  });
  filterWrap.appendChild(presetDiv);

  for (const def of set.filters) {
    const div = document.createElement("div");
    div.style.marginBottom = "14px";
    renderCheckboxList(div, {
      label: def.label,
      options: def.options(),
      selected: state.filters[def.key],
      onChange: (next) => {
        state.filters[def.key] = next;
        onChange();
      },
    });
    filterWrap.appendChild(div);
  }

  sidebarExtra.appendChild(filterWrap);
}
