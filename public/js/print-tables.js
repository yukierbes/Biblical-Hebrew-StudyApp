// Prints the Verb Review table views (the "Print Tables" button).
//
// This reuses the same hidden #print-area the flashcards print from. The one
// difference is page margins: flashcards print with `@page { margin: 0 }` (so
// the browser adds no date/URL/page-number text — see style.css), which would
// run a long table right up to the paper's edge on every page after the first.
// So a table printout temporarily asks for ordinary 0.5in margins instead, and
// puts things back as soon as printing is done.

import { viewHtml } from "./verb-tables.js";

const PAGE_STYLE_ID = "table-print-page-style";

/** Removes the temporary page setup (also called before a flashcard print, as a safeguard). */
export function clearTablePrintStyle() {
  const el = document.getElementById(PAGE_STYLE_ID);
  if (el) el.remove();
}

export function printVerbTables(view, verbs) {
  let printArea = document.getElementById("print-area");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "print-area";
    document.body.appendChild(printArea);
  }

  clearTablePrintStyle();
  printArea.innerHTML = `<div class="verb-tables verb-tables-print verb-tables-print-${view}">${viewHtml(view, verbs)}</div>`;

  // The By Verb Root table can have a column for each of seven binyanim, so it
  // asks for a landscape page; the By Binyan tables suit the default.
  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = `@page { margin: 0.5in; ${view === "root" ? "size: landscape;" : ""} }`;
  document.head.appendChild(style);

  const cleanUp = () => {
    clearTablePrintStyle();
    window.removeEventListener("afterprint", cleanUp);
  };
  window.addEventListener("afterprint", cleanUp);

  window.print();
}
