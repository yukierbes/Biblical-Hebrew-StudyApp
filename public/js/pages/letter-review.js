import { getLetterSet, freshFilters, applyLetterFilters } from "../letter-sets.js";
import { renderLetterFilters, resetSidebarKeepingScroll } from "../letter-sidebar.js";
import { renderTable } from "../table.js";
import { downloadCSV, downloadXLSX, wrapHebrewSpans } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { printLetterTable } from "../print-letter-table.js";

/**
 * The Review page for the Consonants or Vowels set: a filterable table, with
 * CSV / Excel download, printable flashcards, and a printable table (either
 * the answer key or a blank practice worksheet). Written once and used for
 * both sets — see letter-sets.js for what differs between them.
 */
export function createReviewPage(setId) {
  const set = getLetterSet(setId);
  const pageKey = `${set.pagePrefix}-review`;
  let state = null;

  function mount({ content, sidebarExtra, navigate }) {
    state = { filters: freshFilters(set), given: "first" };
    render(content, sidebarExtra, navigate);
  }

  function unmount() {
    state = null;
  }

  /** Which column a practice worksheet fills in: the Hebrew form by default
   * (so the student writes the names, categories, ...), or the name, or none. */
  function givenColumn() {
    if (state.given === "first") return "Form";
    return state.given; // "Name" | "none"
  }

  function render(content, sidebarExtra, navigate) {
    resetSidebarKeepingScroll(sidebarExtra);
    content.innerHTML = "";

    const allRows = set.rows();
    if (!allRows.length) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = `No ${set.plural} data found.`;
      content.appendChild(div);
      return;
    }

    renderLetterFilters(sidebarExtra, {
      set,
      state,
      pageKey,
      onChange: () => render(content, sidebarExtra, navigate),
    });

    const filterNames = set.filters.map((f) => f.label).join(" and ");
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <h1 class="page-title">${set.title} Review</h1>
      <div class="info-box">
        <b>Instructions</b><br>
        Use the ${filterNames} filter${set.filters.length > 1 ? "s" : ""} in the sidebar to narrow the list down to what you want to study.<br>
        Download the table as CSV/Excel, print it as flashcards, or print a blank copy to practice on paper.
      </div>
      <hr class="hr" />
    `;
    content.appendChild(wrap);

    const tableSection = document.createElement("div");
    content.appendChild(tableSection);

    const filtered = applyLetterFilters(set, allRows, state.filters);

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "alert alert-warning";
      div.textContent = `No ${set.plural} match the selected filters.`;
      tableSection.appendChild(div);
    } else {
      const caption = document.createElement("div");
      caption.className = "caption";
      caption.textContent = `${filtered.length} of ${allRows.length} ${set.plural}.`;
      tableSection.appendChild(caption);

      const tableContainer = document.createElement("div");
      tableSection.appendChild(tableContainer);
      renderTable(tableContainer, filtered, {
        columns: set.columns,
        cellRenderers: {
          Form: (v) => `<span class="letter-form-cell" lang="he">${v || ""}</span>`,
          Category: (v) => (v ? v : `<span class="caption">—</span>`),
          Transliteration: (v) => (v ? `<span class="letter-translit">${v}</span>` : `<span class="caption">—</span>`),
        },
      });
      // The table header shows raw column keys by default — relabel them.
      tableContainer.querySelectorAll("thead th").forEach((th, i) => {
        const label = set.columnLabels[set.columns[i]];
        if (label) th.textContent = label;
      });

      renderDownloads(tableSection, filtered);
    }

    const navWrap = document.createElement("div");
    navWrap.innerHTML = `<hr class="hr"/>`;
    const homeBtn = document.createElement("button");
    homeBtn.className = "btn btn-secondary";
    homeBtn.textContent = "Return to Home Page";
    homeBtn.addEventListener("click", () => navigate("home"));
    navWrap.appendChild(homeBtn);
    content.appendChild(navWrap);
  }

  function renderDownloads(container, filtered) {
    const dlWrap = document.createElement("div");
    dlWrap.innerHTML = `<hr class="hr"/><h3>Download &amp; Print</h3>`;

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    const mkBtn = (text, onClick, title) => {
      const b = document.createElement("button");
      b.className = "btn btn-block";
      b.textContent = text;
      if (title) b.title = title;
      b.addEventListener("click", onClick);
      return b;
    };

    btnRow.appendChild(mkBtn("Download CSV", () => downloadCSV(filtered, set.columns, `${set.csvName}.csv`)));
    btnRow.appendChild(
      mkBtn("Download Excel", () => downloadXLSX(filtered, set.columns, `${set.csvName}.xlsx`, set.title))
    );
    btnRow.appendChild(
      mkBtn(
        "Print Flashcards",
        () => printFlashcards(filtered.slice(0, 300).map(set.printRow), { title: `${set.title} Flashcards`, ...set.print }),
        "Prints the currently filtered table as double-sided flashcards (15 per sheet)"
      )
    );
    dlWrap.appendChild(btnRow);

    // ---- Printable table: answer key + blank practice worksheet ----
    const tableHeading = document.createElement("h3");
    tableHeading.textContent = "Print Table";
    tableHeading.style.marginTop = "18px";
    dlWrap.appendChild(tableHeading);

    const givenWrap = document.createElement("div");
    givenWrap.style.marginBottom = "10px";
    const givenLabel = document.createElement("div");
    givenLabel.className = "sidebar-label";
    givenLabel.style.marginBottom = "8px";
    givenLabel.textContent = "On the practice worksheet, fill in:";
    givenWrap.appendChild(givenLabel);

    const group = document.createElement("div");
    group.className = "choice-group";
    for (const [value, text] of [
      ["first", "The Hebrew form"],
      ["Name", "The name"],
      ["none", "Nothing (all blank)"],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn" + (state.given === value ? " selected" : "");
      btn.textContent = text;
      btn.addEventListener("click", () => {
        state.given = value;
        // Only the choice buttons change — update them in place so the
        // page doesn't jump.
        group.querySelectorAll(".choice-btn").forEach((b) => b.classList.toggle("selected", b === btn));
      });
      group.appendChild(btn);
    }
    givenWrap.appendChild(group);
    dlWrap.appendChild(givenWrap);

    const printRow = document.createElement("div");
    printRow.className = "button-row";
    printRow.appendChild(
      mkBtn(
        "Print Blank Table",
        () => printLetterTable(set, filtered, { given: givenColumn() }),
        "A practice worksheet with the answers left empty"
      )
    );
    printRow.appendChild(
      mkBtn("Print Table (Answer Key)", () => printLetterTable(set, filtered, { given: "all" }), "The full table, filled in")
    );
    dlWrap.appendChild(printRow);

    container.appendChild(dlWrap);
  }

  return { mount, unmount };
}
