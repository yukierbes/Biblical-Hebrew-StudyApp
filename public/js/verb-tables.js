// The two table views on the Verb Review page.
//
//   By Binyan     — for each verb, for each binyan, one small table per mode
//                   ("Qal Perfect": PGN | Conjugation).
//   By Verb Root  — for each verb, ONE table: Mode | PGN | one column per binyan.
//
// Everything is built from a single plain-data model, so the on-screen tables,
// the printout and the Excel download can never disagree with each other:
//
//   rows ──► buildBinyanTables() / buildRootTable() ──► model
//   model ──► binyanViewHtml() / rootViewHtml()      (screen + print)
//   model ──► exportSheets()                         (Excel)
//
// A "PGN" is Person + Gender + Number written together ("3MS", "2FP", "1CS";
// participles have no person so they're just "MS", "FP"; the two infinitives
// have none at all). When a verb has several forms for the very same
// binyan/mode/PGN, they share one cell, separated by "/" (no spaces).

import { BINYAN_ORDER, BINYAN_ORDER_ONLY_POLEL, MODE_ORDER, POLEL_DATASETS } from "./constants.js";

/** The order PGNs are listed in, within a mode (this is the order in the data and in the example sheets). */
export const PGN_ORDER = [
  "3MS", "3FS", "2MS", "2FS", "1CS",
  "3MP", "3FP", "3CP", "2MP", "2FP", "1CP",
  "MS", "FS", "MP", "FP",
  "", // the infinitives
];

export function pgnOf(row) {
  return `${row.Person || ""}${row.Gender || ""}${row.Number || ""}`;
}

/** Several forms for one slot, joined as "a/b" (exact repeats dropped, original order kept). */
export function joinForms(forms) {
  return [...new Set(forms.filter((f) => f !== undefined && f !== null && String(f).trim() !== ""))].join("/");
}

/** Sort `items` by a fixed order list; anything not in the list keeps its original order, after the listed ones. */
function sortByOrder(items, order) {
  const rank = (x) => {
    const i = order.indexOf(x);
    return i === -1 ? order.length : i;
  };
  return items
    .map((x, i) => [x, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([x]) => x);
}

const unique = (arr) => [...new Set(arr)];

/** Splits filtered rows into one group per verb, in the order the verbs first appear. */
export function groupRowsByVerb(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.Dataset)) groups.set(r.Dataset, []);
    groups.get(r.Dataset).push(r);
  }
  return [...groups].map(([name, verbRows]) => ({ name, rows: verbRows }));
}

/** The binyanim this verb actually has, in the usual order (Polel verbs use Polel/Polal/Hitpolel). */
export function binyanimFor(verbName, verbRows) {
  const present = unique(verbRows.map((r) => r.Binyan));
  const order = POLEL_DATASETS.has(verbName) ? BINYAN_ORDER_ONLY_POLEL : BINYAN_ORDER;
  return sortByOrder(present, order);
}

/** All the forms for one binyan + mode + PGN, as one "a/b" string. */
function formsAt(verbRows, binyan, mode, pgn) {
  return joinForms(verbRows.filter((r) => r.Binyan === binyan && r.Mode === mode && pgnOf(r) === pgn).map((r) => r.Conjugation));
}

/**
 * By Binyan model for one verb:
 *   [ { binyan, tables: [ { mode, rows: [ { pgn, forms } ] } ] } ]
 * A binyan only gets tables for the modes it has forms for.
 */
export function buildBinyanTables(verbName, verbRows) {
  return binyanimFor(verbName, verbRows).map((binyan) => {
    const inBinyan = verbRows.filter((r) => r.Binyan === binyan);
    const tables = sortByOrder(unique(inBinyan.map((r) => r.Mode)), MODE_ORDER).map((mode) => {
      const inMode = inBinyan.filter((r) => r.Mode === mode);
      const pgns = sortByOrder(unique(inMode.map(pgnOf)), PGN_ORDER);
      return { mode, rows: pgns.map((pgn) => ({ pgn, forms: formsAt(inMode, binyan, mode, pgn) })) };
    });
    return { binyan, tables };
  });
}

/**
 * By Verb Root model for one verb:
 *   { binyanim: [...column names],
 *     groups: [ { mode, rows: [ { pgn, cells: [ "a/b" | "" , ... one per binyan ] } ] } ] }
 * A row is listed if ANY binyan has a form for it; a binyan without one gets a blank cell.
 */
export function buildRootTable(verbName, verbRows) {
  const binyanim = binyanimFor(verbName, verbRows);
  const groups = sortByOrder(unique(verbRows.map((r) => r.Mode)), MODE_ORDER).map((mode) => {
    const inMode = verbRows.filter((r) => r.Mode === mode);
    const pgns = sortByOrder(unique(inMode.map(pgnOf)), PGN_ORDER);
    return {
      mode,
      rows: pgns.map((pgn) => ({ pgn, cells: binyanim.map((b) => formsAt(inMode, b, mode, pgn)) })),
    };
  });
  return { binyanim, groups };
}

/** Builds the model for every verb: [{ name, binyanim: [...] }] or [{ name, root: {...} }]. */
export function buildViewModel(view, rows) {
  return groupRowsByVerb(rows).map(({ name, rows: verbRows }) =>
    view === "binyan"
      ? { name, binyanim: buildBinyanTables(name, verbRows) }
      : { name, root: buildRootTable(name, verbRows) }
  );
}

// ---------------------------------------------------------------------------
// HTML (used on screen AND for printing)
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * A verb's name as a heading: Hebrew runs get the Hebrew font, and the Latin
 * part stays as it is ("Strong Verb (קטל)").
 */
function verbNameHtml(name) {
  return esc(name).replace(/[\u0590-\u05FF\uFB1D-\uFB4F]+/g, (m) => `<span lang="he" dir="rtl">${m}</span>`);
}

/**
 * A cell of Hebrew forms. The WHOLE cell is one right-to-left run, so two forms
 * joined with "/" read right-to-left exactly as they do in the Excel sheet
 * (first form on the right), instead of each form being flipped on its own.
 */
function formCellHtml(forms, className = "verb-table-form") {
  if (!forms) return `<td class="${className}"></td>`;
  // <wbr> after each "/" lets a long pair of forms wrap onto two lines (instead
  // of stretching its column); it adds no characters, so copying still gives "a/b".
  const text = esc(forms).replace(/\//g, "/<wbr>");
  const inner = HEBREW.test(forms) ? `<span lang="he" dir="rtl">${text}</span>` : text;
  return `<td class="${className}">${inner}</td>`;
}

function binyanTableHtml(binyan, table) {
  const body = table.rows
    .map((r) => `<tr><td class="verb-table-pgn">${esc(r.pgn)}</td>${formCellHtml(r.forms)}</tr>`)
    .join("");
  return (
    `<table class="verb-table binyan-table">` +
    `<caption>${esc(binyan)} ${esc(table.mode)}</caption>` +
    `<thead><tr><th>PGN</th><th>Conjugation</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

export function binyanViewHtml(verbs) {
  return verbs
    .map(
      (verb) =>
        `<section class="verb-tables-verb">` +
        `<h2 class="verb-tables-title">${verbNameHtml(verb.name)}</h2>` +
        verb.binyanim
          .filter((b) => b.tables.length > 0)
          .map(
            (b) =>
              `<div class="verb-tables-binyan">` +
              `<h3 class="verb-tables-binyan-title">${esc(b.binyan)}</h3>` +
              `<div class="binyan-grid">${b.tables.map((t) => binyanTableHtml(b.binyan, t)).join("")}</div>` +
              `</div>`
          )
          .join("") +
        `</section>`
    )
    .join("");
}

export function rootViewHtml(verbs) {
  return verbs
    .map(({ name, root }) => {
      const head =
        `<tr><th>Mode</th><th>PGN</th>${root.binyanim.map((b) => `<th>${esc(b)}</th>`).join("")}</tr>`;
      const body = root.groups
        .map((g) =>
          g.rows
            .map(
              (r, i) =>
                `<tr${i === 0 ? ' class="group-start"' : ""}>` +
                // The mode is named once, on the first row of its group (as in the example sheet).
                `<td class="verb-table-mode">${i === 0 ? esc(g.mode) : ""}</td>` +
                `<td class="verb-table-pgn">${esc(r.pgn)}</td>` +
                r.cells.map((c) => formCellHtml(c)).join("") +
                `</tr>`
            )
            .join("")
        )
        .join("");
      return (
        `<section class="verb-tables-verb">` +
        `<h2 class="verb-tables-title">${verbNameHtml(name)}</h2>` +
        `<div class="table-wrap"><table class="verb-table root-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>` +
        `</section>`
      );
    })
    .join("");
}

export function viewHtml(view, verbs) {
  return view === "binyan" ? binyanViewHtml(verbs) : rootViewHtml(verbs);
}

// ---------------------------------------------------------------------------
// Excel (laid out like the example sheets)
// ---------------------------------------------------------------------------

/**
 * By Binyan sheet for one verb: blocks stacked top to bottom, each block being
 *   [binyan, mode] / ["PGN", "Conjugation"] / one row per PGN / a blank row.
 */
export function binyanSheetRows(binyanim) {
  const rows = [];
  for (const b of binyanim) {
    for (const t of b.tables) {
      rows.push([b.binyan, t.mode]);
      rows.push(["PGN", "Conjugation"]);
      for (const r of t.rows) rows.push([r.pgn, r.forms]);
      rows.push([]);
    }
  }
  return rows;
}

/** By Verb Root sheet for one verb: Mode | PGN | one column per binyan; Mode only on a group's first row. */
export function rootSheetRows(root) {
  const rows = [["Mode", "PGN", ...root.binyanim]];
  for (const g of root.groups) {
    g.rows.forEach((r, i) => rows.push([i === 0 ? g.mode : "", r.pgn, ...r.cells]));
  }
  return rows;
}

/** An Excel-legal, unique sheet name (max 31 characters, none of  \ / ? * [ ] : ). */
export function sheetNameFor(name, used) {
  const base = String(name).replace(/[\\/?*[\]:]/g, "-").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** One sheet per verb: [{ name, rows, widths }] */
export function exportSheets(view, verbs) {
  const used = new Set();
  return verbs.map((v) =>
    view === "binyan"
      ? { name: sheetNameFor(v.name, used), rows: binyanSheetRows(v.binyanim), widths: [12, 30] }
      : { name: sheetNameFor(v.name, used), rows: rootSheetRows(v.root), widths: [22, 8, ...v.root.binyanim.map(() => 24)] }
  );
}
