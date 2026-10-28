// Appearance: the color theme, the background pattern, and the Hebrew size.
//
// - Themes: six curated palettes (Classic, Parchment, Sky, Olive, Terracotta, Midnight).
//   Each has a light and a dark version, so the Dark Mode button in the sidebar keeps
//   working with every one. The colors live in css/style.css (data-palette on <html>).
// - Patterns: an optional faint background pattern (dots, graph paper, diagonal lines,
//   weave), Subtle or Bold, drawn only on the page background and sidebar so it never
//   sits behind text on a card or table. Works with any theme.
// - Hebrew size: scales every Hebrew letter on screen (tables, flashcards, typing,
//   games, Word Lookup …) separately from the page text size. Printouts ignore it,
//   so printed flashcards and tables keep their layout.
//
// These are display settings for the device in use, so they are kept in this browser's
// localStorage (not synced to the cloud, like the Dark Mode and text-size settings).
// The inline script in index.html applies the saved values before first paint.

export const PALETTES = [
  { id: "classic", label: "Classic" },
  { id: "parchment", label: "Parchment" },
  { id: "sky", label: "Sky" },
  { id: "olive", label: "Olive" },
  { id: "terracotta", label: "Terracotta" },
  { id: "midnight", label: "Midnight" },
];

export const PATTERNS = [
  { id: "none", label: "None" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Graph paper" },
  { id: "lines", label: "Diagonal lines" },
  { id: "weave", label: "Weave" },
];

export const HEBREW_SIZES = [80, 100, 120, 140, 160];

const KEYS = { palette: "themePalette", pattern: "themePattern", strength: "themePatternStrength", hebrew: "hebrewZoom" };

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* storage unavailable — the choice just lasts until the page is closed */
  }
}

const root = () => document.documentElement;

/** Sets (or, for Classic / None / Subtle, clears) the attributes the stylesheet reads. */
export function applyPalette(id) {
  const valid = PALETTES.some((p) => p.id === id) ? id : "classic";
  if (valid === "classic") root().removeAttribute("data-palette");
  else root().setAttribute("data-palette", valid);
  write(KEYS.palette, valid);
  return valid;
}
export function applyPattern(id) {
  const valid = PATTERNS.some((p) => p.id === id) ? id : "none";
  if (valid === "none") root().removeAttribute("data-pattern");
  else root().setAttribute("data-pattern", valid);
  write(KEYS.pattern, valid);
  return valid;
}
export function applyPatternStrength(id) {
  const valid = id === "bold" ? "bold" : "subtle";
  if (valid === "bold") root().setAttribute("data-pattern-strength", "bold");
  else root().removeAttribute("data-pattern-strength");
  write(KEYS.strength, valid);
  return valid;
}
export function applyHebrewSize(pct) {
  const valid = HEBREW_SIZES.includes(pct) ? pct : 100;
  root().style.setProperty("--hebrew-scale", String(valid / 100));
  write(KEYS.hebrew, String(valid));
  return valid;
}

function storedHebrewSize() {
  const n = parseInt(read(KEYS.hebrew), 10);
  return HEBREW_SIZES.includes(n) ? n : 100;
}

/** Builds the Appearance panel and wires up the Hebrew size buttons. Call once. */
export function initAppearance() {
  let palette = applyPalette(read(KEYS.palette) || "classic");
  let pattern = applyPattern(read(KEYS.pattern) || "none");
  let strength = applyPatternStrength(read(KEYS.strength) || "subtle");
  let hebrew = applyHebrewSize(storedHebrewSize());

  // ---- Hebrew size ----
  const out = document.getElementById("hebrew-zoom-out");
  const inn = document.getElementById("hebrew-zoom-in");
  const reset = document.getElementById("hebrew-zoom-reset");
  const paintHebrew = () => {
    if (reset) {
      reset.textContent = `Hebrew ${hebrew}%`;
      reset.setAttribute("aria-label", `Hebrew ${hebrew}%, reset Hebrew size`); // the spoken name keeps the visible text
    }
    if (out) out.disabled = hebrew <= HEBREW_SIZES[0];
    if (inn) inn.disabled = hebrew >= HEBREW_SIZES[HEBREW_SIZES.length - 1];
  };
  const stepHebrew = (dir) => {
    const i = HEBREW_SIZES.indexOf(hebrew);
    hebrew = applyHebrewSize(HEBREW_SIZES[Math.max(0, Math.min(HEBREW_SIZES.length - 1, i + dir))]);
    paintHebrew();
  };
  if (out) out.addEventListener("click", () => stepHebrew(-1));
  if (inn) inn.addEventListener("click", () => stepHebrew(1));
  if (reset)
    reset.addEventListener("click", () => {
      hebrew = applyHebrewSize(100);
      paintHebrew();
    });
  paintHebrew();

  // ---- Theme + pattern panel ----
  const host = document.getElementById("appearance-section");
  if (!host) return;
  host.innerHTML = "";
  host.className = "appearance-panel";

  const themeLabel = document.createElement("div");
  themeLabel.className = "sidebar-label";
  themeLabel.textContent = "Theme";
  host.appendChild(themeLabel);

  const swatches = document.createElement("div");
  swatches.className = "theme-swatches";
  swatches.setAttribute("role", "radiogroup");
  swatches.setAttribute("aria-label", "Color theme");
  const swatchButtons = PALETTES.map((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-swatch";
    b.dataset.palette = p.id;
    b.setAttribute("role", "radio");
    b.innerHTML = `<span class="theme-swatch-chips" aria-hidden="true"><i></i><i></i><i></i></span><span>${p.label}</span>`;
    b.addEventListener("click", () => {
      palette = applyPalette(p.id);
      paintPanel();
    });
    swatches.appendChild(b);
    return b;
  });
  host.appendChild(swatches);

  const patternLabel = document.createElement("label");
  patternLabel.className = "sidebar-label";
  patternLabel.htmlFor = "pattern-select";
  patternLabel.textContent = "Background pattern";
  host.appendChild(patternLabel);

  const select = document.createElement("select");
  select.id = "pattern-select";
  select.className = "appearance-select";
  for (const p of PATTERNS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    pattern = applyPattern(select.value);
    paintPanel();
  });
  host.appendChild(select);

  const strengthRow = document.createElement("div");
  strengthRow.className = "a11y-row zoom-buttons appearance-strength";
  strengthRow.setAttribute("role", "group");
  strengthRow.setAttribute("aria-label", "Pattern strength");
  const strengthButtons = [
    ["subtle", "Subtle"],
    ["bold", "Bold"],
  ].map(([id, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "zoom-btn";
    b.textContent = label;
    b.addEventListener("click", () => {
      strength = applyPatternStrength(id);
      paintPanel();
    });
    strengthRow.appendChild(b);
    return [id, b];
  });
  host.appendChild(strengthRow);

  function paintPanel() {
    for (const b of swatchButtons) b.setAttribute("aria-checked", String(b.dataset.palette === palette));
    select.value = pattern;
    strengthRow.hidden = pattern === "none";
    for (const [id, b] of strengthButtons) b.setAttribute("aria-pressed", String(id === strength));
  }
  paintPanel();
}
