let containerEl = null;

function getContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  containerEl = document.getElementById("toast-container");
  if (!containerEl) {
    containerEl = document.createElement("div");
    containerEl.id = "toast-container";
    document.body.appendChild(containerEl);
  }
  return containerEl;
}

/**
 * Shows a small, self-dismissing popup in the corner of the screen.
 * Non-blocking — doesn't interrupt whatever the person is doing.
 *
 * @param {object} opts
 * @param {string} opts.title - bold headline (e.g. "Achievement Unlocked!")
 * @param {string} opts.body - supporting line (e.g. "Accent Learner — 10 accents mastered")
 * @param {string} [opts.icon] - emoji or short glyph shown beside the text
 * @param {number} [opts.duration] - ms before auto-dismiss (default 6000)
 */
export function showToast({ title, body, icon = "🏆", duration = 6000 }) {
  if (typeof document === "undefined") return;
  const container = getContainer();

  const toast = document.createElement("div");
  toast.className = "app-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="app-toast-icon">${icon}</span>
    <span class="app-toast-body">
      <span class="app-toast-title">${title}</span>
      ${body ? `<span class="app-toast-desc">${body}</span>` : ""}
    </span>
    <button class="app-toast-close" type="button" aria-label="Dismiss">×</button>
  `;

  const remove = () => {
    toast.classList.add("app-toast-leaving");
    setTimeout(() => toast.remove(), 200);
  };

  toast.querySelector(".app-toast-close").addEventListener("click", remove);
  const timer = setTimeout(remove, duration);
  toast.addEventListener("mouseenter", () => clearTimeout(timer));

  container.appendChild(toast);
  // Force layout before adding the "entered" class so the transition runs.
  requestAnimationFrame(() => toast.classList.add("app-toast-in"));
}
