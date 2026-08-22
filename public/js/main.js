import { loadAllData } from "./data.js";
import { loadVocabData } from "./vocab-data.js";
import { loadAccentData } from "./accent-data.js";
import * as homePage from "./pages/home.js";
import * as reviewPage from "./pages/review.js";
import * as verbFlashcardsPage from "./pages/verb-flashcards.js";
import * as parsingPage from "./pages/parsing.js";
import * as constructionPage from "./pages/construction.js";
import * as searchPage from "./pages/search.js";
import * as vocabularyPage from "./pages/vocabulary.js";
import * as vocabFlashcardsPage from "./pages/vocab-flashcards.js";
import * as vocabTypingPage from "./pages/vocab-typing.js";
import * as vocabGamesPage from "./pages/vocab-games.js";
import * as accentReviewPage from "./pages/accent-review.js";
import * as accentFlashcardsPage from "./pages/accent-flashcards.js";
import * as accentTypingPage from "./pages/accent-typing.js";
import * as accentGamesPage from "./pages/accent-games.js";
import * as progressPage from "./pages/progress.js";
import * as achievementsPage from "./pages/achievements.js";
import * as dailyChallengePage from "./pages/daily-challenge.js";
import { showToast } from "./toast.js";
import { initHebrewKeyboard, isHebrewKeyboardOpen, closeHebrewKeyboard } from "./hebrew-keyboard.js";
import { initAccentKeyboard, isAccentKeyboardOpen, closeAccentKeyboard } from "./accent-keyboard.js";
import { initProgressSidebar } from "./srs.js";
import { initCloudSyncUI, cloudSyncSignedIn, cloudSyncSignedOut, openSignIn } from "./cloud-sync.js";

const PAGES = {
  home: homePage,
  review: reviewPage,
  "verb-flashcards": verbFlashcardsPage,
  parsing: parsingPage,
  construction: constructionPage,
  search: searchPage,
  vocabulary: vocabularyPage,
  "vocab-flashcards": vocabFlashcardsPage,
  "vocab-typing": vocabTypingPage,
  "vocab-games": vocabGamesPage,
  "accent-review": accentReviewPage,
  "accent-flashcards": accentFlashcardsPage,
  "accent-typing": accentTypingPage,
  "accent-games": accentGamesPage,
  progress: progressPage,
  achievements: achievementsPage,
  "daily-challenge": dailyChallengePage,
};

const contentEl = document.getElementById("content");
const sidebarExtraEl = document.getElementById("sidebar-extra");
const navButtons = document.querySelectorAll(".nav-btn");
const appEl = document.getElementById("app");
const sidebarToggleEl = document.getElementById("sidebar-toggle");
const sidebarBackdropEl = document.getElementById("sidebar-backdrop");

const MOBILE_QUERY = "(max-width: 720px)";
function isMobileViewport() {
  return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
}

function setSidebarCollapsed(collapsed) {
  appEl.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggleEl.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggleEl.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
  sidebarToggleEl.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  try {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  } catch (e) {
    /* storage unavailable (private browsing, etc.) — not critical */
  }
}

let initiallyCollapsed = false;
let hasStoredSidebarPref = false;
try {
  const stored = localStorage.getItem("sidebarCollapsed");
  if (stored !== null) {
    initiallyCollapsed = stored === "1";
    hasStoredSidebarPref = true;
  }
} catch (e) {
  /* ignore */
}
// On a phone-sized screen with no explicit prior choice, default to
// collapsed so the sidebar doesn't cover the whole viewport on first load.
if (!hasStoredSidebarPref && isMobileViewport()) {
  initiallyCollapsed = true;
}
setSidebarCollapsed(initiallyCollapsed);

sidebarToggleEl.addEventListener("click", () => {
  setSidebarCollapsed(!appEl.classList.contains("sidebar-collapsed"));
});
sidebarBackdropEl.addEventListener("click", () => setSidebarCollapsed(true));

let currentPage = null;

// ---- Sidebar nav sections (Verbs / Vocabulary): expand/collapse,
// persisted per section, with the containing section auto-expanding
// whenever its page becomes the active one so it's never hidden. ----
const NAV_SECTIONS = ["verbs", "vocabulary", "accents"];

function navSectionStorageKey(section) {
  return `navSectionCollapsed:${section}`;
}

function setNavSectionCollapsed(section, collapsed) {
  const toggle = document.querySelector(`.nav-section-toggle[data-nav-section="${section}"]`);
  const group = document.querySelector(`.nav-section-group[data-nav-section-group="${section}"]`);
  if (!toggle || !group) return;
  toggle.setAttribute("aria-expanded", String(!collapsed));
  if (collapsed) group.setAttribute("hidden", "");
  else group.removeAttribute("hidden");
  try {
    localStorage.setItem(navSectionStorageKey(section), collapsed ? "1" : "0");
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

function initNavSections() {
  for (const section of NAV_SECTIONS) {
    // Starts collapsed for a first-time visitor (no stored preference
    // yet) — setActiveNav() below still expands whichever section
    // contains the page that's about to render, so the active section
    // is never hidden on load.
    let collapsed = true;
    try {
      const stored = localStorage.getItem(navSectionStorageKey(section));
      if (stored === "0") collapsed = false;
      else if (stored === "1") collapsed = true;
    } catch (e) {
      /* ignore */
    }
    setNavSectionCollapsed(section, collapsed);

    const toggle = document.querySelector(`.nav-section-toggle[data-nav-section="${section}"]`);
    if (toggle) {
      toggle.addEventListener("click", () => {
        const isExpanded = toggle.getAttribute("aria-expanded") === "true";
        setNavSectionCollapsed(section, isExpanded);
      });
    }
  }
}
initNavSections();

function setActiveNav(pageName) {
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageName);
  });
  const activeBtn = [...navButtons].find((btn) => btn.dataset.page === pageName);
  const containingGroup = activeBtn ? activeBtn.closest(".nav-section-group") : null;
  if (containingGroup) {
    setNavSectionCollapsed(containingGroup.dataset.navSectionGroup, false);
  }
}

export function navigate(pageName) {
  window.location.hash = `#${pageName}`;
}

function currentHashPage() {
  const hash = window.location.hash.replace("#", "");
  return PAGES[hash] ? hash : "home";
}

function renderPage() {
  const pageName = currentHashPage();
  const pageModule = PAGES[pageName];

  if (currentPage && currentPage.unmount) {
    try {
      currentPage.unmount();
    } catch (e) {
      console.error(e);
    }
  }

  contentEl.innerHTML = "";
  sidebarExtraEl.innerHTML = "";
  setActiveNav(pageName);

  currentPage = pageModule;
  pageModule.mount({ content: contentEl, sidebarExtra: sidebarExtraEl, navigate });

  // Move focus to the new page's content so keyboard and screen-reader
  // users get a clear signal that the page changed, without adding a
  // visible focus ring around the whole region (see #content:focus in
  // the stylesheet).
  contentEl.focus();

  // On a phone, the sidebar is a full-height overlay — close it after
  // navigating so the destination page is actually visible.
  if (isMobileViewport()) {
    setSidebarCollapsed(true);
  }

  notifyAchievementProgress();
}

/** Surfaces achievement progress/unlock toasts. Called on every
 * navigation and on a slow interval, so a milestone crossed mid-session
 * (without switching pages) still gets noticed reasonably promptly. */
function notifyAchievementProgress() {
  let events;
  try {
    events = achievementsPage.checkAchievementProgress();
  } catch (e) {
    return; // data not loaded yet, or similar — skip silently
  }
  for (const ev of events) {
    if (ev.kind === "unlocked") {
      showToast({
        icon: ev.achievement.icon || "🏆",
        title: "Achievement Unlocked!",
        body: `${ev.achievement.title} — ${ev.achievement.desc}`,
      });
    } else {
      showToast({
        icon: ev.achievement.icon || "⭐",
        title: `${Math.round((ev.current / ev.target) * 100)}% toward "${ev.achievement.title}"`,
        body: `${ev.current} / ${ev.target} — ${ev.achievement.desc}`,
        duration: 5000,
      });
    }
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.page));
});

window.addEventListener("hashchange", renderPage);

// ============ Dark mode ============

const themeToggleEl = document.getElementById("theme-toggle");

function setTheme(dark) {
  if (dark) {
    document.documentElement.setAttribute("data-theme", "dark");
    themeToggleEl.textContent = "Light Mode";
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggleEl.textContent = "Dark Mode";
  }
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

// The inline script in <head> already applied the stored theme (if any)
// before first paint to avoid a flash; here we just sync the toggle
// button's label to match, and wire up the click handler.
setTheme(document.documentElement.getAttribute("data-theme") === "dark");
themeToggleEl.addEventListener("click", () => {
  setTheme(document.documentElement.getAttribute("data-theme") !== "dark");
});

// ============ Text size (zoom) ============

const ZOOM_MIN = 80;
const ZOOM_MAX = 160;
const ZOOM_STEP = 10;
const zoomOutEl = document.getElementById("zoom-out");
const zoomInEl = document.getElementById("zoom-in");
const zoomResetEl = document.getElementById("zoom-reset");

let currentZoom = 100;
try {
  const stored = parseInt(localStorage.getItem("textZoom"), 10);
  if (!Number.isNaN(stored)) currentZoom = stored;
} catch (e) {
  /* ignore */
}

function setZoom(pct) {
  currentZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pct));
  document.documentElement.style.fontSize = currentZoom + "%";
  zoomResetEl.textContent = currentZoom + "%";
  zoomOutEl.disabled = currentZoom <= ZOOM_MIN;
  zoomInEl.disabled = currentZoom >= ZOOM_MAX;
  try {
    localStorage.setItem("textZoom", String(currentZoom));
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

setZoom(currentZoom);
zoomOutEl.addEventListener("click", () => setZoom(currentZoom - ZOOM_STEP));
zoomInEl.addEventListener("click", () => setZoom(currentZoom + ZOOM_STEP));
zoomResetEl.addEventListener("click", () => setZoom(100));

// ============ Keyboard shortcuts ============

const shortcutsToggleEl = document.getElementById("shortcuts-toggle");
const shortcutsModalEl = document.getElementById("shortcuts-modal");
const shortcutsCloseEl = document.getElementById("shortcuts-close");

function openShortcuts() {
  shortcutsModalEl.classList.remove("hidden");
  shortcutsCloseEl.focus();
}
function closeShortcuts() {
  shortcutsModalEl.classList.add("hidden");
  shortcutsToggleEl.focus();
}
function shortcutsOpen() {
  return !shortcutsModalEl.classList.contains("hidden");
}

shortcutsToggleEl.addEventListener("click", openShortcuts);
shortcutsCloseEl.addEventListener("click", closeShortcuts);
shortcutsModalEl.addEventListener("click", (e) => {
  if (e.target === shortcutsModalEl) closeShortcuts();
});

function isTypingContext(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

// ---- Arrow-key roving focus ----
// Any of these containers counts as one navigable "row" (or, for the
// sidebar nav, "column") of buttons. #nav-buttons is the one vertical
// case; everything else here reads as a horizontal row of choices.
const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const GROUP_SELECTOR = "#nav-buttons, .choice-group, .button-row, .zoom-buttons, .mode-cards";

function getFocusableItems(container) {
  return [...container.querySelectorAll("button, input, a[href]")].filter(
    (el) => !el.disabled && !el.closest("[hidden]")
  );
}

function getNavigableGroups() {
  return [...document.querySelectorAll(GROUP_SELECTOR)].filter((g) => getFocusableItems(g).length > 0);
}

document.addEventListener("keydown", (e) => {
  // Esc always closes whichever dialog is open.
  if (e.key === "Escape" && shortcutsOpen()) {
    closeShortcuts();
    return;
  }
  if (e.key === "Escape" && isHebrewKeyboardOpen()) {
    closeHebrewKeyboard();
    return;
  }
  if (e.key === "Escape" && isAccentKeyboardOpen()) {
    closeAccentKeyboard();
    return;
  }

  const typing = isTypingContext(e.target);

  // "?" opens the shortcuts reference from anywhere, as long as the
  // person isn't actively typing an answer.
  if (e.key === "?" && !typing && !isHebrewKeyboardOpen() && !isAccentKeyboardOpen()) {
    e.preventDefault();
    openShortcuts();
    return;
  }

  if (typing || shortcutsOpen() || isHebrewKeyboardOpen() || isAccentKeyboardOpen()) return;

  // Digits 1-9 pick that option within whichever Selection-mode choice
  // group currently has keyboard focus inside it (Practice or Quiz).
  if (/^[1-9]$/.test(e.key)) {
    const group = e.target.closest ? e.target.closest(".choice-group") : null;
    if (group) {
      const buttons = group.querySelectorAll(".choice-btn");
      const idx = parseInt(e.key, 10) - 1;
      const target = buttons[idx];
      if (target) {
        e.preventDefault();
        const label = target.textContent;
        // Clicking triggers the page's own re-render, which tears down
        // and rebuilds this whole section — `target` is a detached node
        // by the time click() returns, so focusing it directly would
        // silently do nothing. Re-find the freshly-rendered equivalent
        // by its label and focus that instead.
        target.click();
        const refreshed = [...document.querySelectorAll(".choice-btn.selected")].find(
          (b) => b.textContent === label
        );
        if (refreshed) refreshed.focus();
      }
    }
    return;
  }

  // Arrow-key roving focus: within a horizontal row of buttons (the
  // sidebar nav is the one vertical exception), Left/Right moves along
  // the row and Up/Down jumps to the next/previous row — including
  // jumping into the sidebar's nav list, since it's just another row in
  // DOM order. This is what makes rattling through a Selection-mode
  // quiz question (or any button row) fast without reaching for Tab.
  if (ARROW_KEYS.has(e.key)) {
    const groups = getNavigableGroups();
    const currentGroup = groups.find((g) => g.contains(e.target));
    const items = currentGroup ? getFocusableItems(currentGroup) : [];
    const idx = items.indexOf(e.target);

    if (currentGroup && idx !== -1) {
      const vertical = currentGroup.id === "nav-buttons";
      const withinAxis = vertical
        ? e.key === "ArrowUp" || e.key === "ArrowDown"
        : e.key === "ArrowLeft" || e.key === "ArrowRight";

      e.preventDefault();

      if (withinAxis) {
        const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        const nextIdx = (idx + dir + items.length) % items.length;
        items[nextIdx].focus();
        return;
      }

      // The "other" axis jumps to a neighboring row/column at the same
      // position — e.g. Down from a choice-group lands on the same
      // option-index in the next field's row, if it exists.
      const groupIdx = groups.indexOf(currentGroup);
      let targetGroupIdx;
      if (vertical) {
        if (e.key !== "ArrowRight") return; // already the leftmost column
        targetGroupIdx = groupIdx + 1;
      } else {
        targetGroupIdx = e.key === "ArrowDown" ? groupIdx + 1 : groupIdx - 1;
      }
      if (targetGroupIdx < 0 || targetGroupIdx >= groups.length) return;
      const targetItems = getFocusableItems(groups[targetGroupIdx]);
      const clampedIdx = Math.min(idx, targetItems.length - 1);
      if (targetItems[clampedIdx]) targetItems[clampedIdx].focus();
    }
    return;
  }

  // Enter advances a quiz: "Next Question" (Parsing) or "Reveal Answer"
  // (Construction). Skipped if that same button already has focus, so
  // the browser's own native Enter-activates-the-focused-button
  // behavior doesn't fire twice.
  if (e.key === "Enter") {
    const btn = document.querySelector(".js-shortcut-next, .js-shortcut-reveal");
    if (btn && !btn.disabled && document.activeElement !== btn) {
      e.preventDefault();
      btn.click();
    }
  }
});

async function init() {
  initHebrewKeyboard();
  initProgressSidebar();
  initCloudSyncUI();
  try {
    await Promise.all([loadAllData(), loadVocabData(), loadAccentData()]);
  } catch (e) {
    contentEl.innerHTML = `<div class="alert alert-error">Failed to load data: ${e.message}</div>`;
    return;
  }
  // Unlike the static Hebrew Keyboard (a fixed consonant/niqqud layout),
  // the Accent Keyboard's buttons are built from the accents dataset —
  // it can only be wired up once that's loaded.
  initAccentKeyboard();
  renderPage();

  // Catches achievement milestones crossed mid-session without a page
  // navigation (e.g. several Practice answers in a row on one page).
  setInterval(notifyAchievementProgress, 20000);
}

// ============ Sign-in gate ============
//
// Signing in isn't optional here — every dataset (verbs, vocabulary,
// accents) is served only through Identity-protected Netlify Functions
// (see netlify/functions/get-data.js), so nothing in init() above can
// succeed until Identity confirms a signed-in, invited user. This gate
// owns all of Identity's init/login/logout events for the whole app;
// cloud-sync.js reacts to what this gate tells it rather than listening
// to Identity itself, so the two never race or double-initialize it.

const authGateEl = document.getElementById("auth-gate");
const authGateMessageEl = document.getElementById("auth-gate-message");
const authGateSignInBtn = document.getElementById("auth-gate-signin-btn");

function showGate(message, { showSignIn }) {
  appEl.classList.add("hidden");
  authGateEl.classList.remove("hidden");
  authGateMessageEl.textContent = message;
  authGateMessageEl.classList.remove("auth-gate-error");
  authGateSignInBtn.classList.toggle("hidden", !showSignIn);
}

function showGateError(message) {
  showGate(message, { showSignIn: false });
  authGateMessageEl.classList.add("auth-gate-error");
}

let appStarted = false;

function handleAuthState(user) {
  if (user) {
    cloudSyncSignedIn(user.email);
    if (!appStarted) {
      appStarted = true;
      appEl.classList.remove("hidden");
      authGateEl.classList.add("hidden");
      init();
    }
    return;
  }

  cloudSyncSignedOut();
  if (appStarted) {
    // The app already loaded data/rendered a page while signed in —
    // rather than trying to tear all of that back out, a full reload
    // cleanly re-runs this same gate from scratch.
    window.location.reload();
    return;
  }
  showGate("Sign in to access this study app.", { showSignIn: true });
}

authGateSignInBtn.addEventListener("click", openSignIn);

const identity = window.netlifyIdentity;
if (!identity) {
  showGateError(
    "Sign-in is required to use this app, but it isn't configured on this deployment. If you're the site owner, enable Netlify Identity in Site configuration."
  );
} else {
  identity.on("init", handleAuthState);
  identity.on("login", (user) => {
    handleAuthState(user);
    identity.close();
  });
  identity.on("logout", () => handleAuthState(null));
  identity.init();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      // Offline support is a nice-to-have, not a hard requirement — the
      // app should keep working normally even if registration fails
      // (e.g. served from a context that disallows service workers).
      console.warn("Service worker registration failed:", e);
    });
  });

  // When a new service worker version takes over an already-open tab
  // (after sw.js bumps CACHE_VERSION and calls skipWaiting/clients.claim),
  // the page's already-loaded JS modules are stale until the next
  // navigation. Reload automatically, once, so people don't have to
  // know to hit refresh twice to see a new deploy.
  let hasReloadedForNewWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForNewWorker) return;
    hasReloadedForNewWorker = true;
    window.location.reload();
  });
}
// init() is no longer called unconditionally here — the sign-in gate
// above calls it once Identity confirms a signed-in user.
