function storageKey(pageKey) {
  return `hebrewVerbApp:filterPresets:${pageKey}`;
}

function safeGetJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

/** All saved presets for one page, e.g. "vocabulary" or "accent-typing"
 * — each page's presets are entirely separate from every other page's. */
export function listPresets(pageKey) {
  return safeGetJSON(storageKey(pageKey), []);
}

/** Saves `snapshot` (whatever shape of filter state the page uses —
 * typically `{ filters: {...}, minFrequency: "" }`) under `name`.
 * Overwrites a same-named preset rather than duplicating it. */
export function savePreset(pageKey, name, snapshot) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  const presets = listPresets(pageKey).filter((p) => p.name !== trimmed);
  presets.push({ name: trimmed, snapshot: JSON.parse(JSON.stringify(snapshot)) });
  presets.sort((a, b) => a.name.localeCompare(b.name));
  safeSetJSON(storageKey(pageKey), presets);
}

export function deletePreset(pageKey, name) {
  const presets = listPresets(pageKey).filter((p) => p.name !== name);
  safeSetJSON(storageKey(pageKey), presets);
}

export function getPreset(pageKey, name) {
  return listPresets(pageKey).find((p) => p.name === name) || null;
}
