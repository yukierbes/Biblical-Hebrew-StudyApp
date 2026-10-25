import {
  getRootForWord,
  setRootForWord,
  removeRootForWord,
  getRootOptions,
  setRootForRows,
  removeRootFromRows,
  getRootWordCounts,
  renameRoot,
  deleteRoot,
} from "./vocab-roots.js";
import { wrapHebrewSpans } from "./helpers.js";
import { sameRoot } from "./root-search.js";

let openBackdrop = null;
let escHandler = null;

function closeModal() {
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  if (openBackdrop) {
    openBackdrop.remove();
    openBackdrop = null;
  }
}

function makeModalShell(titleText) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "vocab-root-editor-modal";

  const box = document.createElement("div");
  box.className = "modal-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h3");
  title.innerHTML = titleText;
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", closeModal);
  header.appendChild(title);
  header.appendChild(closeBtn);
  box.appendChild(header);

  backdrop.appendChild(box);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  return { backdrop, box };
}

function openModal(backdrop, focusEl) {
  document.body.appendChild(backdrop);
  openBackdrop = backdrop;
  escHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", escHandler);
  if (focusEl) focusEl.focus();
}

function rootDatalist(id) {
  const datalist = document.createElement("datalist");
  datalist.id = id;
  for (const root of getRootOptions()) {
    const opt = document.createElement("option");
    opt.value = root;
    datalist.appendChild(opt);
  }
  return datalist;
}

/**
 * Opens a modal to set (or clear) the single root assigned to `row`.
 * Free-text with autocomplete against existing roots, so typing an
 * existing name reuses it rather than creating a near-duplicate.
 */
export function openRootEditor(row, onSave) {
  closeModal();
  const { backdrop, box } = makeModalShell(`Root: ${wrapHebrewSpans(row.Hebrew || "")}`);

  const englishCaption = document.createElement("div");
  englishCaption.className = "caption";
  englishCaption.style.marginBottom = "12px";
  englishCaption.textContent = row.English || "";
  box.appendChild(englishCaption);

  const datalistId = "vocab-root-options";
  box.appendChild(rootDatalist(datalistId));

  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("dir", "rtl");
  input.setAttribute("list", datalistId);
  input.placeholder = "e.g. שׁמר";
  input.value = getRootForWord(row);
  input.style.width = "100%";
  input.style.padding = "8px 10px";
  input.style.borderRadius = "var(--radius)";
  input.style.border = "1px solid var(--hairline)";
  input.style.marginBottom = "16px";
  input.style.fontFamily = "var(--font-hebrew)";
  input.style.fontSize = "1.1rem";
  box.appendChild(input);

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    setRootForWord(row, input.value);
    closeModal();
    onSave();
  });

  const clearBtn = document.createElement("button");
  clearBtn.className = "btn btn-secondary";
  clearBtn.textContent = "Clear Root";
  clearBtn.addEventListener("click", () => {
    removeRootForWord(row);
    closeModal();
    onSave();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeModal);

  btnRow.appendChild(saveBtn);
  if (getRootForWord(row)) btnRow.appendChild(clearBtn);
  btnRow.appendChild(cancelBtn);
  box.appendChild(btnRow);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveBtn.click();
    }
  });

  openModal(backdrop, input);
}

/**
 * Opens a modal to assign one root to every word in `rows` at once, or clear the root from all of them.
 *
 * Words that already have a DIFFERENT root are listed as conflicts, and you choose what happens to them:
 * keep their root (skip) or replace it. "Show conflicts only" narrows the preview list to just those words.
 * Every change here can be undone afterwards (see undoLastRootChange in vocab-roots.js).
 *
 *   onSave(result)   called after a change: { assigned, skipped, root, cleared }
 *   options.prefill          text to start the root box with (e.g. the letters just searched)
 *   options.conflictDefault  "replace" (the Vocabulary page's long-standing behaviour) or "skip" (Word Lookup)
 */
export function openBulkRootEditor(rows, onSave, { prefill = "", conflictDefault = "replace" } = {}) {
  closeModal();
  const { backdrop, box } = makeModalShell(`Set Root (${rows.length} word${rows.length === 1 ? "" : "s"})`);

  const note = document.createElement("div");
  note.className = "caption";
  note.style.marginBottom = "12px";
  note.textContent = "Each word belongs to one root at a time.";
  box.appendChild(note);

  const datalistId = "vocab-root-options-bulk";
  box.appendChild(rootDatalist(datalistId));

  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("dir", "rtl");
  input.setAttribute("list", datalistId);
  input.placeholder = "e.g. שׁמר";
  input.value = prefill || "";
  input.style.width = "100%";
  input.style.padding = "8px 10px";
  input.style.borderRadius = "var(--radius)";
  input.style.border = "1px solid var(--hairline)";
  input.style.marginBottom = "12px";
  input.style.fontFamily = "var(--font-hebrew)";
  input.style.fontSize = "1.1rem";
  box.appendChild(input);

  // --- conflicts: words that already have a different root ---
  const conflictBox = document.createElement("div");
  conflictBox.className = "root-conflicts";
  conflictBox.style.marginBottom = "12px";
  box.appendChild(conflictBox);
  const state = { choice: conflictDefault === "skip" ? "skip" : "replace", conflictsOnly: false };

  const btnRow = document.createElement("div");
  btnRow.className = "button-row";
  const applyBtn = document.createElement("button");
  applyBtn.className = "btn";
  const clearBtn = document.createElement("button");
  clearBtn.className = "btn btn-secondary";
  clearBtn.textContent = "Clear Root From These";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeModal);
  btnRow.append(applyBtn, clearBtn, cancelBtn);

  /** Which rows already hold a different root than the one typed. */
  const conflictsFor = (value) => {
    const v = value.trim();
    if (!v) return [];
    return rows.filter((r) => {
      const cur = getRootForWord(r);
      return cur && cur !== v && !sameRoot(cur, v);
    });
  };

  function refresh() {
    const value = input.value.trim();
    const conflicts = conflictsFor(value);
    const conflictSet = new Set(conflicts);
    conflictBox.innerHTML = "";
    if (conflicts.length) {
      const msg = document.createElement("div");
      msg.innerHTML = `<b>${conflicts.length} of these ${conflicts.length === 1 ? "word already has" : "words already have"} a different root.</b>`;
      conflictBox.appendChild(msg);
      for (const [id, label] of [
        ["skip", "Skip them — keep the root they have"],
        ["replace", "Replace their root"],
      ]) {
        const lab = document.createElement("label");
        lab.style.display = "block";
        const rb = document.createElement("input");
        rb.type = "radio";
        rb.name = "root-conflict-choice";
        rb.value = id;
        rb.checked = state.choice === id;
        rb.addEventListener("change", () => {
          state.choice = id;
          refresh();
        });
        lab.append(rb, document.createTextNode(" " + label));
        conflictBox.appendChild(lab);
      }
      const only = document.createElement("label");
      only.style.display = "block";
      only.style.marginTop = "6px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.conflictsOnly;
      cb.addEventListener("change", () => {
        state.conflictsOnly = cb.checked;
        refresh();
      });
      only.append(cb, document.createTextNode(" Show conflicts only"));
      conflictBox.appendChild(only);
    }
    // the preview: every word with what it has now and what it will have
    if (value || conflicts.length) {
      const list = document.createElement("div");
      list.className = "root-preview";
      list.style.maxHeight = "190px";
      list.style.overflowY = "auto";
      list.style.marginTop = "8px";
      list.style.border = "1px solid var(--hairline)";
      list.style.borderRadius = "var(--radius)";
      const shown = state.conflictsOnly ? conflicts : rows;
      for (const r of shown) {
        const cur = getRootForWord(r);
        const isConflict = conflictSet.has(r);
        const willChange = value && (!isConflict || state.choice === "replace");
        const line = document.createElement("div");
        line.className = "root-preview-row";
        line.style.padding = "4px 8px";
        line.style.borderBottom = "1px solid var(--hairline)";
        const status = !value ? "" : willChange ? (cur && !sameRoot(cur, value) ? `${wrapHebrewSpans(cur)} → ${wrapHebrewSpans(value)}` : `→ ${wrapHebrewSpans(value)}`) : `keeps ${wrapHebrewSpans(cur)}`;
        line.innerHTML = `${wrapHebrewSpans(r.Hebrew || "")} <span class="caption">${(r.English || "").replace(/</g, "&lt;")}</span> <span class="caption">${status}</span>`;
        if (isConflict) line.dataset.conflict = "1";
        list.appendChild(line);
      }
      if (!shown.length) list.textContent = "No conflicts.";
      conflictBox.appendChild(list);
    }
    const toSet = value ? (state.choice === "skip" ? rows.filter((r) => !conflictSet.has(r)) : rows) : [];
    applyBtn.textContent = `Set Root for ${toSet.length} Word${toSet.length === 1 ? "" : "s"}`;
    applyBtn.disabled = toSet.length === 0;
    applyBtn._toSet = toSet;
    applyBtn._skipped = value ? rows.length - toSet.length : 0;
  }

  applyBtn.addEventListener("click", () => {
    const value = input.value.trim();
    if (!value || !applyBtn._toSet.length) return;
    const toSet = applyBtn._toSet;
    const skipped = applyBtn._skipped;
    setRootForRows(toSet, value);
    closeModal();
    onSave({ assigned: toSet.length, skipped, root: value, cleared: false });
  });
  clearBtn.addEventListener("click", () => {
    removeRootFromRows(rows);
    closeModal();
    onSave({ assigned: 0, skipped: 0, root: "", cleared: true, count: rows.length });
  });
  input.addEventListener("input", refresh);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyBtn.click();
    }
  });
  refresh();
  box.appendChild(btnRow);

  openModal(backdrop, input);
}

/**
 * Lists every root with its current word count; click a root to filter
 * the main table to it, or rename/delete it (affecting every word
 * currently assigned to it).
 */
export function openRootAdmin(allRows, { onSave, onFilterByRoot }) {
  closeModal();
  const { backdrop, box } = makeModalShell("Manage Roots");

  const note = document.createElement("div");
  note.className = "caption";
  note.style.marginBottom = "12px";
  note.textContent =
    "Click a root to filter the table to it. Renaming or deleting affects every word currently in that root.";
  box.appendChild(note);

  const listWrap = document.createElement("div");
  listWrap.style.maxHeight = "340px";
  listWrap.style.overflowY = "auto";
  box.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = "";
    const options = getRootOptions();
    const counts = getRootWordCounts(allRows);

    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "caption";
      empty.textContent = "No roots assigned yet — use Edit next to a word, or select rows and Set Root.";
      listWrap.appendChild(empty);
      return;
    }

    for (const root of options) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 0";
      row.style.borderBottom = "1px solid var(--hairline)";

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "btn btn-secondary btn-sm";
      nameBtn.style.flex = "1";
      nameBtn.style.textAlign = "left";
      nameBtn.style.fontFamily = "var(--font-hebrew)";
      nameBtn.innerHTML = `${wrapHebrewSpans(root)} <span class="caption">(${counts.get(root) || 0})</span>`;
      nameBtn.addEventListener("click", () => {
        closeModal();
        onFilterByRoot(root);
      });

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "btn btn-outline btn-sm";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", () => {
        const next = window.prompt(`Rename root "${root}" to:`, root);
        if (next && next.trim() && next.trim() !== root) {
          renameRoot(allRows, root, next.trim());
          renderList();
          onSave();
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-secondary btn-sm";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        const count = counts.get(root) || 0;
        const ok = window.confirm(
          `Delete root "${root}"? It will be cleared from ${count} word${count === 1 ? "" : "s"}. This can't be undone.`
        );
        if (ok) {
          deleteRoot(allRows, root);
          renderList();
          onSave();
        }
      });

      row.appendChild(nameBtn);
      row.appendChild(renameBtn);
      row.appendChild(deleteBtn);
      listWrap.appendChild(row);
    }
  }
  renderList();

  const closeRow = document.createElement("div");
  closeRow.className = "button-row";
  closeRow.style.marginTop = "14px";
  const doneBtn = document.createElement("button");
  doneBtn.className = "btn btn-secondary";
  doneBtn.textContent = "Close";
  doneBtn.addEventListener("click", closeModal);
  closeRow.appendChild(doneBtn);
  box.appendChild(closeRow);

  openModal(backdrop);
}
