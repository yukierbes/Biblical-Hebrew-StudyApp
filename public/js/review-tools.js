// The two sections every Review page shows ABOVE its table:
//
//   Print Table         — the filtered table as an answer key or a blank
//                         practice worksheet, with a choice of which columns to
//                         print, which column is filled in, and an optional
//                         random sample (up to 100 rows) for quizzes.
//   Download & Print    — CSV / Excel / flashcards (whatever the page offers).
//
// They live above the table because the lists can be long, and the buttons
// were easy to miss at the bottom.

import { sampleN } from "./helpers.js";
import { printDataTable } from "./print-data-table.js";

export const MAX_SAMPLE = 100;

/** Remembers the person's print choices while they use a page. */
export function createPrintState({ excluded = [] } = {}) {
  return {
    excluded: new Set(excluded), // columns left out of the printed table
    given: null, // the column filled in on a worksheet (null = pick a sensible default)
    sample: false, // print a random sample instead of every row
    sampleSize: 25,
  };
}

const mkEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/**
 * Adds the Print Table section, and then the Download & Print section, to `container`.
 *
 *   title          heading used on the printout (e.g. "Vocabulary")
 *   print          the object from createPrintState()
 *   getRows()      the rows to print: the filtered table, as plain text values
 *   getColumns()   the columns showing in the table, in order
 *   labels         { column: heading }
 *   hebrewColumns  columns that hold Hebrew
 *   weights        { column: relative width } for the printed table
 *   downloads      [{ text, title, onClick }] for Download & Print
 *   tablePrint     false to leave the Print Table section out
 *   customPrint    { description, blank(), key() } — for pages whose printed
 *                  table isn't a plain rows-and-columns one (the Verb "By
 *                  Binyan" and "By Verb Root" views): just the two buttons,
 *                  which run the page's own printing
 */
export function renderReviewTools(container, cfg) {
  const { title, print, getRows, getColumns, labels = {}, hebrewColumns = [], weights = {}, downloads = [], tablePrint = true, customPrint } = cfg;

  if (customPrint) renderCustomPrint();
  else if (tablePrint) renderPrintTable();
  renderDownloads();

  function renderPrintTable() {
    const section = mkEl("div");
    container.appendChild(section);

    const redraw = () => {
      section.innerHTML = "";
      draw(section, redraw);
    };
    redraw();

    function draw(sec, again) {
      const visible = getColumns();
      let printCols = visible.filter((c) => !print.excluded.has(c));
      if (printCols.length === 0) printCols = visible; // never an empty table
      const rows = getRows();

      const defaultGiven = printCols.find((c) => hebrewColumns.includes(c)) || printCols[0];
      // Worked out again at click time, because the choice buttons below change
      // print.given without redrawing the section.
      const currentGiven = () => (print.given === "none" || printCols.includes(print.given) ? print.given : defaultGiven);
      const given = currentGiven();

      sec.appendChild(mkEl("h3", "", "Print Table"));
      sec.appendChild(
        mkEl("div", "caption", "Prints the table as it is filtered above, using the columns chosen in the sidebar. Use the blank table to make a quiz.")
      ).style.marginBottom = "10px";

      // ---- Which columns to print ----
      if (visible.length > 1) {
        const lbl = mkEl("div", "sidebar-label", "Columns in the printed table:");
        lbl.style.marginBottom = "6px";
        sec.appendChild(lbl);
        const colRow = mkEl("div", "print-col-row");
        for (const c of visible) {
          const label = mkEl("label", "print-col-option");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = printCols.includes(c);
          cb.disabled = cb.checked && printCols.length === 1;
          cb.addEventListener("change", () => {
            if (cb.checked) print.excluded.delete(c);
            else print.excluded.add(c);
            again();
          });
          label.appendChild(cb);
          label.appendChild(document.createTextNode(" " + (labels[c] || c)));
          colRow.appendChild(label);
        }
        sec.appendChild(colRow);
      }

      // ---- Which column is filled in on a practice worksheet ----
      const givenWrap = mkEl("div");
      givenWrap.style.margin = "12px 0 10px";
      const givenLabel = mkEl("div", "sidebar-label", "On the practice worksheet, fill in:");
      givenLabel.style.marginBottom = "8px";
      givenWrap.appendChild(givenLabel);
      const group = mkEl("div", "choice-group");
      const options = [...printCols.map((c) => [c, labels[c] || c]), ["none", "Nothing (all blank)"]];
      for (const [value, text] of options) {
        const btn = mkEl("button", "choice-btn" + (given === value ? " selected" : ""), text);
        btn.type = "button";
        btn.addEventListener("click", () => {
          print.given = value;
          group.querySelectorAll(".choice-btn").forEach((b) => b.classList.toggle("selected", b === btn));
        });
        group.appendChild(btn);
      }
      givenWrap.appendChild(group);
      sec.appendChild(givenWrap);

      // ---- Random sample ----
      const sampleWrap = mkEl("div", "print-sample-row");
      const sLabel = mkEl("label", "print-col-option");
      const sCb = document.createElement("input");
      sCb.type = "checkbox";
      sCb.checked = print.sample;
      sCb.addEventListener("change", () => {
        print.sample = sCb.checked;
        again();
      });
      sLabel.appendChild(sCb);
      sLabel.appendChild(document.createTextNode(" Print a random sample of "));
      sampleWrap.appendChild(sLabel);

      const num = document.createElement("input");
      num.type = "number";
      num.min = "1";
      num.max = String(MAX_SAMPLE);
      num.value = String(print.sampleSize);
      num.disabled = !print.sample;
      num.className = "print-sample-input";
      num.setAttribute("aria-label", "Number of rows in the random sample");
      num.addEventListener("input", () => {
        const n = parseInt(num.value || "1", 10);
        print.sampleSize = Math.max(1, Math.min(MAX_SAMPLE, Number.isFinite(n) ? n : 1));
      });
      // Tidy the number (and refresh the count below) once typing is finished.
      num.addEventListener("change", () => {
        num.value = String(print.sampleSize);
        again();
      });
      sampleWrap.appendChild(num);
      sampleWrap.appendChild(mkEl("span", "caption", ` rows (up to ${MAX_SAMPLE}), chosen from the filtered table`));
      sec.appendChild(sampleWrap);

      // ---- How much will print ----
      const willPrint = print.sample ? Math.min(print.sampleSize, rows.length) : rows.length;
      const note = mkEl(
        "div",
        "caption",
        print.sample
          ? `A different random ${willPrint} of the ${rows.length} filtered rows is chosen each time you print.`
          : `All ${rows.length} filtered rows will print.${rows.length > 150 ? " That is a long printout — tick the random sample for a short quiz." : ""}`
      );
      note.style.margin = "8px 0 12px";
      sec.appendChild(note);

      // ---- Buttons ----
      const btnRow = mkEl("div", "button-row");
      const run = (givenValue) => {
        const base = print.sample ? sampleN(rows, Math.min(print.sampleSize, rows.length), false) : rows;
        printDataTable({ title, rows: base, columns: printCols, labels, hebrewColumns, weights, given: givenValue });
      };
      const blank = mkEl("button", "btn btn-block", "Print Blank Table");
      blank.title = "A practice worksheet with the answers left empty";
      blank.disabled = rows.length === 0;
      blank.addEventListener("click", () => run(currentGiven()));
      const key = mkEl("button", "btn btn-block", "Print Table (Answer Key)");
      key.title = "The full table, filled in";
      key.disabled = rows.length === 0;
      key.addEventListener("click", () => run("all"));
      btnRow.appendChild(blank);
      btnRow.appendChild(key);
      sec.appendChild(btnRow);
      sec.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
    }
  }

  function renderCustomPrint() {
    const sec = mkEl("div");
    sec.appendChild(mkEl("h3", "", "Print Table"));
    const cap = mkEl("div", "caption", customPrint.description);
    cap.style.marginBottom = "10px";
    sec.appendChild(cap);
    const btnRow = mkEl("div", "button-row");
    const blank = mkEl("button", "btn btn-block", "Print Blank Table");
    blank.title = customPrint.blankTitle || "A practice worksheet with the answers left empty";
    blank.addEventListener("click", customPrint.blank);
    const key = mkEl("button", "btn btn-block", "Print Table (Answer Key)");
    key.title = "The tables as they are, filled in";
    key.addEventListener("click", customPrint.key);
    btnRow.appendChild(blank);
    btnRow.appendChild(key);
    sec.appendChild(btnRow);
    sec.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
    container.appendChild(sec);
  }

  function renderDownloads() {
    if (downloads.length === 0) return;
    const wrap = mkEl("div");
    wrap.appendChild(mkEl("h3", "", "Download & Print"));
    const btnRow = mkEl("div", "button-row");
    for (const d of downloads) {
      const b = mkEl("button", "btn btn-block", d.text);
      if (d.title) b.title = d.title;
      b.addEventListener("click", d.onClick);
      btnRow.appendChild(b);
    }
    wrap.appendChild(btnRow);
    wrap.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
    container.appendChild(wrap);
  }
}
