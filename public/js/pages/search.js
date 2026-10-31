import { getAvailableDatasets, loadVerbData } from "../data.js";
import { getVocabRows } from "../vocab-data.js";
import { getCategoriesForRow, vocabRowKey } from "../vocab-overrides.js";
import { getAccentRows } from "../accent-data.js";
import { getLetterSet } from "../letter-sets.js";
import { renderDatasetSelector } from "../widgets.js";
import { renderTable } from "../table.js";
import { wrapHebrewSpans, stripNiqqud } from "../helpers.js";
import { printFlashcards } from "../print.js";
import { openHebrewKeyboard } from "../hebrew-keyboard.js";
import { getRootForWord, findExistingRoot, getLastRootChange, undoLastRootChange } from "../vocab-roots.js";
import { openCategoryEditor, openBulkCategoryEditor } from "../category-editor.js";
import { openRootEditor, openBulkRootEditor } from "../root-editor.js";
import { addTrayColumn } from "../item-tray.js";
import { vocabSpec, accentSpec, letterSpec, verbFormSpec } from "../item-specs.js";
import { findRootMatches, describeMatch, rootLetters, sameRoot } from "../root-search.js";

const RESULT_CAP = 200;
const DISPLAY_COLUMNS = ["Dataset", "Binyan", "Mode", "Person", "Gender", "Number", "Conjugation", "Gloss Translation"];
const VOCAB_DISPLAY_COLUMNS = ["Lesson", "Hebrew", "English", "POS", "Category", "Root", "Frequency"];
const ACCENT_DISPLAY_COLUMNS = ["Type", "Group", "HebrewName", "EnglishName", "Symbol", "Placement", "Keyboard"];

/** The parts of the app Word Lookup can search. */
const SECTIONS = [
  { id: "verbs", title: "Verb Forms" },
  { id: "vocab", title: "Vocabulary" },
  { id: "accents", title: "Accents" },
  { id: "consonants", title: "Consonants" },
  { id: "vowels", title: "Vowels" },
];

/** What kind of search: the words or English meaning, the letters of a root, or the root already assigned. */
const MODES = [
  ["words", "Words & English"],
  ["root", "Root letters"],
  ["assigned", "Assigned root"],
];

const RECENT_KEY = "hebrewVerbApp:lookupRecent";
const RECENT_MAX = 3;

let state = null;
let idleTimer = null;

function freshState() {
  const available = getAvailableDatasets();
  return {
    // Defaults to every dataset — this is a quick reference tool, not a
    // practice session, so it should search the whole corpus unless the
    // person narrows it down themselves.
    datasets: { selected: [...available] },
    query: "",
    mode: "words", // Word Lookup is one search bar now; the root-letter modes were taken off the page
    searchHebrew: true,
    searchGloss: true,
    ignoreNiqqud: true,
    sections: new Set(SECTIONS.map((s) => s.id)),
    open: {}, // section id -> true/false once the person has opened or closed it
    rootMatch: "ordered", // "ordered" | "adjacent" | "starts"
    rootWeak: false,
    selectedKeys: new Set(), // vocabulary rows ticked for a bulk edit
    banner: null, // { text, root, canUndo } after a bulk root change
  };
}

// ---------------- recent searches ----------------

function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((r) => r && typeof r.q === "string") : [];
  } catch (e) {
    return [];
  }
}

/** Saves the current search as the newest of the last three (a repeat moves to the front). */
function rememberSearch() {
  if (!state) return;
  const q = state.query.trim();
  if (!q) return;
  const entry = {
    q,
    mode: state.mode,
    hebrew: state.searchHebrew,
    gloss: state.searchGloss,
    niqqud: state.ignoreNiqqud,
    sections: [...state.sections],
    rootMatch: state.rootMatch,
    rootWeak: state.rootWeak,
  };
  const same = (a, b) => a.q === b.q && a.mode === b.mode;
  const list = [entry, ...loadRecent().filter((r) => !same(r, entry))].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

function applyRecent(r) {
  state.query = r.q;
  state.mode = "words"; // searches saved from the old root modes open as an ordinary search
  state.searchHebrew = r.hebrew !== false;
  state.searchGloss = r.gloss !== false;
  state.ignoreNiqqud = r.niqqud !== false;
  if (Array.isArray(r.sections) && r.sections.length) state.sections = new Set(r.sections);
  state.rootMatch = r.rootMatch || "ordered";
  state.rootWeak = !!r.rootWeak;
  state.selectedKeys.clear();
  state.banner = null;
}

export function mount({ content, sidebarExtra, navigate }) {
  state = freshState();
  render(content, sidebarExtra, navigate);
}

export function unmount() {
  clearTimeout(idleTimer);
  rememberSearch(); // so a search you leave the page in the middle of is one of your recent ones
  state = null;
}

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

const matchCaption = (n, cap, hint) =>
  n === 0 ? "No matches." : n > cap ? `Showing first ${cap} of ${n} matches — ${hint}` : `${n} match${n === 1 ? "" : "es"}.`;

function render(content, sidebarExtra, navigate) {
  // Preserve the sidebar's scroll position across a filter change — every
  // checkbox toggle calls this same render() to rebuild the whole panel
  // (so derived bits like "Select all"/"Clear all" and dependent option
  // lists stay in sync), which would otherwise reset scroll to the top
  // each time and make picking several boxes in a row from a scrolled-down
  // section (e.g. several lessons) annoying. rAF runs after this
  // function finishes rebuilding the DOM below, so the restore sticks.
  // The panel that actually scrolls is the outer #sidebar element (see
  // css/style.css), not sidebarExtra itself — sidebarExtra is just one
  // inner section of it, alongside Navigation/Account/Progress/etc.
  const __scrollContainer = sidebarExtra.closest("#sidebar") || sidebarExtra;
  const __sidebarScrollTop = __scrollContainer.scrollTop;
  // Each individual checkbox list is also torn down and rebuilt by
  // renderCheckboxList every time any box anywhere changes, so it needs its
  // own scroll restored too. Matched up by position.
  const __checklistScrollTops = [...sidebarExtra.querySelectorAll(".checkbox-list")].map((e) => e.scrollTop);
  sidebarExtra.innerHTML = "";
  requestAnimationFrame(() => {
    __scrollContainer.scrollTop = __sidebarScrollTop;
    const newLists = sidebarExtra.querySelectorAll(".checkbox-list");
    newLists.forEach((e, i) => {
      if (__checklistScrollTops[i] != null) e.scrollTop = __checklistScrollTops[i];
    });
  });
  content.innerHTML = "";

  const available = getAvailableDatasets();
  const again = () => render(content, sidebarExtra, navigate);

  sidebarExtra.appendChild(Object.assign(document.createElement("hr"), { className: "sidebar-divider" }));
  renderDatasetSelector(sidebarExtra, {
    availableDatasets: available,
    state: state.datasets,
    onChange: again,
  });

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1 class="page-title">Word Lookup</h1>
    <div class="info-box">
      <b>Instructions</b><br>
      Type a Hebrew word (or part of one) to find every verb parsing and vocabulary word that matches it, or an English word to search the glosses and translations instead.<br>
      With <i>Ignore vowel points</i> on (the default), a search without vowels matches words that have them: “קטל” finds “קָטַל”.
    </div>
  `;
  content.appendChild(wrap);

  const searchBox = el("div", "lookup-searchbox");

  // ---- the one search bar ----
  const searchLabel = el("label", "lookup-search-label", "Search");
  searchLabel.htmlFor = "lookup-input";
  searchBox.appendChild(searchLabel);
  const searchRow = el("div", "lookup-search-row");

  const input = document.createElement("input");
  input.type = "text";
  input.id = "lookup-input";
  input.className = "lookup-input";
  input.placeholder = 'Type a Hebrew word or an English word, e.g. קָטַל or "he killed"';
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = state.query;
  input.setAttribute("dir", "auto");
  input.addEventListener("input", () => {
    state.query = input.value;
    state.selectedKeys.clear();
    state.banner = null;
    renderResults();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      rememberSearch();
      renderRecent();
    }, 1500);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      rememberSearch();
      renderRecent();
    }
  });
  searchRow.appendChild(input);

  const kbBtn = el("button", "btn btn-outline lookup-kb-btn", "Hebrew Keyboard");
  kbBtn.type = "button";
  kbBtn.addEventListener("click", () => openHebrewKeyboard(input));
  searchRow.appendChild(kbBtn);
  searchBox.appendChild(searchRow);

  // ---- options, as boxes you select (like the Daily Challenge's) ----
  const chip = (labelText, pressed, onToggle, extra = {}) => {
    const b = el("button", "choice-btn daily-chip lookup-chip" + (pressed ? " selected" : ""), escapeHtml(labelText));
    b.type = "button";
    b.setAttribute("aria-pressed", String(pressed));
    Object.assign(b.dataset, extra);
    b.addEventListener("click", () => {
      const now = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(now));
      b.classList.toggle("selected", now);
      onToggle(now);
    });
    return b;
  };
  const chipRow = (label, chips) => {
    const row = el("div", "lookup-option-row");
    row.appendChild(el("span", "sidebar-label lookup-option-label", label));
    const group = el("div", "choice-group lookup-chips");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    chips.forEach((c) => group.appendChild(c));
    row.appendChild(group);
    return row;
  };
  searchBox.appendChild(
    chipRow("Match", [
      chip("Hebrew", state.searchHebrew, (v) => { state.searchHebrew = v; renderResults(); }, { option: "hebrew" }),
      chip("English meaning", state.searchGloss, (v) => { state.searchGloss = v; renderResults(); }, { option: "gloss" }),
      chip("Ignore vowel points", state.ignoreNiqqud, (v) => { state.ignoreNiqqud = v; renderResults(); }, { option: "niqqud" }),
    ])
  );
  searchBox.appendChild(
    chipRow(
      "Look in",
      SECTIONS.map((sec) =>
        chip(
          sec.title,
          state.sections.has(sec.id),
          (v) => {
            if (v) state.sections.add(sec.id);
            else state.sections.delete(sec.id);
            renderResults();
          },
          { section: sec.id }
        )
      )
    )
  );

  // ---- recent searches ----
  const recentWrap = el("div", "lookup-recent");
  recentWrap.style.marginTop = "10px";
  recentWrap.style.textAlign = "center";
  searchBox.appendChild(recentWrap);
  function renderRecent() {
    recentWrap.innerHTML = "";
    const list = loadRecent();
    if (!list.length) return;
    recentWrap.appendChild(el("span", "caption", "Recent searches: "));
    for (const r of list) {
      const b = el("button", "btn btn-outline btn-sm lookup-recent-btn");
      b.type = "button";
      const tag = r.mode === "root" ? " · root" : r.mode === "assigned" ? " · assigned root" : "";
      b.innerHTML = `${wrapHebrewSpans(escapeHtml(r.q))}<span class="caption">${tag}</span>`;
      b.style.margin = "2px 4px";
      b.addEventListener("click", () => {
        applyRecent(r);
        again();
        rememberSearch();
      });
      recentWrap.appendChild(b);
    }
  }
  renderRecent();

  content.appendChild(searchBox);
  content.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));

  const resultsSection = el("div", "lookup-results");
  content.appendChild(resultsSection);

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  /** A collapsible block: a heading button with the match count, and a body that opens and closes. */
  function section(def, count, build, autoOpen) {
    const wrapEl = el("div", "lookup-section");
    wrapEl.dataset.section = def.id;
    const open = state.open[def.id] !== undefined ? state.open[def.id] : autoOpen && count !== 0;
    const h = el("h3", "lookup-section-heading");
    const btn = el("button", "review-section-toggle lookup-section-toggle");
    btn.type = "button";
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = `${def.title} — ${count === null ? "" : count === 0 ? "no matches" : `${count} match${count === 1 ? "" : "es"}`}`.replace(/ — $/, "");
    const body = el("div", "lookup-section-body");
    body.hidden = !open;
    btn.addEventListener("click", () => {
      const now = body.hidden;
      body.hidden = !now;
      btn.setAttribute("aria-expanded", String(now));
      state.open[def.id] = now;
    });
    h.appendChild(btn);
    wrapEl.appendChild(h);
    wrapEl.appendChild(body);
    build(body);
    resultsSection.appendChild(wrapEl);
    resultsSection.appendChild(Object.assign(document.createElement("hr"), { className: "hr" }));
  }

  function message(className, text) {
    resultsSection.appendChild(Object.assign(el("div", className), { textContent: text }));
  }

  function printButton(body, rows, options) {
    const printBtn = el("button", "btn btn-block", "Print These as Flashcards");
    printBtn.style.marginTop = "14px";
    printBtn.addEventListener("click", () => printFlashcards(rows, options));
    body.appendChild(printBtn);
  }

  function renderResults() {
    resultsSection.innerHTML = "";

    const query = state.query.trim();
    if (!query) {
      resultsSection.appendChild(el("p", "lookup-hint", "Results will appear here as you type, grouped by where they were found."));
      return;
    }
    if (state.mode === "words" && !state.searchHebrew && !state.searchGloss) {
      message("alert alert-warning", "Select at least one of Hebrew or English meaning under Match.");
      return;
    }
    const shownSections = SECTIONS.filter((s) => state.sections.has(s.id) && (state.mode === "words" || s.id === "vocab"));
    if (state.sections.size === 0) {
      message("alert alert-warning", "Select at least one place under Look in.");
      return;
    }
    if (state.mode !== "words" && !state.sections.has("vocab")) {
      message("alert alert-warning", "Root searches look in Vocabulary — tick Vocabulary under “Look in”.");
      return;
    }

    if (state.banner) resultsSection.appendChild(bannerEl());

    const queryLower = query.toLowerCase();
    const queryStripped = stripNiqqud(query);
    const hebrewMatches = (text) => (state.ignoreNiqqud ? stripNiqqud(text).includes(queryStripped) : (text || "").includes(query));

    // Work out every section's matches first, so a section opens by itself when it is the only one with matches.
    const result = {};
    const selected = state.datasets.selected;
    if (state.mode === "words") {
      if (state.sections.has("verbs") && selected && selected.length) {
        result.verbs = loadVerbData(selected).filter((row) => {
          const inHebrew = state.searchHebrew && hebrewMatches(row.Conjugation || "");
          const inGloss = state.searchGloss && (row["Gloss Translation"] || "").toLowerCase().includes(queryLower);
          return inHebrew || inGloss;
        });
      }
      if (state.sections.has("vocab")) {
        result.vocab = getVocabRows()
          .filter((row) => {
            const inHebrew = state.searchHebrew && hebrewMatches(row.Hebrew || "");
            const inEnglish = state.searchGloss && (row.English || "").toLowerCase().includes(queryLower);
            return inHebrew || inEnglish;
          })
          .map((row) => ({ row }));
      }
      if (state.sections.has("accents")) {
        result.accents = getAccentRows().filter((row) => {
          const inHebrew = state.searchHebrew && hebrewMatches(row.HebrewName || "");
          const inEnglish = state.searchGloss && (row.EnglishName || "").toLowerCase().includes(queryLower);
          return inHebrew || inEnglish;
        });
      }
      const LETTER_SEARCH_FIELDS = { consonants: ["Name", "Transliteration", "Category"], vowels: ["Name", "Class", "Length", "Pronunciation"] };
      for (const setId of ["consonants", "vowels"]) {
        if (!state.sections.has(setId)) continue;
        result[setId] = getLetterSet(setId)
          .rows()
          .filter((row) => {
            const inHebrew = state.searchHebrew && hebrewMatches(row.Form || "");
            const text = LETTER_SEARCH_FIELDS[setId].map((f) => row[f] || "").join(" ").toLowerCase();
            return inHebrew || (state.searchGloss && text.includes(queryLower));
          });
      }
    } else if (state.mode === "root") {
      if (rootLetters(query).length < 2) {
        message("alert alert-info", "Type at least two Hebrew consonants of the root, e.g. שמר.");
        return;
      }
      result.vocab = findRootMatches(getVocabRows(), query, { mode: state.rootMatch, weak: state.rootWeak });
    } else {
      result.vocab = getVocabRows()
        .filter((row) => sameRoot(getRootForWord(row), query))
        .map((row) => ({ row }));
    }

    const withMatches = shownSections.filter((s) => (result[s.id] || []).length > 0).length;
    const autoOpen = withMatches <= 1;

    for (const def of shownSections) {
      const found = result[def.id];
      if (def.id === "verbs" && !found) {
        section(def, null, (body) => body.appendChild(Object.assign(el("div", "alert alert-warning"), { textContent: "Select at least one dataset in the sidebar to search verb forms." })), true);
        continue;
      }
      if (def.id === "verbs") buildVerbs(def, found, query, autoOpen);
      else if (def.id === "vocab") buildVocab(def, found, query, autoOpen);
      else if (def.id === "accents") buildAccents(def, found, query, autoOpen);
      else buildLetters(def, found, query, autoOpen);
    }
  }

  function bannerEl() {
    const b = el("div", "alert alert-info lookup-banner");
    b.appendChild(el("span", "", state.banner.text + " "));
    if (getLastRootChange()) {
      const undo = el("button", "btn btn-secondary btn-sm lookup-undo", "Undo last assignment");
      undo.type = "button";
      undo.style.marginLeft = "6px";
      undo.addEventListener("click", () => {
        const n = undoLastRootChange();
        state.banner = { text: `Undone — ${n} word${n === 1 ? "" : "s"} put back as they were.`, root: "" };
        renderResults();
      });
      b.appendChild(undo);
    }
    return b;
  }

  function buildVerbs(def, rows, query, autoOpen) {
    section(def, rows.length, (body) => {
      body.appendChild(el("div", "caption", matchCaption(rows.length, RESULT_CAP, "narrow your search or datasets for more precise results.")));
      if (!rows.length) return;
      const shown = rows.slice(0, RESULT_CAP);
      const tableWrap = document.createElement("div");
      renderTable(tableWrap, shown, { columns: DISPLAY_COLUMNS, cellRenderers: { Dataset: (v) => wrapHebrewSpans(v) } });
      addTrayColumn(tableWrap, shown, verbFormSpec);
      body.appendChild(tableWrap);
      printButton(body, shown, { title: `Search: ${query}` });
    }, autoOpen);
  }

  function buildAccents(def, rows, query, autoOpen) {
    section(def, rows.length, (body) => {
      body.appendChild(el("div", "caption", matchCaption(rows.length, RESULT_CAP, "narrow your search for more precise results.")));
      if (!rows.length) return;
      const shown = rows.slice(0, RESULT_CAP);
      const tableWrap = document.createElement("div");
      renderTable(tableWrap, shown, {
        columns: ACCENT_DISPLAY_COLUMNS,
        cellRenderers: {
          HebrewName: (v) => wrapHebrewSpans(v),
          Symbol: (v) => `<span class="accent-symbol-cell" lang="he">${v || ""}</span>`,
          Placement: (v) => wrapHebrewSpans(v),
          Group: (v) => (v ? v : `<span class="caption">—</span>`),
        },
      });
      addTrayColumn(tableWrap, shown, accentSpec);
      body.appendChild(tableWrap);
      printButton(body, shown, {
        title: `Search: ${query}`,
        frontField: "Placement",
        backField: "HebrewName",
        backFieldIsHebrew: true,
        secondaryField: "EnglishName",
        metaFields: ["Type", "Group"],
      });
    }, autoOpen);
  }

  function buildLetters(def, matches, query, autoOpen) {
    const set = getLetterSet(def.id);
    section({ ...def, title: set.title }, matches.length, (body) => {
      body.appendChild(el("div", "caption", matches.length === 0 ? "No matches." : `${matches.length} match${matches.length === 1 ? "" : "es"}.`));
      if (!matches.length) return;
      const tableWrap = document.createElement("div");
      renderTable(tableWrap, matches, {
        columns: set.columns,
        cellRenderers: {
          Form: (v) => `<span class="letter-form-cell" lang="he">${v || ""}</span>`,
          Category: (v) => (v ? v : `<span class="caption">—</span>`),
          Transliteration: (v) => (v ? `<span class="letter-translit">${v}</span>` : `<span class="caption">—</span>`),
        },
      });
      tableWrap.querySelectorAll("thead th").forEach((th, i) => {
        const label = set.columnLabels[set.columns[i]];
        if (label) th.textContent = label;
      });
      addTrayColumn(tableWrap, matches, (row) => letterSpec(set, row));
      body.appendChild(tableWrap);
      printButton(body, matches.map(set.printRow), { title: `Search: ${query}`, ...set.print });
    }, autoOpen);
  }

  function buildVocab(def, found, query, autoOpen) {
    const isRoot = state.mode === "root";
    section(def, found.length, (body) => {
      const shownEntries = found.slice(0, RESULT_CAP);
      const shown = shownEntries.map((f) => f.row);
      const matchOf = new Map(shownEntries.map((f) => [vocabRowKey(f.row), f.match]));
      body.appendChild(
        el(
          "div",
          "caption",
          state.mode === "assigned"
            ? found.length === 0
              ? "No words have this root yet."
              : `${found.length} word${found.length === 1 ? "" : "s"} with this root.`
            : matchCaption(found.length, RESULT_CAP, "narrow your search for more precise results.")
        )
      );
      if (!found.length) return;

      // ---- selection and bulk edit bar ----
      const keysShown = new Set(shown.map(vocabRowKey));
      // ticks left over from a different search no longer count
      for (const k of [...state.selectedKeys]) if (!keysShown.has(k)) state.selectedKeys.delete(k);
      const bar = el("div", "button-row lookup-bulkbar");
      bar.style.marginBottom = "10px";
      const mkBtn = (cls, text) => Object.assign(el("button", cls, text), { type: "button" });
      const selectAll = mkBtn("btn btn-outline btn-sm narrow", `Select all matches (${shown.length})`);
      const clearSel = mkBtn("btn btn-outline btn-sm narrow", "Clear Selection");
      const likely = isRoot ? mkBtn("btn btn-outline btn-sm narrow", "Select letters-together matches") : null;
      const rootBtn = mkBtn("btn btn-sm narrow lookup-set-root", "");
      const catBtn = mkBtn("btn btn-sm narrow", "");
      const count = el("span", "caption");
      count.style.marginLeft = "6px";
      const selectedRows = () => shown.filter((r) => state.selectedKeys.has(vocabRowKey(r)));
      function updateBar() {
        const n = state.selectedKeys.size;
        rootBtn.textContent = `Set root (${n} selected)`;
        rootBtn.disabled = n === 0;
        catBtn.textContent = `Bulk Edit Categories (${n})`;
        catBtn.disabled = n === 0;
        count.textContent = n > 0 ? `${n} selected` : "";
        body.querySelectorAll(".lookup-row-select").forEach((cb) => {
          cb.checked = state.selectedKeys.has(decodeURIComponent(cb.dataset.key));
        });
      }
      selectAll.addEventListener("click", () => {
        for (const r of shown) state.selectedKeys.add(vocabRowKey(r));
        updateBar();
      });
      clearSel.addEventListener("click", () => {
        state.selectedKeys.clear();
        updateBar();
      });
      if (likely)
        likely.addEventListener("click", () => {
          for (const r of shown) {
            const m = matchOf.get(vocabRowKey(r));
            if (m && (m.kind === "adjacent" || m.kind === "starts")) state.selectedKeys.add(vocabRowKey(r));
          }
          updateBar();
        });
      rootBtn.addEventListener("click", () => {
        const rows = selectedRows();
        if (!rows.length) return;
        // When what was searched is Hebrew letters only (two or more), the box starts with those consonants (reusing an
        // existing spelling of the same root), so searching שמר and choosing the words that belong is one short path.
        const hebrewOnly = /^[\s\u0590-\u05FF]+$/.test(query);
        const letters = hebrewOnly && rootLetters(query).length >= 2 ? rootLetters(query) : "";
        const prefill = letters ? findExistingRoot(letters) || letters : "";
        openBulkRootEditor(
          rows,
          (res) => {
            state.banner = res.cleared
              ? { text: `Cleared the root from ${res.count} word${res.count === 1 ? "" : "s"}.`, root: "" }
              : {
                  text: `Set root ${res.root} for ${res.assigned} word${res.assigned === 1 ? "" : "s"}${res.skipped ? ` (${res.skipped} kept their own root)` : ""}.`,
                  root: res.root,
                };
            renderResults();
          },
          { prefill, conflictDefault: "skip" }
        );
      });
      catBtn.addEventListener("click", () => {
        const rows = selectedRows();
        if (rows.length) openBulkCategoryEditor(rows, renderResults);
      });
      bar.append(selectAll);
      if (likely) bar.append(likely);
      bar.append(clearSel, rootBtn, catBtn, count);
      body.appendChild(bar);

      // ---- the table ----
      const columns = ["Select", ...(isRoot ? ["Match"] : []), ...VOCAB_DISPLAY_COLUMNS];
      const tableWrap = document.createElement("div");
      renderTable(tableWrap, shown, {
        columns,
        cellRenderers: {
          Select: (v, row) => {
            const key = encodeURIComponent(vocabRowKey(row));
            return `<input type="checkbox" class="lookup-row-select" data-key="${key}" ${state.selectedKeys.has(vocabRowKey(row)) ? "checked" : ""} aria-label="Select this word" />`;
          },
          Match: (v, row) => `<span class="caption">${escapeHtml(describeMatch(matchOf.get(vocabRowKey(row))))}</span>`,
          Hebrew: (v) => wrapHebrewSpans(v),
          Category: (v, row) => {
            const cats = getCategoriesForRow(row).join(", ");
            const display = cats ? escapeHtml(cats) : `<span class="caption">—</span>`;
            return `${display} <button type="button" class="btn btn-outline btn-sm lookup-cat-edit" data-key="${encodeURIComponent(vocabRowKey(row))}">Edit</button>`;
          },
          Root: (v, row) => {
            const root = getRootForWord(row);
            const display = root ? wrapHebrewSpans(root) : `<span class="caption">—</span>`;
            return `${display} <button type="button" class="btn btn-outline btn-sm lookup-root-edit" data-key="${encodeURIComponent(vocabRowKey(row))}">Edit</button>`;
          },
        },
      });
      addTrayColumn(tableWrap, shown, vocabSpec);
      body.appendChild(tableWrap);

      const rowFor = (btn) => shown.find((r) => vocabRowKey(r) === decodeURIComponent(btn.dataset.key));
      tableWrap.querySelectorAll(".lookup-row-select").forEach((cb) => {
        cb.addEventListener("change", () => {
          const key = decodeURIComponent(cb.dataset.key);
          if (cb.checked) state.selectedKeys.add(key);
          else state.selectedKeys.delete(key);
          updateBar();
        });
      });
      tableWrap.querySelectorAll(".lookup-cat-edit").forEach((btn) =>
        btn.addEventListener("click", () => {
          const row = rowFor(btn);
          if (row) openCategoryEditor(row, renderResults);
        })
      );
      tableWrap.querySelectorAll(".lookup-root-edit").forEach((btn) =>
        btn.addEventListener("click", () => {
          const row = rowFor(btn);
          if (row) openRootEditor(row, renderResults);
        })
      );
      updateBar();

      printButton(body, shown, { title: `Search: ${query}`, frontField: "Hebrew", backField: "English", metaFields: ["Lesson", "POS", "Frequency"] });
    }, autoOpen);
  }

  renderResults();

  const navWrap = document.createElement("div");
  navWrap.innerHTML = `<hr class="hr"/>`;
  const homeBtn = el("button", "btn btn-secondary", "Return to Home Page");
  homeBtn.addEventListener("click", () => navigate("home"));
  navWrap.appendChild(homeBtn);
  content.appendChild(navWrap);
}
