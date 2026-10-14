// Prints a Review table (the chosen rows and columns) as a worksheet or an
// answer key. This is the generic version of what the Consonants and Vowels
// Review pages first did, now used by every Review page.
//
// It follows the Verb tables' approach (print-tables.js): the hidden
// #print-area, the stylesheet's `@page { margin: 0 }` (which keeps the browser
// from adding its own date, title, address and page numbers), and 0.5in of
// padding the app supplies on every page itself. Because it decides where
// pages break, it measures each row in a hidden copy of the table and packs
// whole rows onto pages — so a row that wraps onto two lines never gets cut,
// and the column headings repeat on every page.

import { prepareForPrint, clearTablePrintStyle, PAGE_STYLE_ID, PAGE_AREA, paginate } from "./print-tables.js";
import { wrapHebrewSpans } from "./helpers.js";

/** More columns than this are laid out on a landscape page. */
const MAX_PORTRAIT_COLUMNS = 6;

const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function outerHeight(el) {
  const style = window.getComputedStyle(el);
  return el.offsetHeight + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
}

/** Lays `html` out off-screen at `width` px, lets `measure` read it, then hides it again. */
function measureIn(printArea, width, html, measure) {
  const original = printArea.getAttribute("style");
  printArea.style.cssText = `display:block;position:fixed;left:-100000px;top:0;visibility:hidden;width:${width}px;`;
  try {
    printArea.innerHTML = `<div class="letter-print"><div class="print-measure" style="width:${width}px">${html}</div></div>`;
    return measure(printArea.querySelector(".print-measure"));
  } finally {
    if (original === null) printArea.removeAttribute("style");
    else printArea.setAttribute("style", original);
  }
}

/**
 * `rows`          the rows to print (already filtered / sampled / ordered)
 * `columns`       the column keys to print, in order
 * `labels`        { column: heading }
 * `hebrewColumns` columns that hold Hebrew (bigger Hebrew type, centred)
 * `weights`       { column: relative width } — default 1
 * `given`         the column whose answers are filled in on a worksheet;
 *                 "none" leaves every cell blank, "all" fills everything in
 *                 (the answer key)
 */
export function printDataTable({ title, rows, columns, labels = {}, hebrewColumns = [], weights = {}, given = "all" }) {
  let printArea = document.getElementById("print-area");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "print-area";
    document.body.appendChild(printArea);
  }
  prepareForPrint();

  const landscape = columns.length > MAX_PORTRAIT_COLUMNS;
  const area = landscape ? PAGE_AREA.root : PAGE_AREA.binyan;
  const kind = given === "all" ? "Answer Key" : "Practice Worksheet";

  const totalWeight = columns.reduce((s, c) => s + (weights[c] ?? 1), 0);
  const colgroup = `<colgroup>${columns
    .map((c) => `<col style="width:${(((weights[c] ?? 1) / totalWeight) * 100).toFixed(2)}%">`)
    .join("")}</colgroup>`;
  const head = `<tr>${columns.map((c) => `<th>${escapeHtml(labels[c] || c)}</th>`).join("")}</tr>`;
  const rowHtml = (r) =>
    `<tr>${columns
      .map((c) => {
        if (!(given === "all" || given === c)) return `<td class="letter-print-blank"></td>`;
        const v = r[c] ?? "";
        return hebrewColumns.includes(c)
          ? `<td class="letter-print-hebrew">${wrapHebrewSpans(v)}</td>`
          : `<td>${wrapHebrewSpans(v)}</td>`;
      })
      .join("")}</tr>`;
  const titleHtml = (continued) =>
    `<div class="letter-print-title">${escapeHtml(title)} — ${kind}${continued ? " (continued)" : ""}</div>`;
  const tableHtml = (bodyRows) =>
    `<table class="letter-print-table">${colgroup}<thead>${head}</thead><tbody>${bodyRows.join("")}</tbody></table>`;

  const bodyRows = rows.map(rowHtml);

  // Measure the title, the heading row and every row, then pack whole rows onto pages.
  const sizes = measureIn(printArea, area.width, titleHtml(false) + tableHtml(bodyRows), (box) => ({
    title: outerHeight(box.querySelector(".letter-print-title")),
    head: box.querySelector("thead").offsetHeight,
    rows: [...box.querySelectorAll("tbody tr")].map((tr) => tr.offsetHeight),
  }));
  const pageIdx = paginate(sizes.rows, area.height - sizes.title - sizes.head - 3);
  if (pageIdx.length === 0) pageIdx.push([]);

  const html = pageIdx
    .map((idx, n) => {
      const isLast = n === pageIdx.length - 1;
      return (
        `<div class="print-page${isLast ? " print-page-last" : ""}">` +
        titleHtml(n > 0) +
        tableHtml(idx.map((i) => bodyRows[i])) +
        `</div>`
      );
    })
    .join("");
  printArea.innerHTML = `<div class="letter-print">${html}</div>`;

  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = `@page { size: ${landscape ? "landscape" : "portrait"}; }`;
  document.head.appendChild(style);

  const cleanUp = () => {
    clearTablePrintStyle();
    window.removeEventListener("afterprint", cleanUp);
  };
  window.addEventListener("afterprint", cleanUp);

  window.print();
}
