import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { readFileSync } from "node:fs";
import {
  PGN_ORDER, pgnOf, joinForms, groupRowsByVerb, binyanimFor, buildBinyanTables, buildRootTable, buildViewModel,
  binyanViewHtml, rootViewHtml, binyanSheetRows, rootSheetRows, sheetNameFor, exportSheets,
} from "../public/js/verb-tables.js";
import { printVerbTables, clearTablePrintStyle, prepareForPrint, paginate, PAGE_AREA } from "../public/js/print-tables.js";
import { rootTableHtml } from "../public/js/verb-tables.js";
import { loadVerbData } from "../public/js/data.js";

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const verbRows = (name) => loadVerbData([name]);
const STRONG = "Strong Verb (\u05E7\u05D8\u05DC)"; // Strong Verb (קטל)

// ----- Expected values copied from the example workbook (Example_Tables.xlsx) -----
// "Verbal Root Table Example": the Qal column, as [mode, PGN, form]; the mode is filled down here.
const EXAMPLE_ROOT_QAL = [
  ["Perfect", "3MS", "קָטַל"],
  ["Perfect", "3FS", "קָֽטְלָה"],
  ["Perfect", "2MS", "קָטַ֫לְתָּ"],
  ["Perfect", "2FS", "קָטַלְתְּ"],
  ["Perfect", "1CS", "קָטַ֫לְתִּי"],
  ["Perfect", "3CP", "קָֽטְלוּ"],
  ["Perfect", "2MP", "קְטַלְתֶּם"],
  ["Perfect", "2FP", "קְטַלְתֶּן"],
  ["Perfect", "1CP", "קָטַ֫לְנוּ"],
  ["Imperfect", "3MS", "יִקְטֹל"],
  ["Imperfect", "3FS", "תִּקְטֹל"],
  ["Imperfect", "2MS", "תִּקְטֹל"],
  ["Imperfect", "2FS", "תִּקְטְלִי/תִּקְטְלִין"],
  ["Imperfect", "1CS", "אֶקְטֹל"],
  ["Imperfect", "3MP", "יִקְטְלוּ/יִקְטְלוּן"],
  ["Imperfect", "3FP", "תִּקְטֹ֫לְנָה"],
  ["Imperfect", "2MP", "תִּקְטְלוּ/תִּקְטְלוּן"],
  ["Imperfect", "2FP", "תִּקְטֹ֫לְנָה"],
  ["Imperfect", "1CP", "נִקְטֹל"],
  ["Jussive", "3MS", "יִקְטֹל"],
  ["Jussive", "3FS", "תִּקְטֹל"],
  ["Jussive", "2MS", "תִּקְטֹל"],
  ["Jussive", "2FS", "תִּקְטְלִי"],
  ["Jussive", "3MP", "יִקְטְלוּ"],
  ["Jussive", "3FP", "תִּקְטֹ֫לְנָה"],
  ["Jussive", "2MP", "תִּקְטְלוּ"],
  ["Jussive", "2FP", "תִּקְטֹ֫לְנָה"],
  ["Cohortative", "1CS", "אֶקְטְלָה"],
  ["Cohortative", "1CP", "נִקְטְלָה"],
  ["Imperative", "2MS", "קְטֹל/קָטְלָה"],
  ["Imperative", "2FS", "קִטְלִי"],
  ["Imperative", "2MP", "קִטְלוּ"],
  ["Imperative", "2FP", "קְטֹ֫לְנָה"],
  ["Infinitive Absolute", "", "קָטוֹל"],
  ["Infinitive Construct", "", "קְטֹל"],
  ["Active Participle", "MS", "קֹטֵל"],
  ["Active Participle", "FS", "קֹֽטְלָה/קֹטֶ֫לֶת"],
  ["Active Participle", "MP", "קֹֽטְלִים"],
  ["Active Participle", "FP", "קֹֽטְלוֹת"],
  ["Passive Participle", "MS", "קָטוּל"],
  ["Passive Participle", "FS", "קְטוּלָה"],
  ["Passive Participle", "MP", "קְטוּלִים"],
  ["Passive Participle", "FP", "קְטוּלוֹת"],
];
// "Binyan Table Example": the two blocks that were filled in.
const EXAMPLE_BINYAN_BLOCKS = [
  {"binyan": "Qal", "mode": "Perfect", "rows": [["3MS", "קָטַל"], ["3FS", "קָֽטְלָה"], ["2MS", "קָטַ֫לְתָּ"], ["2FS", "קָטַלְתְּ"], ["1CS", "קָטַ֫לְתִּי"], ["3CP", "קָֽטְלוּ"], ["2MP", "קְטַלְתֶּם"], ["2FP", "קְטַלְתֶּן"], ["1CP", "קָטַ֫לְנוּ"]], "header": ["PNG", "Conjugation"]},
  {"binyan": "Qal", "mode": "Imperfect", "rows": [["3MS", "יִקְטֹל"], ["3FS", "תִּקְטֹל"], ["2MS", "תִּקְטֹל"], ["2FS", "תִּקְטְלִי/תִּקְטְלִין"], ["1CS", "אֶקְטֹל"], ["3MP", "יִקְטְלוּ/יִקְטְלוּן"], ["3FP", "תִּקְטֹ֫לְנָה"], ["2MP", "תִּקְטְלוּ/תִּקְטְלוּן"], ["2FP", "תִּקְטֹ֫לְנָה"], ["1CP", "נִקְטֹל"]], "header": ["PNG", "Conjugation"]},
];

// ======================================================================
console.log("Building the tables from the data");

assert(pgnOf({ Person: "2", Gender: "M", Number: "S" }) === "2MS", "PGN is person + gender + number written together");
assert(pgnOf({ Person: "", Gender: "F", Number: "P" }) === "FP", "participles have no person (FP)");
assert(pgnOf({ Person: "", Gender: "", Number: "" }) === "", "infinitives have no PGN at all");
assert(joinForms(["a", "b"]) === "a/b", "two forms for one PGN share a cell, separated by '/' (no spaces)");
assert(joinForms(["a", "a", "b"]) === "a/b", "an exact repeat is not listed twice");
assert(joinForms(["a", "", null, "b"]) === "a/b", "blank forms are ignored");
assert(joinForms([]) === "", "no forms gives an empty cell");
assert(PGN_ORDER.indexOf("3MS") < PGN_ORDER.indexOf("2MS") && PGN_ORDER.indexOf("1CP") < PGN_ORDER.indexOf("MS"), "PGNs are listed 3rd, 2nd, 1st person, then participles");

{
  // The By Binyan tables, checked against the two blocks in your example workbook.
  const model = buildBinyanTables(STRONG, verbRows(STRONG));
  assert(model.map((b) => b.binyan).join() === "Qal,Niphal,Piel,Pual,Hitpael,Hiphil,Hophal", "binyanim run Qal to Hophal");
  const qal = model[0];
  assert(qal.tables.map((t) => t.mode).join() === "Perfect,Imperfect,Jussive,Cohortative,Imperative,Infinitive Absolute,Infinitive Construct,Active Participle,Passive Participle", "a table for each mode, in the usual order");
  for (const block of EXAMPLE_BINYAN_BLOCKS) {
    const table = qal.tables.find((t) => t.mode === block.mode);
    const got = table.rows.map((r) => [r.pgn, r.forms]);
    assert(JSON.stringify(got) === JSON.stringify(block.rows), `Qal ${block.mode} matches your example sheet row for row (${got.length} rows)`);
  }
  const pual = model.find((b) => b.binyan === "Pual");
  assert(!pual.tables.some((t) => t.mode === "Imperative"), "a binyan has no table for a mode it has no forms in");
  const infinitive = qal.tables.find((t) => t.mode === "Infinitive Absolute");
  assert(infinitive.rows.length === 1 && infinitive.rows[0].pgn === "", "an infinitive is a one-row table with a blank PGN");
}

{
  // The By Verb Root table, checked against the Qal column of your example workbook.
  const root = buildRootTable(STRONG, verbRows(STRONG));
  assert(root.binyanim.join() === "Qal,Niphal,Piel,Pual,Hitpael,Hiphil,Hophal", "a column for each binyan");
  const flat = root.groups.flatMap((g) => g.rows.map((r) => [g.mode, r.pgn, r.cells[0]]));
  assert(flat.length === 43, "43 rows in all, as in your example");
  assert(JSON.stringify(flat) === JSON.stringify(EXAMPLE_ROOT_QAL), "the Qal column matches your example sheet in every one of its 43 rows (mode, PGN, form)");
  const imperfect = root.groups.find((g) => g.mode === "Imperfect");
  const twoForms = imperfect.rows.find((r) => r.pgn === "2FS").cells[0];
  assert(twoForms.split("/").length === 2, `forms sharing a PGN are joined in one cell (${twoForms})`);
  const pualCol = root.binyanim.indexOf("Pual");
  const impv = root.groups.find((g) => g.mode === "Imperative");
  assert(impv.rows.every((r) => r.cells[pualCol] === ""), "a binyan with no form for a row leaves that cell blank");
}

{
  // Verbs that don't have every binyan only get the columns they have.
  const stative = buildRootTable("Stative Verb (\u05DB\u05D1\u05D3)", verbRows("Stative Verb (\u05DB\u05D1\u05D3)"));
  assert(stative.binyanim.join() === "Qal", "a Qal-only verb has just a Qal column");
  const polelName = [...new Set(loadVerbData(["II-Yod Vav (\u05E7\u05D5\u05DD)"]).map((r) => r.Dataset))][0];
  assert(binyanimFor(polelName, verbRows(polelName)).join() === "Qal,Niphal,Polel,Polal,Hitpolel,Hiphil,Hophal", "a Polel verb lists Polel/Polal/Hitpolel in place of Piel/Pual/Hitpael");
}

{
  // Several verbs, and the filtered rows the page passes in.
  const rows = loadVerbData([STRONG, "Stative Verb (\u05DB\u05D1\u05D3)"]);
  assert(groupRowsByVerb(rows).map((g) => g.name).join("|") === `${STRONG}|Stative Verb (\u05DB\u05D1\u05D3)`, "rows are grouped one verb at a time, in selection order");
  const m = buildViewModel("root", rows);
  assert(m.length === 2 && m[0].root && m[1].root, "one table model per verb");
  const onlyPerfect = rows.filter((r) => r.Mode === "Perfect" && r.Binyan === "Qal");
  const filtered = buildRootTable(STRONG, onlyPerfect.filter((r) => r.Dataset === STRONG));
  assert(filtered.binyanim.join() === "Qal" && filtered.groups.length === 1, "filtering leaves only the matching columns and rows");
}

// ======================================================================
console.log("\nThe table HTML");

{
  const verbs = buildViewModel("binyan", verbRows(STRONG));
  const html = binyanViewHtml(verbs);
  const box = document.createElement("div");
  box.innerHTML = html;
  assert(box.querySelectorAll(".verb-tables-title").length === 1 && box.querySelector(".verb-tables-title").textContent === STRONG, "the verb is named in a heading");
  assert(box.querySelector("caption").textContent === "Qal Perfect", "each table is titled like your sample (\"Qal Perfect\")");
  assert([...box.querySelectorAll("thead")[0].querySelectorAll("th")].map((t) => t.textContent).join() === "PGN,Conjugation", "columns are PGN and Conjugation (not 'PNG')");
  assert(box.querySelectorAll(".binyan-table").length === 51, "51 binyan/mode tables for the strong verb");
  assert(!/killed|he |she /i.test(box.textContent), "no English translations in the tables");
  const slashCell = [...box.querySelectorAll("td.verb-table-form")].find((td) => td.textContent.includes("/"));
  assert(slashCell && slashCell.querySelectorAll("span").length === 1 && slashCell.querySelector("span").getAttribute("dir") === "rtl", "a cell with two forms is ONE right-to-left run, so the first form sits on the right as in Excel");
  assert(slashCell.innerHTML.includes("/<wbr>"), "...and may wrap after the '/'");
  assert(slashCell.textContent.split("/").length === 2 && !/\s/.test(slashCell.textContent), "...but copies as plain 'a/b'");
}

{
  const verbs = buildViewModel("root", loadVerbData([STRONG]));
  const box = document.createElement("div");
  box.innerHTML = rootViewHtml(verbs);
  const table = box.querySelector(".root-table");
  assert([...table.querySelectorAll("thead th")].map((t) => t.textContent).join() === "Mode,PGN,Qal,Niphal,Piel,Pual,Hitpael,Hiphil,Hophal", "header: Mode, PGN, then a column per binyan");
  const modes = [...table.querySelectorAll("tbody tr")].map((r) => r.children[0].textContent);
  assert(modes[0] === "Perfect" && modes[1] === "" && modes[8] === "" && modes[9] === "Imperfect", "the mode is named only on the first row of its group");
  assert(table.querySelectorAll("tbody tr.group-start").length === 9, "each group's first row is marked (for the heavier dividing line)");
  assert(table.querySelectorAll("tbody tr").length === 43, "43 rows");
}

{
  // The verb's name comes from data, but is still escaped.
  const verbs = [{ name: "<img src=x onerror=alert(1)>", root: { binyanim: ["Qal"], groups: [{ mode: "Perfect", rows: [{ pgn: "3MS", cells: ["<b>x</b>"] }] }] } }];
  const box = document.createElement("div");
  box.innerHTML = rootViewHtml(verbs);
  assert(!box.querySelector("img") && !box.querySelector("b"), "text from the data can't inject markup");
}

// ======================================================================
console.log("\nThe Excel layout");

{
  const binyanim = buildBinyanTables(STRONG, verbRows(STRONG));
  const rows = binyanSheetRows(binyanim);
  assert(rows[0].join("|") === "Qal|Perfect" && rows[1].join("|") === "PGN|Conjugation", "each block starts [binyan, mode] then [PGN, Conjugation], as in your sample");
  assert(rows[2][0] === "3MS" && rows[11].length === 0, "then a row per PGN, then a blank row before the next block");
  for (const block of EXAMPLE_BINYAN_BLOCKS) {
    const start = rows.findIndex((r) => r[0] === block.binyan && r[1] === block.mode);
    const got = [];
    for (let i = start + 2; rows[i] && rows[i].length; i++) got.push(rows[i]);
    assert(JSON.stringify(got) === JSON.stringify(block.rows), `the Excel rows for Qal ${block.mode} equal your sample's`);
  }

  const sheet = rootSheetRows(buildRootTable(STRONG, verbRows(STRONG)));
  assert(sheet[0].join("|") === "Mode|PGN|Qal|Niphal|Piel|Pual|Hitpael|Hiphil|Hophal", "root sheet header row matches your sample");
  assert(sheet[1][0] === "Perfect" && sheet[2][0] === "" && sheet.length === 44, "the mode is on a group's first row only, 43 rows below the header");
  const filledDown = [];
  let mode = "";
  for (const r of sheet.slice(1)) {
    if (r[0]) mode = r[0];
    filledDown.push([mode, r[1], r[2]]);
  }
  assert(JSON.stringify(filledDown) === JSON.stringify(EXAMPLE_ROOT_QAL), "the Mode, PGN and Qal columns equal your sample in all 43 rows");
}

{
  const used = new Set();
  assert(sheetNameFor("Strong Verb (\u05E7\u05D8\u05DC)", used) === "Strong Verb (\u05E7\u05D8\u05DC)", "a verb's name makes a fine sheet name");
  assert(sheetNameFor("Strong Verb (\u05E7\u05D8\u05DC)", used) === "Strong Verb (\u05E7\u05D8\u05DC) (2)", "duplicate sheet names are made unique");
  assert(sheetNameFor("a/b:c*d?[e]\\f", new Set()) === "a-b-c-d--e--f", "characters Excel forbids in sheet names are replaced");
  assert(sheetNameFor("x".repeat(50), new Set()).length === 31, "names are cut to Excel's 31-character limit");
  const sheets = exportSheets("root", buildViewModel("root", loadVerbData([STRONG, "Stative Verb (\u05DB\u05D1\u05D3)"])));
  assert(sheets.length === 2 && sheets[1].rows[0].join("|") === "Mode|PGN|Qal", "one sheet per verb, each with only its own columns");
}

// ======================================================================
console.log("\nPutting whole modes on pages");

{
  assert(JSON.stringify(paginate([100, 100, 100], 250)) === "[[0,1],[2]]", "blocks fill a page, then continue on the next");
  assert(JSON.stringify(paginate([100, 160, 100], 250)) === "[[0],[1],[2]]", "a block that doesn't fit the room left moves to the next page whole (never split)");
  assert(JSON.stringify(paginate([300, 50], 250)) === "[[0],[1]]", "a block taller than a page still gets a page of its own");
  assert(JSON.stringify(paginate([], 250)) === "[]", "nothing to print gives no pages");
  assert(JSON.stringify(paginate([0, 0, 0], 10)) === "[[0,1,2]]", "when nothing can be measured, everything stays together");
  // A strong verb's modes, at 26px a row: Perfect 9, Imperfect 10, Jussive 8, Cohortative 2, Imperative 4, Infinitives 1+1, Participles 4+4
  const rows = [9, 10, 8, 2, 4, 1, 1, 4, 4].map((n) => n * 26);
  const pages = paginate(rows, PAGE_AREA.root.height - 60);
  assert(pages[0].join() === "0,1" && pages[1][0] === 2, "Jussive starts a page rather than being split across two");
  assert(pages.flat().join() === "0,1,2,3,4,5,6,7,8", "every mode is placed exactly once, in order");
  assert(PAGE_AREA.root.width > PAGE_AREA.root.height && PAGE_AREA.binyan.height > PAGE_AREA.binyan.width, "the By Verb Root pages are landscape and the By Binyan pages portrait");
}

// ======================================================================
console.log("\nBlank practice worksheets");

{
  const root = buildRootTable(STRONG, verbRows(STRONG));
  const box = document.createElement("div");
  box.innerHTML = rootTableHtml(root, { blank: true, printLayout: true });
  const cells = [...box.querySelectorAll("td.verb-table-form")];
  assert(cells.length === 43 * 7, "a cell for every row of every binyan");
  assert(cells.every((td) => td.textContent === ""), "no answers are printed");
  const crossed = box.querySelectorAll("td.verb-table-unused");
  assert(crossed.length === 52, `the 52 cells this verb doesn't use are marked to be crossed out (${crossed.length})`);
  assert([...crossed].every((td) => td.querySelector("svg.crossed-out line")), "...each with a diagonal line (drawn as SVG, so it prints without 'background graphics')");
  assert(box.querySelectorAll("td.verb-table-blank").length === cells.length - 52, "every other cell is an empty box to write in");
  const pualImperative = [...box.querySelectorAll("tbody.mode-group")].find((g) => g.querySelector(".verb-table-mode").textContent === "Imperative");
  const pualCol = root.binyanim.indexOf("Pual") + 2;
  assert([...pualImperative.querySelectorAll("tr")].every((tr) => tr.children[pualCol].classList.contains("verb-table-unused")), "e.g. every Pual Imperative cell is crossed out");
  const qalCol = root.binyanim.indexOf("Qal") + 2;
  assert([...pualImperative.querySelectorAll("tr")].every((tr) => tr.children[qalCol].classList.contains("verb-table-blank")), "...while the Qal Imperative cells are left to fill in");
  assert(box.querySelector("table").classList.contains("blank-table") && box.querySelector("table").classList.contains("print-root"), "the table is marked as a blank worksheet");
  assert(box.querySelectorAll("tbody.mode-group").length === 9, "each mode is its own block, so it can be placed on a page whole");
  assert(box.querySelector("colgroup") && /width:100%/.test(box.querySelector("table").getAttribute("style")), "a seven-binyan table uses the full page width, with fixed columns");
  const qalOnly = document.createElement("div");
  qalOnly.innerHTML = rootTableHtml(buildRootTable("Stative Verb (\u05DB\u05D1\u05D3)", verbRows("Stative Verb (\u05DB\u05D1\u05D3)")), { blank: true, printLayout: true });
  assert(parseFloat(qalOnly.querySelector("table").getAttribute("style").match(/width:([\d.]+)%/)[1]) < 40, "a Qal-only verb gets a narrow table rather than one stretched across the page");
  const filled = document.createElement("div");
  filled.innerHTML = rootTableHtml(root, { printLayout: true });
  assert(filled.querySelectorAll("td.verb-table-unused").length === 0 && filled.textContent.includes("\u05E7\u05B8\u05D8\u05B7\u05DC"), "the filled table (the answer key) still shows the forms and has no cross-out lines");
}

// ======================================================================
console.log("\nThe Verb Review page");

{
  const switchView = async (key) => {
    click(content.querySelector(`.view-switch button[data-view="${key}"]`));
    await wait(20);
  };
  localStorage.removeItem("verbReviewView");
  navigateTo(document, "review");
  await wait(30);
  const labels = () => [...content.querySelectorAll(".view-switch button")].map((b) => b.textContent).join("|");
  assert(labels() === "List|By Binyan|By Verb Root", "three views to choose from");
  assert(content.querySelector('.view-switch button[aria-pressed="true"]').dataset.view === "list", "opens on the List view");
  assert(!!content.querySelector("table.custom-table"), "the List view still shows its table");
  assert([...content.querySelectorAll("button")].some((b) => b.textContent === "Print Flashcards"), "...and its CSV / Excel / Print Flashcards buttons");

  await switchView("binyan");
  assert(content.querySelectorAll(".binyan-table").length === 51 && !content.querySelector("table.custom-table"), "By Binyan shows the small tables instead of the list");
  assert(localStorage.getItem("verbReviewView") === "binyan", "the choice is remembered");
  assert(![...document.querySelectorAll("#sidebar-extra h3")].some((h) => h.textContent.includes("Visible Columns")), "'Visible Columns' only appears for the List view");

  await switchView("root");
  assert(content.querySelectorAll(".root-table").length === 1, "By Verb Root shows one table per verb");

  // Excel download: capture what's handed to the spreadsheet library.
  const calls = [];
  global.XLSX = {
    utils: {
      book_new: () => ({ sheets: [] }),
      aoa_to_sheet: (rows) => ({ rows }),
      book_append_sheet: (wb, ws, name) => wb.sheets.push({ name, rows: ws.rows, cols: ws["!cols"] }),
    },
    writeFile: (wb, filename) => calls.push({ wb, filename }),
  };
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Download Excel"));
  assert(calls.length === 1 && calls[0].filename === "verbs_by_root.xlsx", "Download Excel saves verbs_by_root.xlsx");
  assert(calls[0].wb.sheets.length === 1 && calls[0].wb.sheets[0].rows[0][0] === "Mode", "...with a sheet laid out like your sample");
  await switchView("binyan");
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Download Excel"));
  assert(calls[1].filename === "verbs_by_binyan.xlsx" && calls[1].wb.sheets[0].rows[0].join("|") === "Qal|Perfect", "in By Binyan it saves verbs_by_binyan.xlsx laid out in blocks");

  // Print Tables
  let printed = 0;
  window.print = () => printed++;
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Print Table (Answer Key)"));
  const area = document.getElementById("print-area");
  assert(printed === 1 && area.querySelectorAll(".binyan-table").length === 51, "Print Table (Answer Key) prints the tables");
  assert(/size:\s*portrait/.test(document.getElementById("table-print-page-style").textContent), "By Binyan asks for a portrait page");
  assert(!/margin/.test(document.getElementById("table-print-page-style").textContent), "...and leaves the margin alone (the stylesheet's zero margin is what keeps the browser's date/title/address off)");
  window.dispatchEvent(new window.Event("afterprint"));
  assert(!document.getElementById("table-print-page-style"), "and puts the page setup back when printing is done");
  await switchView("root");
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Print Table (Answer Key)"));
  assert(/landscape/.test(document.getElementById("table-print-page-style").textContent), "the wide By Verb Root table asks for a landscape page");
  clearTablePrintStyle();
  assert(!document.getElementById("table-print-page-style"), "the page setup can always be cleared");

  // Print Blank Tables
  const buttonLabels = () => [...content.querySelectorAll(".button-row button")].map((b) => b.textContent).join("|");
  assert(buttonLabels() === "Print Blank Table|Print Table (Answer Key)|Download Excel", "the table views have Print Table (blank and answer key) above Download Excel");
  printed = 0;
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Print Blank Table"));
  assert(printed === 1 && area.querySelectorAll("table.blank-table").length > 0, "Print Blank Table prints the blank worksheets");
  assert(area.querySelectorAll("td.verb-table-unused").length === 52, "...with the unused cells marked to be crossed out");
  assert(![...area.querySelectorAll("td.verb-table-form")].some((td) => td.textContent.trim()), "...and no answers");
  assert(area.querySelectorAll(".print-page").length >= 1 && [...area.querySelectorAll(".print-page")].every((pg) => pg.querySelector(".pt-title")), "every page carries the verb's title");
  assert(area.querySelectorAll(".print-page-last").length === 1 && area.lastElementChild.lastElementChild.classList.contains("print-page-last"), "only the last page lacks a page break after it");
  await switchView("binyan");
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Print Blank Table"));
  assert(area.querySelectorAll("table.binyan-table.blank-table").length === 51 && area.querySelectorAll("td.verb-table-unused").length === 0, "By Binyan blanks: every table empty, nothing crossed out (every row there is used)");
  const expectedRows = buildBinyanTables(STRONG, verbRows(STRONG)).reduce((n, b) => n + Math.ceil(b.tables.length / 3), 0);
  assert(area.querySelectorAll(".pt-row").length === expectedRows && [...area.querySelectorAll(".pt-row")].every((r) => r.children.length <= 3), `...laid out three tables to a row (${expectedRows} rows)`);
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Print Table (Answer Key)"));
  assert(area.querySelectorAll("table.blank-table").length === 0 && area.textContent.includes("\u05E7\u05B8\u05D8\u05B7\u05DC"), "Print Table (Answer Key) still prints the filled answer key");

  // Closing the sign-in widget before printing (its frame carries a Netlify logo)
  let closed = 0;
  const savedIdentity = window.netlifyIdentity;
  window.netlifyIdentity = { close: () => closed++ };
  prepareForPrint();
  assert(closed === 1, "printing closes the sign-in widget first");
  window.netlifyIdentity = { close: () => { throw new Error("boom"); } };
  let threw = false;
  try { prepareForPrint(); } catch (e) { threw = true; }
  assert(!threw, "...and a widget that misbehaves can't stop printing");
  window.netlifyIdentity = undefined;
  prepareForPrint();
  assert(true, "...and it copes with there being no widget at all");
  window.netlifyIdentity = savedIdentity;
  await switchView("root");

  // Filters narrow the tables.
  const ticks = (title) => {
    const box = [...content.ownerDocument.querySelectorAll("#sidebar-extra .sidebar-label")].find((l) => l.textContent.trim() === title);
    return box.nextElementSibling.nextElementSibling;
  };
  const binyanFilter = ticks("Binyan");
  binyanFilter.querySelectorAll("input")[0].click();
  await wait(20);
  assert([...content.querySelectorAll(".root-table thead th")].map((t) => t.textContent).join() === "Mode,PGN,Qal", "ticking Qal in the sidebar leaves just the Qal column");
  await switchView("list");
  assert(!!content.querySelector("table.custom-table"), "and the List view comes back");
}

// The stylesheet: what the printed pages depend on (jsdom can't lay anything out, so this is checked in the CSS itself)
{
  const css = readFileSync(new URL("../public/css/style.css", import.meta.url), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert(/@page\s*\{[^}]*margin:\s*0/.test(css), "@page margin is zero, so the browser prints no date, page title, address or page numbers");
  assert(/body\s*>\s*\*:not\(#print-area\)\s*\{[^}]*display:\s*none\s*!important/.test(css), "when printing, everything on the page except the print area is hidden (pop-ups, the sign-in widget's frame, any overlay)");
  assert(/#print-area \.verb-tables-print \.print-page\s*\{[^}]*padding:\s*0\.5in/.test(css), "each printed page supplies its own 0.5in margin");
  assert(!/@media print\s*\{[^@]*#print-area \.pt-block/.test(css), "the table print rules aren't print-only (the measuring copy needs them too)");
  assert(/vector-effect:\s*non-scaling-stroke/.test(css) && /\.crossed-out\b/.test(css), "the cross-out line is styled as an SVG stroke");
}

summary();
