import {
  GENERATOR_COLUMNS,
  BINYAN_ORDER,
  BINYAN_ORDER_WITH_POLEL,
  BINYAN_ORDER_ONLY_POLEL,
  POLEL_DATASETS,
  ORDER_MAP,
} from "./constants.js";

/** Unique values of a column across the rows, in insertion order. */
function uniqueValues(rows, column) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const v = (r[column] ?? "").toString().trim();
    if (v !== "" && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Mirrors get_binyan_options(df) in core/filters.py. */
export function getBinyanOptions(rows) {
  const activeDatasets = new Set(rows.map((r) => r.Dataset));

  let hasPolel = false;
  let onlyPolel = activeDatasets.size > 0;
  for (const ds of activeDatasets) {
    if (POLEL_DATASETS.has(ds)) hasPolel = true;
    else onlyPolel = false;
  }

  let order;
  if (onlyPolel) order = BINYAN_ORDER_ONLY_POLEL;
  else if (hasPolel) order = BINYAN_ORDER_WITH_POLEL;
  else order = BINYAN_ORDER;

  const raw = new Set(uniqueValues(rows, "Binyan"));
  return order.filter((o) => raw.has(o));
}

/** Mirrors ordered_options_from_df(df, column). */
export function orderedOptionsFromRows(rows, column) {
  if (column === "Binyan") return getBinyanOptions(rows);

  const raw = uniqueValues(rows, column);
  if (ORDER_MAP[column]) {
    const rawSet = new Set(raw);
    return ORDER_MAP[column].filter((o) => rawSet.has(o));
  }
  return raw;
}

/** Apply a { column: string[] } filter selection to an array of rows. */
export function applyFilters(rows, filters) {
  let out = rows;
  for (const col of GENERATOR_COLUMNS) {
    const vals = filters[col];
    if (vals && vals.length) {
      const set = new Set(vals);
      out = out.filter((r) => set.has((r[col] ?? "").toString()));
    }
  }
  return out;
}

export { GENERATOR_COLUMNS };
