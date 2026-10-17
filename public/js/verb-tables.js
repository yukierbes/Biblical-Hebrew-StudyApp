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
// "Compare with the Strong Verb": the By Verb Root table can put Strong Verb (קטל)
// beside any other verb, binyan by binyan (Qal קטל | Qal שחט | Niphal קטל | …).
// That is built into the same model (see buildRootTable's `strongRows`), so the
// screen, the printout and the Excel download all follow it.
//
// A "PGN" is Person + Gender + Number written together ("3MS", "2FP", "1CS";
// participles have no person so they're just "MS", "FP"; the two infinitives
// have none at all). When a verb has several forms for the very same
// binyan/mode/PGN, they share one cell, separated by "/" (no spaces).

import { BINYAN_ORDER, BINYAN_ORDER_ONLY_POLEL, MODE_ORDER, POLEL_DATASETS } from "./constants.js";

/** The verb every other verb can be compared with. */
export const STRONG_VERB = "Strong Verb (\u05E7\u05D8\u05DC)"; // Strong Verb (קטל)

/** The root letters in a verb's name: "II-Gutteral (שחט)" -> "שחט" (the whole name if there are none). */
export function rootLetters(name) {
  const m = String(name).match(/\(([^)]*)\)\s*$/);
  return m ? m[1] : String(name);
}

/** The most columns a printed By Verb Root table holds before it is split in two (see splitRootColumns). */
export const MAX_COLUMNS_PER_TABLE = 8;

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
 *   { binyanim: [...the verb's own binyan names],
 *     columns:  [ { binyan, strong, label } ... one per table column ],
 *     compared: true when Strong Verb (קטל) columns are included,
 *     groups: [ { mode, rows: [ { pgn, cells: [ "a/b" | "" , ... one per COLUMN ] } ] } ] }
 * A row is listed if ANY column has a form for it; a column without one gets a blank cell.
 *
 * Without `strongRows` there is one column per binyan. With `strongRows` (the Strong
 * Verb (קטל) rows, already filtered the same way as this verb's), every binyan the
 * strong verb also has gets TWO columns, strong first: Qal קטל | Qal שחט. A binyan
 * the strong verb lacks (Polel, Polal, Hitpolel) just gets the verb's own column,
 * and the verb's binyanim are the only ones shown, so a Qal-only verb is compared in
 * Qal alone.
 */
export function buildRootTable(verbName, verbRows, strongRows = null) {
  if (verbName === STRONG_VERB) strongRows = null; // the Strong Verb is never compared with itself
  const binyanim = binyanimFor(verbName, verbRows);
  const strongHas = new Set((strongRows || []).filter((r) => binyanim.includes(r.Binyan)).map((r) => r.Binyan));
  const compared = strongHas.size > 0;
  const pairedStrongRows = compared ? strongRows.filter((r) => strongHas.has(r.Binyan)) : [];

  const columns = [];
  for (const binyan of binyanim) {
    if (strongHas.has(binyan)) columns.push({ binyan, strong: true, label: rootLetters(STRONG_VERB) });
    columns.push({ binyan, strong: false, label: rootLetters(verbName) });
  }

  const pool = [...verbRows, ...pairedStrongRows];
  const groups = sortByOrder(unique(pool.map((r) => r.Mode)), MODE_ORDER).map((mode) => {
    const ownInMode = verbRows.filter((r) => r.Mode === mode);
    const strongInMode = pairedStrongRows.filter((r) => r.Mode === mode);
    const pgns = sortByOrder(unique([...ownInMode, ...strongInMode].map(pgnOf)), PGN_ORDER);
    return {
      mode,
      rows: pgns.map((pgn) => ({
        pgn,
        cells: columns.map((c) => formsAt(c.strong ? strongInMode : ownInMode, c.binyan, mode, pgn)),
      })),
    };
  });
  return { binyanim, columns, compared, groups };
}

/** A table model's columns; a model made without them (one column per binyan) gets them worked out. */
export function rootColumns(root) {
  return root.columns || root.binyanim.map((binyan) => ({ binyan, strong: false, label: binyan }));
}

/**
 * How a wide By Verb Root table is divided to fit a printed page: one part when it
 * has MAX_COLUMNS_PER_TABLE columns or fewer, otherwise two halves that split
 * between binyanim (never inside a Strong | verb pair), as evenly as possible,
 * the bigger half first. Each part is { indexes: [column numbers], label }, where
 * the label names the binyanim it covers ("Qal – Pual"; "" when there is one part).
 */
export function splitRootColumns(root, maxColumns = MAX_COLUMNS_PER_TABLE) {
  const columns = rootColumns(root);
  const n = columns.length;
  const all = [...Array(n).keys()];
  if (n <= maxColumns) return [{ indexes: all, label: "" }];

  let best = null;
  for (let p = 1; p < n; p++) {
    if (columns[p].binyan === columns[p - 1].binyan) continue; // not between binyanim
    const score = Math.abs(p - (n - p));
    const fits = p <= maxColumns && n - p <= maxColumns;
    if (!best || (fits && !best.fits) || (fits === best.fits && (score < best.score || (score === best.score && p > best.p)))) {
      best = { p, score, fits };
    }
  }
  const range = (idx) => {
    const first = columns[idx[0]].binyan;
    const last = columns[idx[idx.length - 1]].binyan;
    return first === last ? first : `${first} \u2013 ${last}`;
  };
  const left = all.slice(0, best.p);
  const right = all.slice(best.p);
  return [
    { indexes: left, label: range(left) },
    { indexes: right, label: range(right) },
  ];
}

/**
 * The mode groups of a table as they appear in one part of a split table: rows
 * that have a form in none of that part's columns are left out, and so are modes
 * left with no rows. (The whole table, or a part holding every column, is
 * returned unchanged.)
 */
export function rootPartGroups(root, indexes) {
  if (indexes.length === rootColumns(root).length) return root.groups;
  return root.groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => indexes.some((i) => r.cells[i])) }))
    .filter((g) => g.rows.length > 0);
}

/**
 * Builds the model for every verb: [{ name, binyanim: [...] }] or [{ name, root: {...} }].
 * `strongRows` (By Verb Root only) turns on the Strong Verb (קטל) comparison for every
 * verb except the Strong Verb itself.
 */
export function buildViewModel(view, rows, { strongRows = null } = {}) {
  return groupRowsByVerb(rows).map(({ name, rows: verbRows }) =>
    view === "binyan"
      ? { name, binyanim: buildBinyanTables(name, verbRows) }
      : { name, root: buildRootTable(name, verbRows, name === STRONG_VERB ? null : strongRows) }
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
export { esc as escapeHtml };

const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * A verb's name as a heading: Hebrew runs get the Hebrew font, and the Latin
 * part stays as it is ("Strong Verb (קטל)").
 */
export function verbNameHtml(name) {
  return esc(name).replace(/[\u0590-\u05FF\uFB1D-\uFB4F]+/g, (m) => `<span lang="he" dir="rtl">${m}</span>`);
}

/** A diagonal line from corner to corner, marking a cell that is simply not used. Drawn as SVG (not a CSS
 * background) because browsers don't print backgrounds unless asked to. */
const CROSSED_OUT_LINE =
  '<svg class="crossed-out" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
  '<line x1="0" y1="100" x2="100" y2="0"/></svg>';

/**
 * A cell of Hebrew forms. The WHOLE cell is one right-to-left run, so two forms
 * joined with "/" read right-to-left exactly as they do in the Excel sheet
 * (first form on the right), instead of each form being flipped on its own.
 *
 * `blank` is for practice worksheets: the answer is left empty, to be written
 * in. If `crossOutUnused` is also set, a cell that has no form at all (that
 * binyan simply doesn't have it) is crossed out with a diagonal line instead.
 */
export function formCellHtml(forms, { className = "verb-table-form", blank = false, crossOutUnused = false } = {}) {
  if (blank) {
    if (!forms && crossOutUnused) return `<td class="${className} verb-table-unused">${CROSSED_OUT_LINE}</td>`;
    return `<td class="${className} verb-table-blank"></td>`;
  }
  if (!forms) return `<td class="${className}"></td>`;
  // <wbr> after each "/" lets a long pair of forms wrap onto two lines (instead
  // of stretching its column); it adds no characters, so copying still gives "a/b".
  const text = esc(forms).replace(/\//g, "/<wbr>");
  const inner = HEBREW.test(forms) ? `<span lang="he" dir="rtl">${text}</span>` : text;
  return `<td class="${className}">${inner}</td>`;
}

export function binyanTableHtml(binyan, table, { blank = false } = {}) {
  const body = table.rows
    .map((r) => `<tr><td class="verb-table-pgn">${esc(r.pgn)}</td>${formCellHtml(r.forms, { blank })}</tr>`)
    .join("");
  return (
    `<table class="verb-table binyan-table${blank ? " blank-table" : ""}">` +
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
        `<h2 class="verb-tables-title" data-verb="${esc(verb.name)}">${verbNameHtml(verb.name)}</h2>` +
        verb.binyanim
          .filter((b) => b.tables.length > 0)
          .map(
            (b) =>
              `<div class="verb-tables-binyan">` +
              `<h3 class="verb-tables-binyan-title" data-verb="${esc(verb.name)}" data-binyan="${esc(b.binyan)}">${esc(b.binyan)}</h3>` +
              `<div class="binyan-grid">${b.tables.map((t) => binyanTableHtml(b.binyan, t)).join("")}</div>` +
              `</div>`
          )
          .join("") +
        `</section>`
    )
    .join("");
}

/** How wide (as a % of the page) a printed root table is: narrower for a table with fewer columns. */
export function rootTableWidthPercent(columnCount) {
  return Math.min(100, Math.round((16.5 + 12 * columnCount) * 10) / 10);
}

/** Root letters as a small Hebrew run, for column headings. */
const lettersHtml = (letters) => `<span lang="he" dir="rtl" class="th-hebrew">${esc(letters)}</span>`;

/**
 * The heading rows of a By Verb Root table. Plain: one row of binyan names.
 * Compared with the Strong Verb: a first row of binyan names, each spanning its
 * Strong | verb pair, and a second row naming the columns by their root letters
 * (the Strong Verb's columns are marked `col-strong` so they can be shaded).
 */
function rootHeadHtml(cols, compared) {
  if (!compared) return `<tr><th>Mode</th><th>PGN</th>${cols.map((c) => `<th>${esc(c.binyan)}</th>`).join("")}</tr>`;
  const spans = [];
  for (const c of cols) {
    const last = spans[spans.length - 1];
    if (last && last.binyan === c.binyan) last.span++;
    else spans.push({ binyan: c.binyan, span: 1 });
  }
  return (
    `<tr><th rowspan="2">Mode</th><th rowspan="2">PGN</th>` +
    spans.map((g) => `<th colspan="${g.span}" class="binyan-head">${esc(g.binyan)}</th>`).join("") +
    `</tr>` +
    `<tr class="root-letters-row">${cols.map((c) => `<th class="${c.strong ? "col-strong" : ""}">${lettersHtml(c.label)}</th>`).join("")}</tr>`
  );
}

/**
 * One By Verb Root table. Each mode is its own <tbody>, so a printout can place
 * whole modes on a page.
 *   blank       — practice worksheet: answers left empty, unused cells crossed out
 *   strongBlank — on a blank worksheet, ALSO leave the Strong Verb columns empty
 *                 (by default they stay filled in, as a model to compare against)
 *   groups      — only these modes (default: all); used when a table continues on a new page
 *   columns     — only these column numbers (default: all); used for one half of a split table
 *   printLayout — fixed column widths, so every page of a printout has identical columns
 */
export function rootTableHtml(root, { blank = false, strongBlank = false, groups = root.groups, columns = null, printLayout = false } = {}) {
  const allColumns = rootColumns(root);
  const indexes = columns || allColumns.map((_, i) => i);
  const cols = indexes.map((i) => allColumns[i]);
  const head = rootHeadHtml(cols, root.compared);

  const cellHtml = (value, col) => {
    const className = col.strong ? "verb-table-form verb-table-strong" : "verb-table-form";
    // A Strong Verb column stays filled in on a worksheet unless asked otherwise; a cell
    // the strong verb has no form for is still crossed out, like any other unused cell.
    if (blank && col.strong && !strongBlank) {
      return value ? formCellHtml(value, { className }) : formCellHtml("", { className, blank: true, crossOutUnused: true });
    }
    return formCellHtml(value, { className, blank, crossOutUnused: true });
  };

  const body = groups
    .map(
      (g) =>
        `<tbody class="mode-group">` +
        g.rows
          .map(
            (r, i) =>
              `<tr${i === 0 ? ' class="group-start"' : ""}>` +
              // The mode is named once, on the first row of its group (as in the example sheet).
              `<td class="verb-table-mode">${i === 0 ? esc(g.mode) : ""}</td>` +
              `<td class="verb-table-pgn">${esc(r.pgn)}</td>` +
              indexes.map((ci) => cellHtml(r.cells[ci], allColumns[ci])).join("") +
              `</tr>`
          )
          .join("") +
        `</tbody>`
    )
    .join("");

  let tableAttrs = "";
  let colgroup = "";
  if (printLayout) {
    const total = rootTableWidthPercent(cols.length);
    const modePct = ((11 / total) * 100).toFixed(2);
    const pgnPct = ((5.5 / total) * 100).toFixed(2);
    const colPct = (((total - 16.5) / cols.length / total) * 100).toFixed(2);
    tableAttrs = ` style="width:${total}%"`;
    colgroup =
      `<colgroup><col style="width:${modePct}%"><col style="width:${pgnPct}%">` +
      cols.map(() => `<col style="width:${colPct}%">`).join("") +
      `</colgroup>`;
  }
  return (
    `<table class="verb-table root-table${printLayout ? " print-root" : ""}${blank ? " blank-table" : ""}${root.compared ? " compared-table" : ""}"${tableAttrs}>` +
    `${colgroup}<thead>${head}</thead>${body}</table>`
  );
}

export function rootViewHtml(verbs) {
  return verbs
    .map(
      ({ name, root }) =>
        `<section class="verb-tables-verb">` +
        `<h2 class="verb-tables-title" data-verb="${esc(name)}">${verbNameHtml(name)}</h2>` +
        (root.compared
          ? `<p class="compare-note">Shaded columns: <b>${verbNameHtml(STRONG_VERB)}</b>, beside this verb's own column for each binyan.</p>`
          : "") +
        `<div class="table-wrap">${rootTableHtml(root)}</div>` +
        `</section>`
    )
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

/**
 * By Verb Root sheet for one verb: Mode | PGN | one column per table column; Mode only on a
 * group's first row. When compared with the Strong Verb the columns are interleaved exactly
 * as on screen, and each heading carries its root letters: "Qal (קטל)", "Qal (שחט)".
 */
export function rootSheetRows(root) {
  const heading = (c) => (root.compared ? `${c.binyan} (${c.label})` : c.binyan);
  const rows = [["Mode", "PGN", ...rootColumns(root).map(heading)]];
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
      : { name: sheetNameFor(v.name, used), rows: rootSheetRows(v.root), widths: [22, 8, ...rootColumns(v.root).map(() => 24)] }
  );
}
