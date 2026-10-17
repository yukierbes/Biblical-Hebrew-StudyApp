// Personal lists and notes: a student can star any item and attach their own memory trick.
//
// Areas (one storage key each, so two areas never overwrite each other when synced):
//   vocab       — a vocabulary word                    key: Lesson||Hebrew||English
//   consonants  — a consonant                          key: its Name
//   vowels      — a vowel                              key: its Name
//   accents     — an accent mark                       key: Type||HebrewName||EnglishName
//   verbs       — a verb root / paradigm (all 25)      key: the dataset name, e.g. "Strong Verb (קטל)"
//
// Saved as { [itemKey]: { s: 1, n: "note text", t: timestamp } } under
// "hebrewVerbApp:personal:<area>", so cloud-sync.js carries them to every device.
//
// The "My list" filter choice (Everything / Starred / With my note) is saved under one synced
// key too, so a student who studies "Starred" on a laptop finds it still on at their phone.
// It is applied inside the same filter
// functions every Review, Flashcards, Typing and Games page already calls, which is how a
// starred list feeds all of them.

export const PERSONAL_AREAS = {
  vocab: { label: "Vocabulary", itemWord: "word" },
  consonants: { label: "Consonants", itemWord: "consonant" },
  vowels: { label: "Vowels", itemWord: "vowel" },
  accents: { label: "Accents", itemWord: "accent" },
  verbs: { label: "Verbs", itemWord: "verb root" },
};

export const MAX_NOTE_LENGTH = 500;
const PREFIX = "hebrewVerbApp:personal:";
const MODE_KEY = "hebrewVerbApp:personalMode"; // { area: "starred" | "noted" }, synced like the lists

export const LIST_MODES = [
  { id: "all", label: "Everything" },
  { id: "starred", label: "Starred" },
  { id: "noted", label: "With my note" },
];

function load(area) {
  try {
    const raw = localStorage.getItem(PREFIX + area);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function save(area, map) {
  try {
    localStorage.setItem(PREFIX + area, JSON.stringify(map));
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

function tidy(entry) {
  if (!entry) return null;
  const out = {};
  if (entry.s) out.s = 1;
  if (entry.n) out.n = entry.n;
  if (!out.s && !out.n) return null;
  out.t = entry.t || Date.now();
  return out;
}

function update(area, key, change) {
  const map = load(area);
  const next = tidy({ ...(map[key] || {}), ...change, t: Date.now() });
  if (next) map[key] = next;
  else delete map[key];
  save(area, map);
}

/** The whole { itemKey: entry } map for an area, read once (for drawing many rows). */
export function getEntries(area) {
  return load(area);
}

export function isStarred(area, key) {
  return !!(load(area)[key] && load(area)[key].s);
}

export function getNote(area, key) {
  const e = load(area)[key];
  return e && e.n ? e.n : "";
}

/** Flips the star; returns the new state. */
export function toggleStar(area, key) {
  const now = !isStarred(area, key);
  update(area, key, { s: now ? 1 : 0 });
  return now;
}

/** Saves (or, when empty, removes) the student's own note. Returns what was stored. */
export function setNote(area, key, text) {
  const cleaned = String(text ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_NOTE_LENGTH);
  update(area, key, { n: cleaned });
  return cleaned;
}

/** { starred, noted } — how many items in the area have each. */
export function getCounts(area) {
  let starred = 0;
  let noted = 0;
  for (const e of Object.values(load(area))) {
    if (e.s) starred++;
    if (e.n) noted++;
  }
  return { starred, noted };
}

/** Every entry as [key, { starred, note }], newest first (for a "My list" overview). */
export function listEntries(area) {
  return Object.entries(load(area))
    .map(([key, e]) => ({ key, starred: !!e.s, note: e.n || "", t: e.t || 0 }))
    .sort((a, b) => b.t - a.t);
}

// ---------------------------------------------------------------------
// The "My list" filter
// ---------------------------------------------------------------------

function loadModes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MODE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function getListMode(area) {
  const v = loadModes()[area];
  return LIST_MODES.some((m) => m.id === v) ? v : "all";
}

export function setListMode(area, mode) {
  const valid = LIST_MODES.some((m) => m.id === mode) ? mode : "all";
  const modes = loadModes();
  if (valid === "all") delete modes[area];
  else modes[area] = valid;
  try {
    if (Object.keys(modes).length === 0) localStorage.removeItem(MODE_KEY);
    else localStorage.setItem(MODE_KEY, JSON.stringify(modes));
  } catch (e) {
    /* not critical */
  }
  return valid;
}

/**
 * Narrows `rows` to the student's list when a list mode is on; returns `rows`
 * untouched when the mode is "all". `keyFn(row)` gives the row's item key.
 */
export function applyPersonalFilter(area, rows, keyFn) {
  const mode = getListMode(area);
  if (mode === "all") return rows;
  const map = load(area);
  if (mode === "starred") return rows.filter((r) => map[keyFn(r)] && map[keyFn(r)].s);
  return rows.filter((r) => map[keyFn(r)] && map[keyFn(r)].n);
}

/** Text for an empty pool while a list mode is on, or "" when the mode is "all". */
export function emptyListMessage(area) {
  const mode = getListMode(area);
  if (mode === "all") return "";
  const word = PERSONAL_AREAS[area].itemWord;
  return mode === "starred"
    ? `Your starred list is empty here. Tap ☆ on a ${word} to add it, or choose “Everything” under My list.`
    : `None of these ${word}s has a note yet. Tap ✎ on one to add your own memory trick, or choose “Everything” under My list.`;
}

/**
 * The "My list" sidebar control: three choices with live counts.
 *   renderMyListFilter(container, { area, onChange })
 * It sits inside each page's Filters section; `onChange()` runs after a choice so the
 * page rebuilds its pool.
 */
export function renderMyListFilter(container, { area, onChange }) {
  const counts = getCounts(area);
  const current = getListMode(area);
  const wrap = document.createElement("div");
  wrap.className = "mylist-filter";
  wrap.style.marginBottom = "14px";

  const label = document.createElement("div");
  label.className = "sidebar-label";
  label.textContent = "My list";
  wrap.appendChild(label);

  const group = document.createElement("div");
  group.className = "choice-group mylist-choices";
  for (const mode of LIST_MODES) {
    const count = mode.id === "starred" ? counts.starred : mode.id === "noted" ? counts.noted : null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn" + (current === mode.id ? " selected" : "");
    btn.dataset.listMode = mode.id;
    btn.setAttribute("aria-pressed", String(current === mode.id));
    btn.textContent = count === null ? mode.label : `${mode.label} (${count})`;
    btn.addEventListener("click", () => {
      setListMode(area, mode.id);
      onChange();
    });
    group.appendChild(btn);
  }
  wrap.appendChild(group);
  container.appendChild(wrap);
}
