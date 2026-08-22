// Consonants in standard keyboard-chart order (right-to-left reading
// order doesn't matter here since these are just button labels).
const CONSONANTS = [
  "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל",
  "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת",
];

const FINAL_FORMS = [
  { char: "ך", label: "khaf sofit" },
  { char: "ם", label: "mem sofit" },
  { char: "ן", label: "nun sofit" },
  { char: "ף", label: "pe sofit" },
  { char: "ץ", label: "tsadi sofit" },
];

// The full niqqud (vowel points) + shin/sin dot set. These are
// combining marks — inserting one attaches it to whatever consonant
// precedes the cursor, same as typing them on a real Hebrew keyboard.
const NIQQUD = [
  { char: "\u05B0", label: "Sheva" },
  { char: "\u05B1", label: "Hataf Segol" },
  { char: "\u05B2", label: "Hataf Patah" },
  { char: "\u05B3", label: "Hataf Qamats" },
  { char: "\u05B4", label: "Hiriq" },
  { char: "\u05B5", label: "Tsere" },
  { char: "\u05B6", label: "Segol" },
  { char: "\u05B7", label: "Patah" },
  { char: "\u05B8", label: "Qamats" },
  { char: "\u05B9", label: "Holam" },
  { char: "\u05BB", label: "Qubuts" },
  { char: "\u05BC", label: "Dagesh" },
  { char: "\u05C1", label: "Shin dot" },
  { char: "\u05C2", label: "Sin dot" },
];

// While the modal is open, all typing happens against the visible
// preview box at the top (so the person can actually see what they've
// typed without closing the popup) — `activeInput` is just the real
// page field it stays synced to.
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

function buildKeyRow(label, keys, extraClass = "") {
  const row = document.createElement("div");
  row.className = "hebrew-kb-row";

  const rowLabel = document.createElement("div");
  rowLabel.className = "hebrew-kb-row-label";
  rowLabel.textContent = label;
  row.appendChild(rowLabel);

  const keysWrap = document.createElement("div");
  keysWrap.className = "hebrew-kb-keys";
  for (const key of keys) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `hebrew-kb-key ${extraClass}`.trim();
    btn.textContent = key.char;
    btn.title = key.label || "";
    btn.setAttribute("lang", "he");
    btn.addEventListener("click", () => insertAtCursor(key.char));
    keysWrap.appendChild(btn);
  }
  row.appendChild(keysWrap);
  return row;
}

let initialized = false;

/** Wires up the (already-in-the-DOM) Hebrew keyboard modal. Call once. */
export function initHebrewKeyboard() {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById("hebrew-keyboard-modal");
  const body = document.getElementById("hebrew-keyboard-body");
  const closeBtn = document.getElementById("hebrew-keyboard-close");

  const previewWrap = document.createElement("div");
  previewWrap.className = "hebrew-kb-preview-wrap";
  const previewLabel = document.createElement("div");
  previewLabel.className = "hebrew-kb-row-label";
  previewLabel.textContent = "Typing";
  previewInput = document.createElement("input");
  previewInput.type = "text";
  previewInput.id = "hebrew-keyboard-preview";
  previewInput.className = "hebrew-kb-preview";
  previewInput.setAttribute("dir", "rtl");
  previewInput.setAttribute("lang", "he");
  previewInput.addEventListener("input", syncToActiveInput);
  previewWrap.appendChild(previewLabel);
  previewWrap.appendChild(previewInput);
  body.appendChild(previewWrap);

  body.appendChild(buildKeyRow("Letters", CONSONANTS.map((c) => ({ char: c }))));
  body.appendChild(buildKeyRow("Final forms", FINAL_FORMS, "hebrew-kb-key-final"));
  body.appendChild(buildKeyRow("Niqqud", NIQQUD, "hebrew-kb-key-niqqud"));

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

  closeBtn.addEventListener("click", closeHebrewKeyboard);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeHebrewKeyboard();
  });
}

export function openHebrewKeyboard(inputEl) {
  activeInput = inputEl;
  previewInput.value = inputEl.value;
  document.getElementById("hebrew-keyboard-modal").classList.remove("hidden");
  previewInput.focus();
  const len = previewInput.value.length;
  previewInput.setSelectionRange(len, len);
}

export function closeHebrewKeyboard() {
  syncToActiveInput();
  document.getElementById("hebrew-keyboard-modal").classList.add("hidden");
  if (activeInput) activeInput.focus();
}

export function isHebrewKeyboardOpen() {
  return !document.getElementById("hebrew-keyboard-modal").classList.contains("hidden");
}
