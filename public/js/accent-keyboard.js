import { getAccentRows } from "./accent-data.js";

const PLACEHOLDER = "\u25CC"; // ◌ — dotted circle, same convention the dataset's own Symbol column uses to show where a mark attaches.

/** Strip the dotted-circle placeholder(s), leaving the actual
 * combining mark(s)/punctuation that make up an accent's symbol. */
export function stripPlaceholder(symbol) {
  return (symbol || "").split(PLACEHOLDER).join("");
}

/**
 * Every accent's Symbol, deduplicated (several accents — mostly ones
 * that differ only by prose/poetry context — share the exact same
 * mark, e.g. revia / revia gadol / revia qaton are all "◌֗") and kept
 * in first-seen dataset order. Each entry keeps the full "◌"-prefixed
 * symbol exactly as the dataset stores it, so a keyboard button's
 * inserted text always matches a row's Symbol field verbatim.
 */
function uniqueSymbolButtons() {
  const rows = getAccentRows();
  const seen = new Map();
  for (const row of rows) {
    if (!row.Symbol) continue;
    if (!seen.has(row.Symbol)) {
      seen.set(row.Symbol, new Set());
    }
    seen.get(row.Symbol).add(row.EnglishName);
  }
  return [...seen.entries()].map(([symbol, names]) => ({
    symbol,
    title: [...names].join(" / "),
  }));
}

let activeInput = null;
let previewInput = null;

function syncToActiveInput() {
  if (!activeInput || !previewInput) return;
  if (activeInput.value !== previewInput.value) {
    activeInput.value = previewInput.value;
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function insertAtCursor(text) {
  const input = previewInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.focus();
  syncToActiveInput();
}

function backspaceAtCursor() {
  const input = previewInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  if (start === end) {
    if (start === 0) return;
    input.value = input.value.slice(0, start - 1) + input.value.slice(start);
    input.setSelectionRange(start - 1, start - 1);
  } else {
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.setSelectionRange(start, start);
  }
  input.focus();
  syncToActiveInput();
}

function buildKeyGrid() {
  const wrap = document.createElement("div");
  wrap.className = "hebrew-kb-row";

  const rowLabel = document.createElement("div");
  rowLabel.className = "hebrew-kb-row-label";
  rowLabel.textContent = "Accents";
  wrap.appendChild(rowLabel);

  const keysWrap = document.createElement("div");
  keysWrap.className = "hebrew-kb-keys";
  for (const { symbol, title } of uniqueSymbolButtons()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hebrew-kb-key hebrew-kb-key-niqqud";
    btn.textContent = symbol;
    btn.title = title;
    btn.setAttribute("lang", "he");
    btn.addEventListener("click", () => insertAtCursor(symbol));
    keysWrap.appendChild(btn);
  }
  wrap.appendChild(keysWrap);
  return wrap;
}

let initialized = false;

/** Wires up the (already-in-the-DOM) Accent Keyboard modal. Call once. */
export function initAccentKeyboard() {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById("accent-keyboard-modal");
  const body = document.getElementById("accent-keyboard-body");
  const closeBtn = document.getElementById("accent-keyboard-close");

  const previewWrap = document.createElement("div");
  previewWrap.className = "hebrew-kb-preview-wrap";
  const previewLabel = document.createElement("div");
  previewLabel.className = "hebrew-kb-row-label";
  previewLabel.textContent = "Typing";
  previewInput = document.createElement("input");
  previewInput.type = "text";
  previewInput.id = "accent-keyboard-preview";
  previewInput.className = "hebrew-kb-preview";
  previewInput.setAttribute("dir", "rtl");
  previewInput.setAttribute("lang", "he");
  previewInput.addEventListener("input", syncToActiveInput);
  previewWrap.appendChild(previewLabel);
  previewWrap.appendChild(previewInput);
  body.appendChild(previewWrap);

  const hint = document.createElement("div");
  hint.className = "caption";
  hint.style.marginBottom = "10px";
  hint.textContent = "Tap an accent to insert it. Hover a key to see the name(s) it matches.";
  body.appendChild(hint);

  body.appendChild(buildKeyGrid());

  const controlsRow = document.createElement("div");
  controlsRow.className = "hebrew-kb-controls";

  const spaceBtn = document.createElement("button");
  spaceBtn.type = "button";
  spaceBtn.className = "btn btn-outline hebrew-kb-space";
  spaceBtn.textContent = "Space";
  spaceBtn.addEventListener("click", () => insertAtCursor(" "));

  const backspaceBtn = document.createElement("button");
  backspaceBtn.type = "button";
  backspaceBtn.className = "btn btn-outline";
  backspaceBtn.textContent = "⌫ Backspace";
  backspaceBtn.addEventListener("click", backspaceAtCursor);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn btn-secondary";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", () => {
    previewInput.value = "";
    previewInput.focus();
    syncToActiveInput();
  });

  controlsRow.appendChild(spaceBtn);
  controlsRow.appendChild(backspaceBtn);
  controlsRow.appendChild(clearBtn);
  body.appendChild(controlsRow);

  closeBtn.addEventListener("click", closeAccentKeyboard);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAccentKeyboard();
  });
}

export function openAccentKeyboard(inputEl) {
  activeInput = inputEl;
  previewInput.value = inputEl.value;
  document.getElementById("accent-keyboard-modal").classList.remove("hidden");
  previewInput.focus();
  const len = previewInput.value.length;
  previewInput.setSelectionRange(len, len);
}

export function closeAccentKeyboard() {
  syncToActiveInput();
  document.getElementById("accent-keyboard-modal").classList.add("hidden");
  if (activeInput) activeInput.focus();
}

export function isAccentKeyboardOpen() {
  return !document.getElementById("accent-keyboard-modal").classList.contains("hidden");
}
