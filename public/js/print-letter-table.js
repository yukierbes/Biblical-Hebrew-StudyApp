// Prints the Consonants / Vowels Review table, either filled in (an answer
// key) or as a blank practice worksheet.
//
// Same approach as the Verb tables (print-tables.js): it uses the hidden
// #print-area, the stylesheet's `@page { margin: 0 }` (which is what keeps the
// browser from adding its own date, title, address and page numbers) and its
// own 0.5in of padding on every page. Because every row here is the same
// fixed height, pages are simply filled with a set number of rows.

import { prepareForPrint, clearTablePrintStyle, PAGE_STYLE_ID } from "./print-tables.js";
import { wrapHebrewSpans } from "./helpers.js";

// Rows per page: the room inside the margins on the SMALLER of US Letter and
// A4 (portrait: 10in tall on Letter) holds comfortably more than this many
// 36px rows after the title and the header row, so one layout fits both
// papers (on A4 there is simply more white space at the bottom).
const ROWS_PER_PAGE = 18;

/**
 * `given` says which column is filled in on a practice worksheet:
 *   a column key (e.g. "Form" or "Name") -> only that column has its answers;
 *   "none" -> every cell is blank (just the column headings and the lines);
 *   "all"  -> nothing is blank (the answer key).
 */
export function printLetterTable(set, rows, { given = "all" } = {}) {
  let printArea = document.getElementById("print-area");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "print-area";
    document.body.appendChild(printArea);
  }
  prepareForPrint();

  const columns = set.columns;
  const label = (c) => set.columnLabels[c] || c;
  const isHebrew = (c) => set.hebrewColumns.includes(c);

  const head = `<tr>${columns.map((c) => `<th>${label(c)}</th>`).join("")}</tr>`;
  const rowHtml = (r) =>
    `<tr>${columns
      .map((c) => {
        const show = given === "all" || given === c;
        if (!show) return `<td class="letter-print-blank"></td>`;
        const v = r[c] ?? "";
        return isHebrew(c)
          ? `<td class="letter-print-hebrew">${wrapHebrewSpans(v)}</td>`
          : `<td>${String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
      })
      .join("")}</tr>`;

  const kind = given === "all" ? "Answer Key" : "Practice Worksheet";
  const pages = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  const html = pages
    .map((pageRows, idx) => {
      const isLast = idx === pages.length - 1;
      const cont = idx > 0 ? " (continued)" : "";
      return (
        `<div class="print-page${isLast ? " print-page-last" : ""}">` +
        `<div class="letter-print-title">${set.title} — ${kind}${cont}</div>` +
        `<table class="letter-print-table"><thead>${head}</thead><tbody>${pageRows.map(rowHtml).join("")}</tbody></table>` +
        `</div>`
      );
    })
    .join("");

  printArea.innerHTML = `<div class="letter-print">${html}</div>`;

  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = "@page { size: portrait; }";
  document.head.appendChild(style);

  const cleanUp = () => {
    clearTablePrintStyle();
    window.removeEventListener("afterprint", cleanUp);
  };
  window.addEventListener("afterprint", cleanUp);

  window.print();
}
