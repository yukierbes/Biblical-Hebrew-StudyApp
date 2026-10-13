// Prints the Verb Review table views ("Print Tables" and "Print Blank Tables").
//
// This uses the same hidden #print-area the flashcards print from, and works the
// same way: the page is printed with NO browser margin (`@page { margin: 0 }`
// in style.css), which is what stops the browser adding its own date, page
// title, web address and page numbers. With no margin, the printout has to
// supply its own 0.5in of white space around the content on EVERY page — so
// instead of letting the browser flow one long table across pages, this builds
// each physical page itself.
//
// That also means it decides where pages break, so a whole mode (all of the
// Jussive rows, say) is never cut in half by a page boundary: it measures each
// mode / row of small tables in a hidden copy of the layout, then packs whole
// ones onto pages.

import { binyanTableHtml, rootTableHtml, verbNameHtml, escapeHtml } from "./verb-tables.js";

export const PAGE_STYLE_ID = "table-print-page-style";

// The room (in CSS pixels) inside the 0.5in page margins. It is worked out for
// the SMALLER of US Letter and A4 in each direction, less a few pixels to spare:
// a layout that fits that fits both, and on bigger paper there's just more white
// space at the bottom.
//   root   — landscape: width 11in (Letter), height 8.27in (A4)  -> 10in  x 7.27in
//   binyan — portrait:  width 8.27in (A4),   height 11in (Letter) -> 7.27in x 10in
export const PAGE_AREA = {
  root: { width: 960, height: 690 },
  binyan: { width: 698, height: 952 },
};

const TABLES_PER_ROW = 3;

/** Removes the temporary page setup (also called before a flashcard print, as a safeguard). */
export function clearTablePrintStyle() {
  const el = document.getElementById(PAGE_STYLE_ID);
  if (el) el.remove();
}

/**
 * Gets the page ready to print (flashcards and tables both call this): drops any
 * page setup left over from an earlier table printout, and closes the sign-in
 * widget's pop-up. That pop-up is a full-screen frame carrying a Netlify logo, and
 * a frame that is showing can't be hidden from the stylesheet (the widget switches
 * it on with an inline `display: block !important`) — so it is closed properly.
 * Closing it when it's already closed does nothing.
 */
export function prepareForPrint() {
  clearTablePrintStyle();
  try {
    if (window.netlifyIdentity && typeof window.netlifyIdentity.close === "function") window.netlifyIdentity.close();
  } catch (e) {
    /* nothing to close */
  }
}

/**
 * Packs blocks onto pages, in order, without ever splitting one. `heights` are
 * the blocks' heights; `capacity` is how much fits on a page. A block that is
 * taller than a whole page still gets a page to itself (nothing else can be done).
 * Returns the pages as lists of block positions: [[0, 1, 2], [3, 4], ...].
 */
export function paginate(heights, capacity) {
  const pages = [];
  let page = [];
  let used = 0;
  heights.forEach((h, i) => {
    if (page.length > 0 && used + h > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(i);
    used += h;
  });
  if (page.length > 0) pages.push(page);
  return pages;
}

/** Height including top and bottom margins (offsetHeight alone leaves those out). */
function outerHeight(el) {
  const style = window.getComputedStyle(el);
  return el.offsetHeight + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
}

/**
 * Briefly lays `html` out in the (normally hidden) print area, off-screen and at
 * `width` px wide, lets `measure` read what it needs, then hides it again.
 */
function measureIn(printArea, width, html, measure) {
  const original = printArea.getAttribute("style");
  printArea.style.cssText = `display:block;position:fixed;left:-100000px;top:0;visibility:hidden;width:${width}px;`;
  try {
    printArea.innerHTML = `<div class="verb-tables verb-tables-print"><div class="print-measure" style="width:${width}px">${html}</div></div>`;
    return measure(printArea.querySelector(".print-measure"));
  } finally {
    if (original === null) printArea.removeAttribute("style");
    else printArea.setAttribute("style", original);
  }
}

const titleHtml = (name, continued) =>
  `<div class="pt-title">${verbNameHtml(name)}${continued ? '<span class="pt-continued">(continued)</span>' : ""}</div>`;

const pageHtml = (inner, isLast) => `<div class="print-page${isLast ? " print-page-last" : ""}">${inner}</div>`;

/** By Verb Root: each verb's table, split into pages between modes. Returns one string per page. */
function rootPages(printArea, verbs, blank) {
  const { width, height } = PAGE_AREA.root;
  const pages = [];
  for (const { name, root } of verbs) {
    // Measure the whole table once: the title, the column titles, and each mode on its own.
    const sizes = measureIn(printArea, width, titleHtml(name, false) + rootTableHtml(root, { blank, printLayout: true }), (box) => ({
      title: outerHeight(box.querySelector(".pt-title")),
      head: box.querySelector("thead").offsetHeight,
      groups: [...box.querySelectorAll("tbody.mode-group")].map((g) => g.offsetHeight),
    }));
    // Every page repeats the title and the column titles, so the rest is what's left for modes.
    const capacity = height - sizes.title - sizes.head - 3;
    paginate(sizes.groups, capacity).forEach((groupIdx, pageNo) => {
      const table = rootTableHtml(root, { blank, printLayout: true, groups: groupIdx.map((i) => root.groups[i]) });
      pages.push(titleHtml(name, pageNo > 0) + table);
    });
  }
  return pages;
}

/** By Binyan: each verb's tables, three across, split into pages between rows of tables. */
function binyanPages(printArea, verbs, blank) {
  const { width, height } = PAGE_AREA.binyan;
  const pages = [];
  for (const { name, binyanim } of verbs) {
    // A block is one row of up to three tables; the first row of each binyan also carries that binyan's heading.
    const blocks = [];
    for (const b of binyanim) {
      for (let i = 0; i < b.tables.length; i += TABLES_PER_ROW) {
        const row = `<div class="pt-row">${b.tables.slice(i, i + TABLES_PER_ROW).map((t) => binyanTableHtml(b.binyan, t, { blank })).join("")}</div>`;
        const heading = i === 0 ? `<h3 class="verb-tables-binyan-title">${escapeHtml(b.binyan)}</h3>` : "";
        blocks.push(`<div class="pt-block">${heading}${row}</div>`);
      }
    }
    if (blocks.length === 0) continue;
    const sizes = measureIn(printArea, width, titleHtml(name, false) + blocks.join(""), (box) => ({
      title: outerHeight(box.querySelector(".pt-title")),
      blocks: [...box.querySelectorAll(".pt-block")].map((b) => b.offsetHeight),
    }));
    paginate(sizes.blocks, height - sizes.title - 3).forEach((idx, pageNo) => {
      pages.push(titleHtml(name, pageNo > 0) + idx.map((i) => blocks[i]).join(""));
    });
  }
  return pages;
}

/**
 * Prints the tables. `blank: true` prints practice worksheets instead: the same
 * tables with the answers left empty, and any cell the verb doesn't use crossed
 * out with a diagonal line. (Printing the filled tables gives the answer key.)
 */
export function printVerbTables(view, verbs, { blank = false } = {}) {
  let printArea = document.getElementById("print-area");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "print-area";
    document.body.appendChild(printArea);
  }
  prepareForPrint();

  const pages = view === "root" ? rootPages(printArea, verbs, blank) : binyanPages(printArea, verbs, blank);
  printArea.innerHTML =
    `<div class="verb-tables verb-tables-print verb-tables-print-${view}${blank ? " verb-tables-print-blank" : ""}">` +
    pages.map((inner, i) => pageHtml(inner, i === pages.length - 1)).join("") +
    `</div>`;

  // Pages are laid out for a particular orientation: the By Verb Root table has up
  // to seven binyan columns, so it asks for landscape; By Binyan is portrait.
  // (Margins aren't set here: the stylesheet's `@page { margin: 0 }` stays in force.)
  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = `@page { size: ${view === "root" ? "landscape" : "portrait"}; }`;
  document.head.appendChild(style);

  const cleanUp = () => {
    clearTablePrintStyle();
    window.removeEventListener("afterprint", cleanUp);
  };
  window.addEventListener("afterprint", cleanUp);

  window.print();
}
