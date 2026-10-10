// Lets the person drag the sidebar's right edge to make it wider or
// narrower. The chosen width is remembered between visits.
//
// The width lives in one CSS variable, --sidebar-width, set on #app (the
// stylesheet gives it a default and everything that depends on it — the
// sidebar itself, the collapse button sitting on its edge, and this
// resize handle — reads it), so changing that single value moves them all
// together.

const STORAGE_KEY = "sidebarWidth";

export const MIN_SIDEBAR_WIDTH = 200;
const DEFAULT_WIDTH_DESKTOP = 250; // keep in sync with --sidebar-width in style.css
const DEFAULT_WIDTH_OVERLAY = 240; // ...and the same variable inside its max-width media query
const MAX_SIDEBAR_WIDTH = 600;
const MIN_CONTENT_WIDTH = 360; // on a desktop layout, always leave the page content at least this wide
const OVERLAY_EDGE_GAP = 56; // on a phone the sidebar covers the page; leave a strip to tap and close it
const KEY_STEP = 16;
const KEY_STEP_LARGE = 48;
const OVERLAY_QUERY = "(max-width: 720px)"; // same breakpoint main.js and style.css use

/**
 * Keeps a requested width within what makes sense for this screen: never
 * narrower than the minimum, and never so wide that it squeezes the page
 * content (desktop) or leaves nothing to tap outside it (phone overlay).
 */
export function clampSidebarWidth(width, viewportWidth, isOverlay) {
  const roomy = isOverlay ? viewportWidth - OVERLAY_EDGE_GAP : Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - MIN_CONTENT_WIDTH);
  const max = Math.max(MIN_SIDEBAR_WIDTH, roomy);
  const n = Number(width);
  if (Number.isNaN(n)) return null;
  return Math.round(Math.min(max, Math.max(MIN_SIDEBAR_WIDTH, n))); // Infinity -> the widest allowed
}

export function initSidebarResize({
  appEl,
  handleEl,
  storage = safeLocalStorage(),
  viewportWidth = () => window.innerWidth,
  isOverlay = () => !!(window.matchMedia && window.matchMedia(OVERLAY_QUERY).matches),
} = {}) {
  if (!appEl || !handleEl) return null;

  // The width the person chose, or null if the stylesheet's default is in
  // effect (never resized). What's actually SHOWN is this squeezed to fit the
  // current window — kept separate so that shrinking the window and then
  // enlarging it again brings back the width they picked, instead of
  // forgetting it.
  let current = null;

  const defaultWidth = () => (isOverlay() ? DEFAULT_WIDTH_OVERLAY : DEFAULT_WIDTH_DESKTOP);
  const effectiveWidth = () => (current === null ? defaultWidth() : clamp(current));
  const clamp = (w) => clampSidebarWidth(w, viewportWidth(), isOverlay());

  function updateAria() {
    const max = clamp(Infinity);
    handleEl.setAttribute("aria-valuemin", String(MIN_SIDEBAR_WIDTH));
    handleEl.setAttribute("aria-valuemax", String(max));
    handleEl.setAttribute("aria-valuenow", String(Math.min(effectiveWidth(), max)));
  }

  /** Puts the current choice on screen (clamped to what fits right now). */
  function render() {
    if (current === null) appEl.style.removeProperty("--sidebar-width");
    else appEl.style.setProperty("--sidebar-width", `${clamp(current)}px`);
    updateAria();
  }

  function apply(width, { save = false } = {}) {
    const w = clamp(width);
    if (w === null) return;
    current = w;
    render();
    if (save) persist();
  }

  function reset() {
    current = null;
    try {
      storage && storage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* storage unavailable — not critical */
    }
    render();
  }

  function persist() {
    try {
      if (storage && current !== null) storage.setItem(STORAGE_KEY, String(current));
    } catch (e) {
      /* storage unavailable (private browsing, etc.) — not critical */
    }
  }

  // ---- Restore the remembered width ----
  try {
    const stored = storage && storage.getItem(STORAGE_KEY);
    if (stored !== null && stored !== undefined) apply(Number(stored));
  } catch (e) {
    /* ignore */
  }
  updateAria();

  // ---- Dragging (mouse, finger or pen all arrive as pointer events) ----
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    appEl.classList.remove("sidebar-resizing");
    try {
      if (e && e.pointerId !== undefined && handleEl.releasePointerCapture) handleEl.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* already released */
    }
    persist();
  }

  handleEl.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return; // primary button / touch / pen only
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = effectiveWidth();
    appEl.classList.add("sidebar-resizing");
    // Capture keeps the drag going even when the pointer runs ahead of the
    // handle or leaves the window.
    if (handleEl.setPointerCapture && e.pointerId !== undefined) {
      try {
        handleEl.setPointerCapture(e.pointerId);
      } catch (err) {
        /* not capturable (e.g. synthetic event) — the drag still works while over the handle */
      }
    }
  });
  handleEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    apply(startWidth + (e.clientX - startX));
  });
  handleEl.addEventListener("pointerup", endDrag);
  handleEl.addEventListener("pointercancel", endDrag);
  handleEl.addEventListener("lostpointercapture", endDrag);

  // ---- Double-click (or double-tap) puts it back to the default ----
  handleEl.addEventListener("dblclick", () => reset());

  // ---- Keyboard: the handle can be focused and nudged with the arrow keys ----
  handleEl.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    let next = null;
    if (e.key === "ArrowLeft") next = effectiveWidth() - step;
    else if (e.key === "ArrowRight") next = effectiveWidth() + step;
    else if (e.key === "Home") next = MIN_SIDEBAR_WIDTH;
    else if (e.key === "End") next = Infinity;
    else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      reset();
      return;
    } else return;
    // Handled here — keep the app's own arrow-key navigation out of it.
    e.preventDefault();
    e.stopPropagation();
    apply(next === Infinity ? clamp(Infinity) : next, { save: true });
  });

  // ---- A remembered width that suits a big monitor mustn't swallow a small window ----
  window.addEventListener("resize", render);

  return { apply, reset, getWidth: effectiveWidth };
}

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}
