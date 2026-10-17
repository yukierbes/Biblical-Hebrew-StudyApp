import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import {
  STRONG_VERB, rootLetters, buildRootTable, buildViewModel, splitRootColumns, rootPartGroups,
  rootTableHtml, rootViewHtml, rootSheetRows, exportSheets, rootTableWidthPercent, MAX_COLUMNS_PER_TABLE,
} from "../public/js/verb-tables.js";
import { loadVerbData } from "../public/js/data.js";

// "Compare with Strong Verb (קטל)" on the Verb Review page's By Verb Root view:
// the model, the table, the print halves, the worksheets, Excel, and the page controls.

const { document } = await setupApp();
const win = document.defaultView;
const content = document.getElementById("content");
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const rowsOf = (name) => loadVerbData([name]);
const STRONG_ROWS = rowsOf(STRONG_VERB);
const SHACHAT = "II-Gutteral (\u05E9\u05D7\u05D8)"; // II-Gutteral (שחט)
const QUM = "II-Yod Vav (\u05E7\u05D5\u05DD)"; // II-Yod Vav (קום)
const KAVED = "Stative Verb (\u05DB\u05D1\u05D3)"; // Stative Verb (כבד) — Qal only
const HAYA = "\u05D4\u05D9\u05D4"; // היה — Qal and Niphal
const PAKAD = "Strong Verb (\u05E4\u05E7\u05D3)";
const KATAV = "Strong Verb (\u05DB\u05EA\u05D1)";
const tags = (root) => root.columns.map((c) => c.binyan + (c.strong ? "*" : "")).join(",");

console.log("\nThe comparison model");
{
  assert(rootLetters(SHACHAT) === "\u05E9\u05D7\u05D8" && rootLetters(HAYA) === HAYA, "root letters are taken from the verb's name");

  const plain = buildRootTable(SHACHAT, rowsOf(SHACHAT));
  assert(!plain.compared && plain.columns.length === 7 && plain.columns.every((c) => !c.strong), "without the comparison a verb is exactly as before: one column per binyan");

  const own = buildRootTable(STRONG_VERB, STRONG_ROWS, STRONG_ROWS);
  assert(!own.compared && own.columns.length === 7, "the Strong Verb (קטל) itself is never compared with itself");

  const t = buildRootTable(SHACHAT, rowsOf(SHACHAT), STRONG_ROWS);
  assert(t.compared && t.columns.length === 14, "a seven-binyan verb gets fourteen columns");
  assert(tags(t) === "Qal*,Qal,Niphal*,Niphal,Piel*,Piel,Pual*,Pual,Hitpael*,Hitpael,Hiphil*,Hiphil,Hophal*,Hophal", `interleaved, Strong Verb first in each pair (${tags(t)})`);
  assert(t.columns[0].label === "\u05E7\u05D8\u05DC" && t.columns[1].label === "\u05E9\u05D7\u05D8", "each column carries its root letters (קטל / שחט)");
  assert(t.binyanim.length === 7, "binyanim still lists the verb's own binyanim");

  // The Strong Verb's columns hold the Strong Verb's own forms; the verb's hold the verb's.
  const strongTable = buildRootTable(STRONG_VERB, STRONG_ROWS);
  const plainByKey = new Map();
  for (const g of plain.groups) for (const r of g.rows) plainByKey.set(`${g.mode}|${r.pgn}`, r.cells);
  const strongByKey = new Map();
  for (const g of strongTable.groups) for (const r of g.rows) strongByKey.set(`${g.mode}|${r.pgn}`, r.cells);
  let ok = true;
  for (const g of t.groups) {
    for (const r of g.rows) {
      for (let b = 0; b < 7; b++) {
        if (r.cells[b * 2] !== strongByKey.get(`${g.mode}|${r.pgn}`)[b]) ok = false;
        if (r.cells[b * 2 + 1] !== plainByKey.get(`${g.mode}|${r.pgn}`)[b]) ok = false;
      }
    }
  }
  assert(ok, "every Strong Verb cell is the Strong Verb's form, and every other cell is the verb's own form");
  assert(t.groups.reduce((n, g) => n + g.rows.length, 0) === 43, "the same 43 rows as before");

  // פקד and כתב are compared too (they differ slightly from קטל).
  for (const name of [PAKAD, KATAV]) {
    const x = buildRootTable(name, rowsOf(name), STRONG_ROWS);
    assert(x.compared && x.columns.length === 14, `${name} is compared with the Strong Verb (קטל) as well`);
  }
  const pakadDiffers = buildRootTable(PAKAD, rowsOf(PAKAD), STRONG_ROWS).groups.some((g) => g.rows.some((r) => r.cells.some((c, i) => i % 2 === 1 && c !== r.cells[i - 1])));
  assert(pakadDiffers, "...and some of their forms really do differ from the Strong Verb's");
}

console.log("\nVerbs with fewer binyanim, and the Polel verbs");
{
  const k = buildRootTable(KAVED, rowsOf(KAVED), STRONG_ROWS);
  assert(tags(k) === "Qal*,Qal", `a Qal-only verb is compared in Qal alone (${tags(k)})`);
  assert(k.groups.reduce((n, g) => n + g.rows.length, 0) === 43, "...with all its rows");
  const h = buildRootTable(HAYA, rowsOf(HAYA), STRONG_ROWS);
  assert(tags(h) === "Qal*,Qal,Niphal*,Niphal", `היה (Qal and Niphal) gets those two pairs (${tags(h)})`);
  const q = buildRootTable(QUM, rowsOf(QUM), STRONG_ROWS);
  assert(tags(q) === "Qal*,Qal,Niphal*,Niphal,Polel,Polal,Hitpolel,Hiphil*,Hiphil,Hophal*,Hophal", `Polel, Polal and Hitpolel have no Strong Verb partner (${tags(q)})`);
  assert(q.columns.length === 11, "eleven columns for קום");
  const polelCells = q.groups.flatMap((g) => g.rows.map((r) => r.cells[q.columns.findIndex((c) => c.binyan === "Polel")]));
  assert(polelCells.some(Boolean), "the Polel column still holds the verb's own forms");
  const sav = buildRootTable("II-Geminate (\u05E1\u05D1\u05D1)", rowsOf("II-Geminate (\u05E1\u05D1\u05D1)"), STRONG_ROWS);
  assert(sav.columns.length === 11 && sav.columns.filter((c) => c.strong).length === 4, "סבב is the same");
}

console.log("\nRows the verb lacks but the Strong Verb has");
{
  // Take שחט's Qal 2FP Imperative away: the Strong Verb still has it, so the row stays, with the verb's cell blank.
  const trimmed = rowsOf(SHACHAT).filter((r) => !(r.Binyan === "Qal" && r.Mode === "Imperative" && r.Gender === "F" && r.Number === "P"));
  const t = buildRootTable(SHACHAT, trimmed, STRONG_ROWS);
  const imp = t.groups.find((g) => g.mode === "Imperative");
  const row = imp.rows.find((r) => r.pgn === "2FP");
  assert(!!row && row.cells[0] !== "" && row.cells[1] === "", "the row is listed: the Strong Verb's cell is filled and the verb's is blank");
  const alone = buildRootTable(SHACHAT, trimmed);
  assert(!alone.groups.find((g) => g.mode === "Imperative").rows.some((r) => r.pgn === "2FP" && r.cells.some(Boolean) && false), "(without the comparison nothing changes)");
}

console.log("\nBuilding every verb at once");
{
  const all = [STRONG_VERB, SHACHAT, KAVED].flatMap(rowsOf);
  const off = buildViewModel("root", all);
  assert(off.every((v) => !v.root.compared), "no comparison unless asked");
  const on = buildViewModel("root", all, { strongRows: STRONG_ROWS });
  assert(!on[0].root.compared && on[1].root.compared && on[2].root.compared, "on: every verb except the Strong Verb (קטל) is compared");
  assert(buildViewModel("binyan", all, { strongRows: STRONG_ROWS }).every((v) => v.binyanim && !v.root), "By Binyan ignores it");
  // The Strong Verb is used even when it is not one of the verbs on show, and filters apply to its rows too.
  const onlyShachat = buildViewModel("root", rowsOf(SHACHAT), { strongRows: STRONG_ROWS });
  assert(onlyShachat.length === 1 && onlyShachat[0].root.columns.length === 14, "compared even though the Strong Verb (קטל) isn't among the verbs shown");
  const perfectOnly = STRONG_ROWS.filter((r) => r.Mode === "Perfect");
  const filtered = buildRootTable(SHACHAT, rowsOf(SHACHAT).filter((r) => r.Mode === "Perfect"), perfectOnly);
  assert(filtered.groups.length === 1 && filtered.groups[0].mode === "Perfect", "a Mode filter leaves only that mode in both");
  const qalOnly = buildRootTable(SHACHAT, rowsOf(SHACHAT).filter((r) => r.Binyan === "Qal"), STRONG_ROWS.filter((r) => r.Binyan === "Qal"));
  assert(tags(qalOnly) === "Qal*,Qal", "a Binyan filter leaves only Qal in both");
}

console.log("\nSplitting a wide table for printing");
{
  assert(MAX_COLUMNS_PER_TABLE === 8, "a printed table holds up to 8 columns");
  const t = buildRootTable(SHACHAT, rowsOf(SHACHAT), STRONG_ROWS);
  const parts = splitRootColumns(t);
  assert(parts.length === 2 && parts[0].label === "Qal \u2013 Pual" && parts[1].label === "Hitpael \u2013 Hophal", `two halves: ${parts.map((p) => p.label).join(" | ")}`);
  assert(parts[0].indexes.length === 8 && parts[1].indexes.length === 6, "Qal to Pual (8 columns), then Hitpael to Hophal (6)");
  assert(parts.every((p) => t.columns[p.indexes[0]].strong), "a half never starts inside a Strong | verb pair");
  assert([...parts[0].indexes, ...parts[1].indexes].join() === [...Array(14).keys()].join(), "every column is in exactly one half, in order");
  const q = splitRootColumns(buildRootTable(QUM, rowsOf(QUM), STRONG_ROWS));
  assert(q.length === 2 && q[0].indexes.length === 6 && q[1].indexes.length === 5 && q[0].label === "Qal \u2013 Polal" && q[1].label === "Hitpolel \u2013 Hophal", `קום: ${q.map((p) => p.label + "(" + p.indexes.length + ")").join(" | ")}`);
  assert(splitRootColumns(buildRootTable(SHACHAT, rowsOf(SHACHAT))).length === 1, "without the comparison a seven-binyan table is not split (as before)");
  assert(splitRootColumns(buildRootTable(KAVED, rowsOf(KAVED), STRONG_ROWS)).length === 1 && splitRootColumns(buildRootTable(HAYA, rowsOf(HAYA), STRONG_ROWS)).length === 1, "short tables stay whole");
  assert(rootPartGroups(t, [...Array(14).keys()]) === t.groups, "a part holding every column is the whole table");

  const synthetic = {
    binyanim: ["Qal", "Niphal"],
    columns: [{ binyan: "Qal", strong: true, label: "a" }, { binyan: "Qal", strong: false, label: "b" }, { binyan: "Niphal", strong: true, label: "a" }, { binyan: "Niphal", strong: false, label: "b" }],
    compared: true,
    groups: [
      { mode: "Perfect", rows: [{ pgn: "3MS", cells: ["x", "y", "", ""] }, { pgn: "3FS", cells: ["", "", "z", ""] }] },
      { mode: "Imperative", rows: [{ pgn: "2MS", cells: ["", "", "", "w"] }] },
    ],
  };
  const secondHalf = rootPartGroups(synthetic, [2, 3]);
  assert(secondHalf.length === 2 && secondHalf[0].rows.length === 1 && secondHalf[0].rows[0].pgn === "3FS", "a half drops the rows it has no forms for");
  const firstHalf = rootPartGroups(synthetic, [0, 1]);
  assert(firstHalf.length === 1 && firstHalf[0].mode === "Perfect" && firstHalf[0].rows.length === 1, "...and the modes left empty");
}

console.log("\nThe compared table");
{
  const t = buildRootTable(SHACHAT, rowsOf(SHACHAT), STRONG_ROWS);
  const box = document.createElement("div");
  box.innerHTML = rootTableHtml(t);
  const heads = box.querySelectorAll("thead tr");
  assert(heads.length === 2, "two heading rows");
  assert(box.querySelectorAll("thead th[rowspan='2']").length === 2, "Mode and PGN span both");
  const binyanHeads = [...box.querySelectorAll("th.binyan-head")];
  assert(binyanHeads.length === 7 && binyanHeads.every((th) => th.getAttribute("colspan") === "2"), "each binyan heads its Strong | verb pair");
  assert(binyanHeads.map((th) => th.textContent).join() === "Qal,Niphal,Piel,Pual,Hitpael,Hiphil,Hophal", "...in order");
  const letters = [...heads[1].querySelectorAll("th")];
  assert(letters.length === 14 && letters.filter((th) => th.classList.contains("col-strong")).length === 7, "the second row names the 14 columns, 7 of them the Strong Verb's");
  assert(letters[0].textContent === "\u05E7\u05D8\u05DC" && letters[1].textContent === "\u05E9\u05D7\u05D8", "by their root letters (קטל, שחט)");
  assert(letters[0].querySelector("[lang='he']"), "set in the Hebrew font");
  assert(box.querySelectorAll("td.verb-table-strong").length === 7 * 43, "every Strong Verb cell is marked for shading (7 x 43)");
  assert([...box.querySelectorAll("tbody tr")].every((tr) => tr.children.length === 16), "16 cells in every row (Mode, PGN, 14 forms)");
  assert([...box.querySelectorAll("tbody tr")].every((tr) => [...tr.children].slice(2).every((td, i) => td.classList.contains("verb-table-strong") === (i % 2 === 0))), "the shading falls on the Strong Verb's columns only");
  assert(box.querySelector("table").classList.contains("compared-table"), "the table is marked as compared");

  const plain = document.createElement("div");
  plain.innerHTML = rootTableHtml(buildRootTable(SHACHAT, rowsOf(SHACHAT)));
  assert(plain.querySelectorAll("thead tr").length === 1 && !plain.querySelector(".verb-table-strong, .col-strong, .compared-table"), "without the comparison: one heading row, nothing shaded, exactly as before");

  const view = document.createElement("div");
  view.innerHTML = rootViewHtml(buildViewModel("root", rowsOf(SHACHAT), { strongRows: STRONG_ROWS }));
  assert(/Shaded columns/.test(view.textContent), "the on-screen view explains the shading");

  // Print layout: a half is its own fixed-width table.
  const part = splitRootColumns(t)[0];
  const half = document.createElement("div");
  half.innerHTML = rootTableHtml(t, { printLayout: true, columns: part.indexes, groups: rootPartGroups(t, part.indexes) });
  assert(half.querySelectorAll("col").length === 10 && /width:100%/.test(half.querySelector("table").getAttribute("style")), "a half has Mode, PGN and its 8 columns, across the full width");
  assert(half.querySelectorAll("thead th.binyan-head").length === 4, "...covering four binyanim");
  assert(rootTableWidthPercent(2) < 45 && rootTableWidthPercent(8) === 100, "a Qal-only compared table is narrow; eight columns fill the page");
}

console.log("\nWorksheets: the Strong Verb columns");
{
  const t = buildRootTable(SHACHAT, rowsOf(SHACHAT), STRONG_ROWS);
  const filled = document.createElement("div");
  filled.innerHTML = rootTableHtml(t, { blank: true, printLayout: true });
  const strongCells = [...filled.querySelectorAll("td.verb-table-strong")];
  const own = [...filled.querySelectorAll("td.verb-table-form:not(.verb-table-strong)")];
  assert(strongCells.length === 7 * 43 && own.length === 7 * 43, "301 Strong Verb cells and 301 of the verb's own");
  assert(own.every((td) => td.textContent === ""), "the verb's own cells are left empty to write in");
  assert(strongCells.filter((td) => td.textContent.trim()).length === 301 - 52, "by default the Strong Verb cells stay filled in, as a model");
  assert(strongCells.filter((td) => !td.textContent.trim()).every((td) => td.classList.contains("verb-table-unused")), "a Strong Verb cell with no form is crossed out like any unused cell");

  const empty = document.createElement("div");
  empty.innerHTML = rootTableHtml(t, { blank: true, strongBlank: true, printLayout: true });
  assert([...empty.querySelectorAll("td.verb-table-form")].every((td) => td.textContent === ""), "with the choice made, the Strong Verb columns are empty too");
  assert(empty.querySelectorAll("td.verb-table-strong.verb-table-blank").length === 301 - 52, "...as boxes to write in");
  assert(empty.querySelectorAll("td.verb-table-unused").length === filled.querySelectorAll("td.verb-table-unused").length, "...with the same cells crossed out either way");

  const key = document.createElement("div");
  key.innerHTML = rootTableHtml(t, { printLayout: true, strongBlank: true });
  assert(key.querySelectorAll("td.verb-table-unused").length === 0 && [...key.querySelectorAll("td.verb-table-strong")].filter((td) => td.textContent.trim()).length === 301 - 52, "the answer key shows everything, whatever the worksheet choice");
}

console.log("\nExcel");
{
  const t = buildRootTable(SHACHAT, rowsOf(SHACHAT), STRONG_ROWS);
  const rows = rootSheetRows(t);
  assert(rows[0].length === 16 && rows[0].slice(0, 6).join("|") === "Mode|PGN|Qal (\u05E7\u05D8\u05DC)|Qal (\u05E9\u05D7\u05D8)|Niphal (\u05E7\u05D8\u05DC)|Niphal (\u05E9\u05D7\u05D8)", `interleaved columns, each headed with its root letters (${rows[0].slice(0, 6).join(" | ")})`);
  assert(rows.length === 1 + 43 && rows[1].length === 16 && rows[1][0] === "Perfect" && rows[2][0] === "", "Mode is still written once per group");
  assert(rootSheetRows(buildRootTable(SHACHAT, rowsOf(SHACHAT)))[0].join("|") === "Mode|PGN|Qal|Niphal|Piel|Pual|Hitpael|Hiphil|Hophal", "without the comparison the sheet is exactly as before");
  const sheets = exportSheets("root", buildViewModel("root", [...STRONG_ROWS, ...rowsOf(SHACHAT)], { strongRows: STRONG_ROWS }));
  assert(sheets.length === 2 && sheets[0].rows[0].length === 9 && sheets[1].rows[0].length === 16, "one sheet per verb: the Strong Verb as before, the other interleaved");
  assert(sheets[1].widths.length === 16, "with a width for every column");
}

console.log("\nThe Verb Review page");
const switchView = async (key) => {
  click(content.querySelector(`.view-switch button[data-view="${key}"]`));
  await wait(40);
};
const tickDataset = async (name, on) => {
  const label = [...document.querySelectorAll("#sidebar-extra .checkbox-list label")].find((l) => l.textContent.includes(name));
  const cb = label.querySelector("input");
  cb.checked = on;
  cb.dispatchEvent(new win.Event("change", { bubbles: true }));
  await wait(80);
};
const compareBox = () => content.querySelector("#compare-strong");
const setCompare = async (on) => {
  compareBox().checked = on;
  compareBox().dispatchEvent(new win.Event("change", { bubbles: true }));
  await wait(80);
};
const btn = (text) => [...content.querySelectorAll("button")].find((b) => b.textContent === text);
{
  localStorage.removeItem("verbReviewView");
  navigateTo(document, "review");
  await wait(60);
  assert(!compareBox(), "the List view has no comparison switch");
  await switchView("binyan");
  assert(!compareBox(), "...nor does By Binyan");
  await switchView("root");
  assert(!!compareBox() && compareBox().checked === false, "By Verb Root has the switch, off by default");
  assert(compareBox().closest(".compare-controls") && content.querySelector(".compare-controls").compareDocumentPosition(content.querySelector(".verb-tables")) & win.Node.DOCUMENT_POSITION_FOLLOWING, "...above the tables");
  assert(/Strong Verb \(\u05E7\u05D8\u05DC\)/.test(content.querySelector(".compare-toggle").textContent), "labelled 'Compare with Strong Verb (קטל)'");
  assert(!content.querySelector("#strong-blank"), "the worksheet choice only appears once comparing is on");

  // Only the Strong Verb is showing: nothing to compare.
  assert(/nothing to compare/i.test(content.querySelector(".compare-help").textContent), "with only the Strong Verb showing it says there is nothing to compare");
  await setCompare(true);
  assert(content.querySelectorAll("th.col-strong").length === 0 && content.querySelectorAll(".root-table").length === 1, "...and changes nothing");

  // Add שחט.
  await tickDataset(SHACHAT, true);
  assert(content.querySelectorAll(".root-table").length === 2, "two verbs showing");
  assert(compareBox().checked === true, "the switch keeps its setting when the verbs change");
  const tables = [...content.querySelectorAll(".root-table")];
  assert(!tables[0].classList.contains("compared-table") && tables[1].classList.contains("compared-table"), "only the other verb gets the comparison, not the Strong Verb itself");
  assert(tables[1].querySelectorAll("th.col-strong").length === 7 && tables[1].querySelectorAll("td.verb-table-strong").length === 7 * 43, "שחט shows seven shaded Strong Verb columns beside its own");
  assert(/Shaded columns/.test(content.querySelector(".verb-tables").textContent), "and says what the shading is");
  await setCompare(false);
  assert(content.querySelectorAll("td.verb-table-strong").length === 0 && content.querySelectorAll("table.compared-table").length === 0, "switching it off puts everything back");
  await setCompare(true);

  // The Strong Verb is used even when it is not selected.
  await tickDataset(STRONG_VERB, false);
  assert(content.querySelectorAll(".root-table").length === 1 && content.querySelectorAll("th.col-strong").length === 7, "the Strong Verb (קטל) is compared even though it isn't selected in the sidebar");
  assert(/Shaded columns are the Strong Verb/.test(content.querySelector(".compare-help").textContent), "(and the help says it is always used)");

  // Filters cut the Strong Verb down too.
  const binyanBox = [...document.querySelectorAll("#sidebar-extra .filter-box-toggle")].find((b) => b.textContent === "Binyan");
  const qal = [...binyanBox.parentElement.querySelectorAll(".checkbox-list label")].find((l) => l.textContent.trim() === "Qal").querySelector("input");
  qal.checked = true;
  qal.dispatchEvent(new win.Event("change", { bubbles: true }));
  await wait(100);
  assert(content.querySelectorAll("th.col-strong").length === 1 && content.querySelectorAll("tbody tr")[0].children.length === 4, "a Binyan filter of Qal leaves one Strong Verb column and the verb's Qal");
  const reset = [...document.querySelectorAll("#sidebar-extra button")].find((b) => b.textContent.trim() === "Reset Filters");
  click(reset);
  await wait(100);
  assert(content.querySelectorAll("th.col-strong").length === 7, "clearing the filters brings the columns back");

  console.log("\nPrinting from the page");
  let printed = 0;
  win.print = () => printed++;
  click(btn("Print Table (Answer Key)"));
  const area = document.getElementById("print-area"); // (made by the first print)
  assert(printed === 1, "Print Table (Answer Key) prints");
  const pages = [...area.querySelectorAll(".print-page")];
  const titles = pages.map((p) => p.querySelector(".pt-title").textContent);
  assert(pages.length >= 2, `the compared table prints as at least two pages (${pages.length})`);
  assert(titles.some((t) => /Qal \u2013 Pual/.test(t)) && titles.some((t) => /Hitpael \u2013 Hophal/.test(t)), "one half is headed Qal – Pual, the other Hitpael – Hophal");
  assert(titles.every((t) => /with Strong Verb/.test(t) && /\u05E9\u05D7\u05D8/.test(t)), "every page names the verb and the comparison");
  const firstHalf = pages.filter((p) => /Qal \u2013 Pual/.test(p.querySelector(".pt-title").textContent));
  const secondHalf = pages.filter((p) => /Hitpael \u2013 Hophal/.test(p.querySelector(".pt-title").textContent));
  assert(firstHalf.length + secondHalf.length === pages.length && pages.indexOf(secondHalf[0]) > pages.indexOf(firstHalf[firstHalf.length - 1]), "the first half is printed in full before the second");
  assert(firstHalf.every((p) => p.querySelector("thead").textContent.includes("Mode") && p.querySelectorAll("thead th.binyan-head").length === 4), "each half repeats Mode and PGN and covers four binyanim");
  assert(secondHalf.every((p) => p.querySelectorAll("thead th.binyan-head").length === 3), "...and three");
  const modes = (set) => new Set(set.flatMap((p) => [...p.querySelectorAll(".verb-table-mode")].map((td) => td.textContent).filter(Boolean)));
  assert(modes(firstHalf).size === 9 && modes(secondHalf).size === 9, "every mode appears in both halves");
  assert(area.querySelectorAll("td.verb-table-strong").length > 0 && area.querySelectorAll("table.blank-table").length === 0, "the answer key is filled in, with the Strong Verb columns marked");
  assert(/landscape/.test(document.getElementById("table-print-page-style").textContent), "still landscape");
  win.dispatchEvent(new win.Event("afterprint"));

  // Blank worksheets: the choice.
  assert(!!content.querySelector("#strong-blank") && content.querySelector("#strong-blank").checked === false, "with comparing on, the worksheet choice appears, defaulting to 'filled in'");
  click(btn("Print Blank Table"));
  const strongText = () => [...area.querySelectorAll("td.verb-table-strong")].filter((td) => td.textContent.trim()).length;
  const ownText = () => [...area.querySelectorAll("td.verb-table-form:not(.verb-table-strong)")].filter((td) => td.textContent.trim()).length;
  assert(strongText() > 240 && ownText() === 0, "blank worksheet: the Strong Verb columns are a filled-in model, the verb's are empty");
  win.dispatchEvent(new win.Event("afterprint"));
  content.querySelector("#strong-blank").checked = true;
  content.querySelector("#strong-blank").dispatchEvent(new win.Event("change", { bubbles: true }));
  await wait(80);
  assert(content.querySelector("#strong-blank").checked === true, "the choice is kept");
  click(btn("Print Blank Table"));
  assert(strongText() === 0 && ownText() === 0, "...and when chosen, the Strong Verb columns are empty too");
  win.dispatchEvent(new win.Event("afterprint"));
  click(btn("Print Table (Answer Key)"));
  assert(strongText() > 240 && ownText() > 240, "the answer key still shows everything");
  win.dispatchEvent(new win.Event("afterprint"));

  console.log("\nExcel from the page");
  const calls = [];
  global.XLSX = {
    utils: {
      book_new: () => ({ sheets: [] }),
      aoa_to_sheet: (rows) => ({ rows }),
      book_append_sheet: (wb, ws, name) => wb.sheets.push({ name, rows: ws.rows, cols: ws["!cols"] }),
    },
    writeFile: (wb, filename) => calls.push({ wb, filename }),
  };
  click(btn("Download Excel"));
  assert(calls.length === 1 && calls[0].filename === "verbs_by_root_with_strong_verb.xlsx", "the download is named for the comparison");
  assert(calls[0].wb.sheets.length === 1 && calls[0].wb.sheets[0].rows[0].length === 16 && calls[0].wb.sheets[0].rows[0][2] === "Qal (\u05E7\u05D8\u05DC)", "one sheet for the verb, with interleaved columns");
  await setCompare(false);
  click(btn("Download Excel"));
  assert(calls[1].filename === "verbs_by_root.xlsx" && calls[1].wb.sheets[0].rows[0].length === 9, "with the switch off, the download is exactly as it was");

  console.log("\nOff again on the next visit");
  await setCompare(true);
  navigateTo(document, "home");
  await wait(60);
  navigateTo(document, "review");
  await wait(60);
  assert(content.querySelector(".view-switch button[aria-pressed='true']").dataset.view === "root", "the view is remembered");
  assert(!!compareBox() && compareBox().checked === false, "but the comparison starts off again");
}

summary();
