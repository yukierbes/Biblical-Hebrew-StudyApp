import { loadHistory, clearHistory } from "./history.js";
import { wrapHebrewSpans } from "./helpers.js";

function formatTimestamp(ts) {
  const d = new Date(ts);
  const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

/**
 * Renders a compact "Recent Attempts" panel from localStorage history,
 * so a learner can see whether they're actually improving over time
 * rather than only ever seeing one score in isolation.
 */
export function renderHistoryPanel(container, mode, { onClear } = {}) {
  const history = loadHistory(mode);
  if (history.length === 0) return;

  const panel = document.createElement("div");
  panel.className = "history-panel";

  const title = document.createElement("h3");
  title.textContent = "Recent Attempts";
  panel.appendChild(title);

  const shown = history.slice(0, 5);
  const list = document.createElement("div");
  list.className = "history-list";

  for (const entry of shown) {
    const row = document.createElement("div");
    row.className = "history-row";

    const dateSpan = document.createElement("span");
    dateSpan.className = "history-date";
    dateSpan.textContent = formatTimestamp(entry.timestamp);

    const datasetsSpan = document.createElement("span");
    datasetsSpan.className = "history-datasets";
    datasetsSpan.innerHTML = wrapHebrewSpans((entry.datasets || []).join(", "));

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "history-score";
    scoreSpan.textContent = `${entry.score}/${entry.total} (${entry.percent}%)`;

    row.appendChild(dateSpan);
    row.appendChild(datasetsSpan);
    row.appendChild(scoreSpan);

    if (entry.retry) {
      const retryPill = document.createElement("span");
      retryPill.className = "pill pill-warn";
      retryPill.textContent = "retry";
      row.appendChild(retryPill);
    }

    list.appendChild(row);
  }
  panel.appendChild(list);

  if (history.length > shown.length) {
    const note = document.createElement("div");
    note.className = "caption";
    note.style.marginTop = "8px";
    note.textContent = `Showing ${shown.length} most recent of ${history.length} attempts.`;
    panel.appendChild(note);
  }

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "select-all-btn";
  clearBtn.style.marginTop = "10px";
  clearBtn.textContent = "Clear history";
  clearBtn.addEventListener("click", () => {
    clearHistory(mode);
    if (onClear) onClear();
  });
  panel.appendChild(clearBtn);

  container.appendChild(panel);
}
