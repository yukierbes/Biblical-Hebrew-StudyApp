// The sidebar's Settings pop-over: the one gear button that holds text size, Hebrew size, Appearance, Account and
// Sources & Credits, so only the streak stays on show. It is a small non-modal dialog:
//   - the gear opens and closes it (aria-expanded says which)
//   - Escape closes it and returns focus to the gear
//   - a click outside, or Tab moving focus out of it, closes it
//   - choosing a page from it (Sources & Credits) closes it

export function initSettingsPopover() {
  const toggle = document.getElementById("settings-toggle");
  const pop = document.getElementById("settings-popover");
  if (!toggle || !pop) return null;
  if (toggle.dataset.bound) return null; // already set up
  toggle.dataset.bound = "1";

  const isOpen = () => !pop.hidden;
  function open() {
    pop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    const first = pop.querySelector("button, input, a[href]");
    if (first) first.focus();
  }
  function close({ returnFocus = false } = {}) {
    if (!isOpen()) return;
    pop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => (isOpen() ? close() : open()));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      e.stopPropagation();
      close({ returnFocus: true });
    }
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (isOpen() && !pop.contains(e.target) && !toggle.contains(e.target)) close();
  });

  // Keyboard: leaving the pop-over (and the gear) by Tab closes it.
  pop.addEventListener("focusout", (e) => {
    const to = e.relatedTarget;
    if (isOpen() && to && !pop.contains(to) && to !== toggle) close();
  });

  // Going to a page from the pop-over (Sources & Credits, Mistake Reports) closes it.
  pop.addEventListener("click", (e) => {
    if (e.target.closest(".nav-btn")) close();
  });

  return { open, close, isOpen };
}
