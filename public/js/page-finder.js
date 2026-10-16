// The "Go to…" box at the top of the sidebar: type a few letters of a page's name
// ("vow typ") and pick Vowels Typing, instead of expanding groups and scrolling.
//
// The list of pages is read from the sidebar's own buttons every time, so it can
// never drift out of step with the navigation. A few extra words are matched too
// (type "parse" and find Verb Parsing, "lookup" for Word Lookup); they are not shown.
//
// Keyboard: "/" (anywhere you aren't typing) jumps here; Up/Down choose, Enter goes,
// Esc clears. It is a standard combobox, so screen readers announce it as one.

const MAX_RESULTS = 8;

// Words people might type that aren't in a page's button text.
const EXTRA_WORDS = {
  "daily-challenge": "challenge quiz today",
  progress: "stats streak goal mastery weak spots calendar settings reset",
  search: "lookup find dictionary",
  review: "table tables paradigm paradigms",
  "verb-flashcards": "cards",
  parsing: "parse analyze",
  construction: "build construct conjugate",
  achievements: "badges goals unlocked",
};
// The generic words in "<Area> Review / Flashcards / Typing / Games".
const MODE_WORDS = { review: "table browse", flashcards: "cards", typing: "type", games: "play game" };

/** Every page the finder can offer: [{ page, label, haystack }]. */
function collectPages(root) {
  const pages = [];
  root.querySelectorAll("#nav-buttons .nav-btn[data-page]").forEach((btn) => {
    const page = btn.dataset.page;
    const label = btn.textContent.trim();
    const mode = Object.keys(MODE_WORDS).find((m) => page.endsWith(m) || label.toLowerCase().endsWith(m));
    const extra = [EXTRA_WORDS[page] || "", mode ? MODE_WORDS[mode] : ""].join(" ");
    pages.push({ page, label, haystack: `${label} ${extra}`.toLowerCase() });
  });
  // Achievements lives inside My Progress, but people still look for it by name.
  pages.push({ page: "achievements", label: "Achievements", haystack: `achievements ${EXTRA_WORDS.achievements}` });
  return pages;
}

/** Pages matching what was typed, best first. Every typed word must match. */
export function findPages(pages, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored = [];
  pages.forEach((p, order) => {
    const words = p.haystack.split(/\s+/);
    const labelWords = p.label.toLowerCase().split(/\s+/);
    let score = 0;
    for (const t of tokens) {
      if (labelWords.some((w) => w.startsWith(t))) score += 3; // start of a word in the name
      else if (words.some((w) => w.startsWith(t))) score += 2; // start of an alias
      else if (p.haystack.includes(t)) score += 1; // anywhere
      else return; // a word that matches nothing rules the page out
    }
    scored.push({ p, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, MAX_RESULTS).map((s) => s.p);
}

/**
 * Wires the finder. `navigate(page)` goes to a page. Returns { focus() } so the
 * "/" shortcut can jump into it.
 */
export function initPageFinder({ root = document, navigate }) {
  const input = root.getElementById("page-finder-input");
  const list = root.getElementById("page-finder-list");
  if (!input || !list) return { focus() {} };

  let results = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const setActive = (i) => {
    active = i;
    [...list.children].forEach((li, n) => li.classList.toggle("is-active", n === i));
    if (i >= 0) input.setAttribute("aria-activedescendant", list.children[i].id);
    else input.removeAttribute("aria-activedescendant");
    if (i >= 0 && list.children[i].scrollIntoView) list.children[i].scrollIntoView({ block: "nearest" });
  };

  const go = (page) => {
    input.value = "";
    close();
    input.blur();
    navigate(page);
  };

  const draw = () => {
    results = findPages(collectPages(root), input.value);
    list.innerHTML = "";
    if (input.value.trim() === "") return close();
    if (results.length === 0) {
      const li = document.createElement("li");
      li.className = "page-finder-empty";
      li.textContent = "No page matches that.";
      list.appendChild(li);
    }
    results.forEach((r, n) => {
      const li = document.createElement("li");
      li.id = `page-finder-opt-${n}`;
      li.setAttribute("role", "option");
      li.textContent = r.label;
      // mousedown, not click: the input's blur would otherwise close the list first.
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        go(r.page);
      });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(results.length ? 0 : -1);
  };

  input.addEventListener("input", draw);
  input.addEventListener("focus", () => {
    if (input.value.trim()) draw();
  });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      if (list.hidden) draw();
      setActive((active + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((active - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && results[active]) go(results[active].page);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (input.value) {
        input.value = "";
        close();
      } else {
        input.blur();
      }
    }
  });

  return {
    focus() {
      input.focus();
      input.select();
    },
  };
}
