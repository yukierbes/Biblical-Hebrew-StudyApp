// The Reading page's way of choosing what to read: a Book, a Chapter, and a Passage within it.
//
//   Book      one button naming the book being read; it opens a panel of every book, grouped as the Hebrew Bible is
//             (Torah, Former Prophets, Latter Prophets, The Twelve, Writings), with a thin bar under each showing how
//             much of it has been read and a tick on a book that is finished.
//   Chapter   previous and next arrows around one button naming the chapter; it opens a grid of the chapter numbers,
//             finished chapters ticked and part-read ones marked.
//   Passage   a row of verse ranges ("1–8", "9–16" ...), each with how much of its vocabulary you know and a tick when
//             it has been read; an option puts the easiest first.
//
// It only draws and reports choices (onGo, onSort): the page decides what to load. A panel closes on Escape, on a
// click elsewhere or when a choice is made, and focus goes back to the button that opened it.

const el = (tag, className, html) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const DIVISIONS = [
  ["torah", "Torah"],
  ["former", "Former Prophets"],
  ["latter", "Latter Prophets"],
  ["twelve", "The Twelve"],
  ["writings", "Writings"],
];

/** "Chapter 3", or "Psalm 23" for the Psalms. */
export const chapterLabel = (book, n) => (book.id === "Ps" ? `Psalm ${n}` : `Chapter ${n}`);

let openPanel = null; // { panel, button, close }

function closeOpenPanel(returnFocus = false) {
  if (!openPanel) return;
  const { panel, button, off } = openPanel;
  openPanel = null;
  off();
  panel.hidden = true;
  button.setAttribute("aria-expanded", "false");
  if (returnFocus) button.focus();
}

/** Wires a button to show/hide a panel. `onOpen` runs when it opens (to put focus on the current choice). */
function makeDisclosure(button, panel, onOpen) {
  panel.hidden = true;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const wasOpen = openPanel && openPanel.panel === panel;
    closeOpenPanel();
    if (wasOpen) return;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const onDocClick = (e) => {
      if (!panel.contains(e.target) && !button.contains(e.target)) closeOpenPanel();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeOpenPanel(true);
      }
    };
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey, true);
    openPanel = { panel, button, off: () => { document.removeEventListener("click", onDocClick, true); document.removeEventListener("keydown", onKey, true); } };
    if (onOpen) onOpen();
  });
  return () => closeOpenPanel(true);
}

/** Closes a panel left open (when the page is drawn again). */
export function closeNavigatorPanels() {
  closeOpenPanel(false);
}

/**
 * Builds the navigator.
 *   books      the Reading index's books: [{ id, title, name, division, chapters: [verses per chapter] }]
 *   current    { book, chapter, section }
 *   counts     { bookId: { chapter: verses read } }
 *   passages   [{ index, from, to, title, complete, pct }] in the order to show (pct is the vocabulary known, or null)
 *   sortEasy   whether the easiest passage is listed first
 *   onGo(loc)  a choice: { book, chapter, section } where section is a number, -1 (the last) or -2 (the first not yet read)
 *   onSort(on) the easiest-first option changed
 */
export function buildReadingNavigator({ books, current, counts, passages, sortEasy, onGo, onSort }) {
  const book = books.find((b) => b.id === current.book);
  const box = el("div", "reading-nav");
  const totals = (b) => b.chapters.reduce((n, x) => n + x, 0);
  const readIn = (b) => Object.values(counts[b.id] || {}).reduce((n, x) => n + x, 0);
  const chapterDone = (b, n) => (counts[b.id] && counts[b.id][n] >= b.chapters[n - 1]) || false;
  const bookDone = (b) => b.chapters.every((_, i) => chapterDone(b, i + 1));

  const row = el("div", "reading-nav-row");

  // ---- Book
  const bookField = el("div", "reading-nav-field");
  bookField.appendChild(el("span", "reading-nav-label", "Book"));
  const bookBtn = el("button", "reading-nav-btn reading-book-btn", `<span class="reading-nav-value">${esc(book.title)}</span><span class="reading-nav-caret" aria-hidden="true">▾</span>`);
  bookBtn.type = "button";
  bookBtn.setAttribute("aria-label", `Book: ${book.title}. Choose a book.`);
  const bookPanel = el("div", "reading-popover reading-book-panel");
  bookPanel.setAttribute("role", "dialog");
  bookPanel.setAttribute("aria-label", "Choose a book");
  for (const [id, name] of DIVISIONS) {
    const group = books.filter((b) => b.division === id);
    if (!group.length) continue;
    const g = el("div", "reading-pop-group");
    g.appendChild(el("h3", "reading-pop-heading", esc(name)));
    const grid = el("div", "reading-book-grid");
    for (const b of group) {
      const done = bookDone(b);
      const frac = totals(b) ? readIn(b) / totals(b) : 0;
      const item = el("button", "reading-book-item" + (b.id === book.id ? " current" : "") + (done ? " done" : ""), `<span class="reading-book-name">${esc(b.title)}${done ? ' <span class="reading-tick" aria-hidden="true">✓</span>' : ""}</span><span class="reading-book-bar" aria-hidden="true"><span style="width:${Math.round(frac * 100)}%"></span></span>`);
      item.type = "button";
      item.dataset.book = b.id;
      item.setAttribute("aria-label", `${b.title}${done ? ", finished" : frac ? `, ${Math.max(1, Math.round(frac * 100))} percent read` : ""}`);
      if (b.id === book.id) item.setAttribute("aria-current", "true");
      item.addEventListener("click", () => {
        closeOpenPanel(false);
        if (b.id === book.id) {
          bookBtn.focus();
          return;
        }
        const first = b.chapters.findIndex((_, i) => !chapterDone(b, i + 1));
        onGo({ book: b.id, chapter: first < 0 ? 1 : first + 1, section: -2 });
      });
      grid.appendChild(item);
    }
    g.appendChild(grid);
    bookPanel.appendChild(g);
  }
  makeDisclosure(bookBtn, bookPanel, () => {
    const cur = bookPanel.querySelector(".reading-book-item.current");
    if (cur) cur.focus();
  });
  bookField.append(bookBtn, bookPanel);
  row.appendChild(bookField);

  // ---- Chapter
  const chField = el("div", "reading-nav-field");
  chField.appendChild(el("span", "reading-nav-label", book.id === "Ps" ? "Psalm" : "Chapter"));
  const ctl = el("div", "reading-nav-control");
  const prev = (() => {
    if (current.chapter > 1) return { book: book.id, chapter: current.chapter - 1 };
    const at = books.findIndex((b) => b.id === book.id);
    return at > 0 ? { book: books[at - 1].id, chapter: books[at - 1].chapters.length } : null;
  })();
  const next = (() => {
    if (current.chapter < book.chapters.length) return { book: book.id, chapter: current.chapter + 1 };
    const at = books.findIndex((b) => b.id === book.id);
    return at < books.length - 1 ? { book: books[at + 1].id, chapter: 1 } : null;
  })();
  const arrow = (text, label, target, cls) => {
    const b = el("button", `reading-nav-btn reading-step ${cls}`, text);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.disabled = !target;
    if (target) b.addEventListener("click", () => onGo({ ...target, section: -2 }));
    return b;
  };
  const prevBtn = arrow("‹", "Previous chapter", prev, "reading-prev");
  const chBtn = el("button", "reading-nav-btn reading-chapter-btn", `<span class="reading-nav-value">${esc(book.id === "Ps" ? `Psalm ${current.chapter}` : String(current.chapter))}</span><span class="reading-nav-caret" aria-hidden="true">▾</span>`);
  chBtn.type = "button";
  chBtn.setAttribute("aria-label", `${chapterLabel(book, current.chapter)} of ${book.chapters.length}. Choose a chapter.`);
  const nextBtn = arrow("›", "Next chapter", next, "reading-next");
  ctl.append(prevBtn, chBtn, nextBtn);
  const chPanel = el("div", "reading-popover reading-chapter-panel");
  chPanel.setAttribute("role", "dialog");
  chPanel.setAttribute("aria-label", `Choose a ${book.id === "Ps" ? "psalm" : "chapter"} of ${book.title}`);
  chPanel.appendChild(el("h3", "reading-pop-heading", `${esc(book.title)} · ${book.chapters.length} ${book.id === "Ps" ? "psalms" : book.chapters.length === 1 ? "chapter" : "chapters"}`));
  const grid = el("div", "reading-chapter-grid");
  for (let n = 1; n <= book.chapters.length; n++) {
    const read = (counts[book.id] && counts[book.id][n]) || 0;
    const done = read >= book.chapters[n - 1];
    const state = done ? " done" : read ? " partial" : "";
    const item = el("button", "reading-chapter-item" + state + (n === current.chapter ? " current" : ""), esc(String(n)));
    item.type = "button";
    item.dataset.chapter = String(n);
    item.setAttribute("aria-label", `${chapterLabel(book, n)}${done ? ", finished" : read ? `, ${read} of ${book.chapters[n - 1]} verses read` : ""}`);
    if (n === current.chapter) item.setAttribute("aria-current", "true");
    item.addEventListener("click", () => {
      closeOpenPanel(false);
      if (n === current.chapter) {
        chBtn.focus();
        return;
      }
      onGo({ book: book.id, chapter: n, section: -2 });
    });
    grid.appendChild(item);
  }
  chPanel.appendChild(grid);
  chPanel.appendChild(el("p", "reading-pop-legend caption", '<span class="reading-legend-swatch done"></span> finished <span class="reading-legend-swatch partial"></span> partly read'));
  makeDisclosure(chBtn, chPanel, () => {
    const cur = chPanel.querySelector(".reading-chapter-item.current");
    if (cur) {
      cur.focus();
      if (cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
    }
  });
  chField.append(ctl, chPanel);
  row.appendChild(chField);
  box.appendChild(row);

  // ---- Passage
  const passRow = el("div", "reading-nav-row reading-nav-passages");
  const pf = el("div", "reading-nav-field reading-nav-grow");
  pf.appendChild(el("span", "reading-nav-label", passages.length === 1 ? "Passage" : "Passages"));
  const chips = el("div", "reading-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Passages of this chapter");
  for (const p of passages) {
    const selected = p.index === current.section;
    const chip = el(
      "button",
      "reading-chip" + (selected ? " selected" : "") + (p.complete ? " done" : ""),
      `<span class="reading-chip-range">${p.complete ? '<span class="reading-tick" aria-hidden="true">✓</span> ' : ""}${esc(p.from === p.to ? String(p.from) : `${p.from}–${p.to}`)}</span>${p.pct !== null && p.pct !== undefined ? `<span class="reading-chip-know reading-know-${p.pct >= 80 ? "high" : p.pct >= 50 ? "mid" : "low"}" title="How much of its vocabulary you know">${p.pct}%</span>` : ""}`
    );
    chip.type = "button";
    chip.dataset.section = String(p.index);
    chip.title = p.title;
    chip.setAttribute("aria-pressed", String(selected));
    chip.setAttribute("aria-label", `${p.title}${p.complete ? ", read" : ""}${p.pct !== null && p.pct !== undefined ? `. You know about ${p.pct} percent of its words.` : ""}`);
    chip.addEventListener("click", () => onGo({ book: book.id, chapter: current.chapter, section: p.index }));
    chips.appendChild(chip);
  }
  pf.appendChild(chips);
  passRow.appendChild(pf);
  if (passages.length > 1) {
    const easy = el("label", "bible-check reading-sort");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!sortEasy;
    cb.addEventListener("change", () => onSort(cb.checked));
    easy.append(cb, document.createTextNode(" Easiest first"));
    easy.title = "List the passages with the most words you already know first";
    passRow.appendChild(easy);
  }
  box.appendChild(passRow);
  return box;
}
