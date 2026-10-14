// Show / hide / reorder the columns of a Review table.
//
// Every Review page uses this, so the table, the CSV/Excel downloads and the
// printed table all follow the same column choice. The choice is remembered
// for next time (per page) in the browser's local storage.

const storageKey = (pageKey) => `hebrewVerbApp:reviewColumns:${pageKey}`;

/**
 * Builds the column state for a page.
 *   allColumns     — every column the table can show, in its natural order
 *   hiddenByDefault — columns that start unticked (the person can tick them)
 * Anything saved earlier is reconciled against `allColumns`, so a column that
 * was added or removed since doesn't break a remembered choice.
 */
export function createColumnState(pageKey, allColumns, { hiddenByDefault = [] } = {}) {
  const state = {
    pageKey,
    all: [...allColumns],
    defaults: { hidden: [...hiddenByDefault] },
    order: [...allColumns],
    hidden: new Set(hiddenByDefault),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(pageKey)) || "null");
    if (saved && Array.isArray(saved.order) && Array.isArray(saved.hidden)) {
      const known = saved.order.filter((c) => allColumns.includes(c));
      const added = allColumns.filter((c) => !known.includes(c));
      state.order = [...known, ...added];
      state.hidden = new Set(saved.hidden.filter((c) => allColumns.includes(c)));
      // A brand-new column starts visible unless it is hidden by default.
      for (const c of added) if (hiddenByDefault.includes(c)) state.hidden.add(c);
      if (state.order.every((c) => state.hidden.has(c))) state.hidden.clear();
    }
  } catch (e) {
    /* storage unavailable or unreadable — use the defaults */
  }
  return state;
}

function save(state) {
  try {
    localStorage.setItem(storageKey(state.pageKey), JSON.stringify({ order: state.order, hidden: [...state.hidden] }));
  } catch (e) {
    /* the choice just isn't remembered */
  }
}

/** The columns to show, in the chosen order. */
export function visibleColumns(state) {
  return state.order.filter((c) => !state.hidden.has(c));
}

/**
 * Adds the "Columns" section to the sidebar: a tick box and up/down arrows
 * for each column. `onChange` is called after every change.
 */
export function renderColumnPicker(sidebarExtra, state, { labels = {}, onChange }) {
  sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));

  const wrap = document.createElement("div");
  wrap.className = "sidebar-section";
  const title = document.createElement("h3");
  title.className = "sidebar-title";
  title.textContent = "Columns";
  wrap.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "caption";
  hint.style.marginBottom = "8px";
  hint.textContent = "Tick to show a column; use the arrows to reorder. Downloads and printed tables follow this.";
  wrap.appendChild(hint);

  const list = document.createElement("div");
  list.className = "column-picker";
  const shown = visibleColumns(state).length;

  state.order.forEach((col, i) => {
    const row = document.createElement("div");
    row.className = "column-picker-row";

    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !state.hidden.has(col);
    // The last visible column can't be hidden — a table needs at least one.
    cb.disabled = cb.checked && shown === 1;
    cb.addEventListener("change", () => {
      if (cb.checked) state.hidden.delete(col);
      else state.hidden.add(col);
      save(state);
      onChange();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + (labels[col] || col)));
    row.appendChild(label);

    const move = (delta) => {
      const j = i + delta;
      if (j < 0 || j >= state.order.length) return;
      [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
      save(state);
      onChange();
    };
    for (const [text, delta, aria] of [
      ["▲", -1, "Move up"],
      ["▼", 1, "Move down"],
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "column-move-btn";
      b.textContent = text;
      b.setAttribute("aria-label", `${aria}: ${labels[col] || col}`);
      b.disabled = i + delta < 0 || i + delta >= state.order.length;
      b.addEventListener("click", () => move(delta));
      row.appendChild(b);
    }
    list.appendChild(row);
  });
  wrap.appendChild(list);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn btn-outline btn-block";
  reset.style.marginTop = "8px";
  reset.textContent = "Reset Columns";
  reset.addEventListener("click", () => {
    state.order = [...state.all];
    state.hidden = new Set(state.defaults.hidden);
    save(state);
    onChange();
  });
  wrap.appendChild(reset);

  sidebarExtra.appendChild(wrap);
}
