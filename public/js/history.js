const PREFIX = "hebrewVerbApp:quizHistory:";
const MAX_ENTRIES = 20;

export function loadHistory(mode) {
  try {
    const raw = localStorage.getItem(PREFIX + mode);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Record a completed quiz attempt. `entry` should include at least
 * { score, total, percent, datasets, retry }. Newest entries are kept
 * at the front, capped at MAX_ENTRIES.
 */
export function recordAttempt(mode, entry) {
  try {
    const list = loadHistory(mode);
    list.unshift({ ...entry, timestamp: Date.now() });
    while (list.length > MAX_ENTRIES) list.pop();
    localStorage.setItem(PREFIX + mode, JSON.stringify(list));
    return list;
  } catch (e) {
    // Storage unavailable (private browsing, quota, etc.) — not critical.
    return loadHistory(mode);
  }
}

export function clearHistory(mode) {
  try {
    localStorage.removeItem(PREFIX + mode);
  } catch (e) {
    /* ignore */
  }
}
