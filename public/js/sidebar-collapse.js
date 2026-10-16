// Collapsible sidebar headers, and the "Filters · 3 active · Reset" summary.
//
// Every `.sidebar-section` that has a `.sidebar-title` becomes collapsible:
// clicking the title folds the section down to just that title. Pages build their
// sidebar sections (and rebuild them on every filter click) in 20-odd places, so
// instead of editing each one this module WATCHES the sidebar and upgrades any
// section it sees. What is open or closed is remembered by title, so a rebuilt
// "Filters" section comes back exactly as it was left.
//
//   Defaults (until someone clicks a header):
//     - the Navigation section is open, the Account section is closed
//       (both say so with data-collapse-default in index.html);
//     - a page's own sections (Filters, Columns, Verbal Roots, …) are open on a
//       computer and CLOSED on a phone, where space is tight and the sidebar is
//       mostly for getting somewhere.
//   A phone and a computer remember their choices separately.
//
// Individual filter boxes (Lesson, POS, Binyan …) collapse too — that is done where
// they are built, in widgets.js, using the remembered-state helpers below.
//
// A header can show a short summary after its title (data-summary, drawn by CSS) —
// "3 active" on Filters, "Synced ✓" on Account — so a closed section still tells
// you what is inside. A Filters section with active filters also gets a "Reset"
// shortcut in its header that presses the page's own "Reset Filters" button.

const STORE_PREFIX = "sidebarCollapsed:";
const memory = new Map(); // fallback when localStorage is unavailable

const MOBILE_QUERY = "(max-width: 720px)";
/** True on a phone-sized screen (same breakpoint as the rest of the app). */
export function isPhone() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
}

const context = () => (isPhone() ? "phone" : "desktop");

/** Was this header/box left collapsed? Falls back to `fallback` if never clicked. */
export function readCollapsed(key, fallback) {
  const k = `${STORE_PREFIX}${context()}:${key}`;
  try {
    const v = localStorage.getItem(k);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch (e) {
    /* storage unavailable — use memory */
  }
  return memory.has(k) ? memory.get(k) : fallback;
}

/** Remember a header/box as collapsed (true) or open (false). */
export function writeCollapsed(key, collapsed) {
  const k = `${STORE_PREFIX}${context()}:${key}`;
  memory.set(k, collapsed);
  try {
    localStorage.setItem(k, collapsed ? "1" : "0");
  } catch (e) {
    /* not critical */
  }
}

// ---------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------

const titleOf = (section) => section.querySelector(":scope > .sidebar-title");
const toggleOf = (section) => section.querySelector(":scope > .sidebar-title > .sidebar-title-toggle");

function defaultCollapsed(section) {
  const d = section.dataset.collapseDefault;
  if (d === "collapsed") return true;
  if (d === "open") return false;
  return isPhone();
}

function applyState(section, collapsed) {
  section.classList.toggle("is-collapsed", collapsed);
  const btn = toggleOf(section);
  if (btn) btn.setAttribute("aria-expanded", String(!collapsed));
}

/** Make one `.sidebar-section` collapsible (once). */
function enhanceSection(section) {
  const title = titleOf(section);
  if (!title || section.dataset.collapsible === "1") return;
  section.dataset.collapsible = "1";
  const key = title.textContent.trim();

  // The title's own text moves inside a real <button>, so it is keyboard-operable
  // and the heading's text is unchanged.
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sidebar-title-toggle";
  while (title.firstChild) btn.appendChild(title.firstChild);
  title.appendChild(btn);
  title.classList.add("is-collapsible");
  if (section.dataset.summary) btn.dataset.summary = section.dataset.summary;

  applyState(section, readCollapsed(key, defaultCollapsed(section)));
  btn.addEventListener("click", () => {
    const nowCollapsed = !section.classList.contains("is-collapsed");
    applyState(section, nowCollapsed);
    writeCollapsed(key, nowCollapsed);
  });
}

/** Sets the short summary shown after a section's title (e.g. "Synced ✓"). */
export function setSectionSummary(section, text) {
  if (!section) return;
  const value = text || "";
  if (value) section.dataset.summary = value;
  else delete section.dataset.summary;
  const btn = toggleOf(section);
  if (!btn) return;
  if (value) btn.dataset.summary = value;
  else delete btn.dataset.summary;
}

// ---------------------------------------------------------------------
// Filters: "3 active" and the Reset shortcut
// ---------------------------------------------------------------------

const isFiltersSection = (section) => titleOf(section)?.textContent.trim() === "Filters";

function findResetButton(section) {
  return [...section.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset Filters") || null;
}

function refreshFilters(section) {
  const active = section.querySelectorAll('[data-filter-active="true"]').length;
  const wanted = active ? `${active} active` : "";
  if ((section.dataset.summary || "") !== wanted) setSectionSummary(section, wanted);

  let action = section.querySelector(":scope > .sidebar-head-action");
  const reset = findResetButton(section);
  const wantAction = active > 0 && !!reset && !reset.disabled;
  if (wantAction && !action) {
    action = document.createElement("button");
    action.type = "button";
    action.className = "sidebar-head-action";
    action.textContent = "Reset";
    action.title = "Clear every filter on this page";
    action.addEventListener("click", () => {
      const r = findResetButton(section);
      if (r && !r.disabled) r.click();
    });
    titleOf(section).after(action);
  } else if (!wantAction && action) {
    action.remove();
  }
}

// ---------------------------------------------------------------------
// Watching the sidebar
// ---------------------------------------------------------------------

/**
 * Starts upgrading sidebar sections. Call once, after the sidebar markup exists.
 * Sections the pages add later are caught by the observer.
 */
export function initSidebarCollapse(sidebarEl = document.getElementById("sidebar")) {
  if (!sidebarEl) return;
  const run = () => {
    sidebarEl.querySelectorAll(".sidebar-section").forEach(enhanceSection);
    sidebarEl.querySelectorAll(".sidebar-section").forEach((s) => {
      if (s.dataset.collapsible === "1" && isFiltersSection(s)) refreshFilters(s);
    });
  };
  run();
  const Observer = (typeof window !== "undefined" && window.MutationObserver) || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
  if (Observer) {
    // Only real changes cause more changes (a summary that is already right is not
    // rewritten), so this settles after one extra pass.
    new Observer(run).observe(sidebarEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-filter-active", "disabled"],
    });
  }
}
