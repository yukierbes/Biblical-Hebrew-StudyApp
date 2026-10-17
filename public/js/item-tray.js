// The item tray: three quiet buttons that sit beside any study item.
//
//   ☆ / ★  star the item (adds it to the student's list)
//   ✎      write or edit the student's own note (a memory trick)
//   ⚑      report a mistake in the item to the owner
//
// The buttons are small and faint until the student hovers or focuses them (on a phone they
// sit at a calm, constant strength), so the study screen stays uncluttered. Both dialogs open
// over the page (appended to <body>), so a page redrawing itself underneath never loses what
// the student was typing.
//
// `spec` describes the item:
//   { area, key, label }
//     area  — one of the personal.js areas ("vocab", "consonants", "vowels", "accents", "verbs")
//     key   — the item's stable key (the same one the spaced-repetition schedule uses)
//     label — plain text naming the item, e.g. "אֶל — unto, into" (shown in the dialogs and
//             stored with a report so the owner can recognise it)
//   optional: reportKey / reportLabel when a report should name something other than the starred
//   item (e.g. one verb table, while the star belongs to the verb root).

import { isStarred, toggleStar, getNote, setNote, getEntries, MAX_NOTE_LENGTH, PERSONAL_AREAS } from "./personal.js";
import { REPORT_REASONS, submitReport } from "./reports.js";
import { showToast } from "./toast.js";

const REPORT_NOTE_MAX = 300;

// ---------------------------------------------------------------------
// Dialog shell
// ---------------------------------------------------------------------

let openDialogEl = null;
let openerEl = null;

export function closeItemDialog() {
  if (!openDialogEl) return;
  openDialogEl.remove();
  openDialogEl = null;
  if (openerEl && document.body.contains(openerEl)) {
    try {
      openerEl.focus();
    } catch (e) {
      /* element gone */
    }
  }
  openerEl = null;
}

function openDialog({ title, itemLabel, opener, build }) {
  closeItemDialog();
  openerEl = opener || null;

  const backdrop = document.createElement("div");
  backdrop.className = "item-dialog-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "item-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const h = document.createElement("h3");
  h.className = "item-dialog-title";
  h.textContent = title;
  dialog.appendChild(h);

  if (itemLabel) {
    const l = document.createElement("div");
    l.className = "item-dialog-item";
    l.setAttribute("dir", "auto");
    l.textContent = itemLabel;
    dialog.appendChild(l);
  }

  const focusTarget = build(dialog, closeItemDialog);
  backdrop.appendChild(dialog);

  // Clicks outside the card close it; keys typed inside never reach the page's shortcuts.
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) closeItemDialog();
  });
  backdrop.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") closeItemDialog();
  });
  backdrop.addEventListener("keyup", (e) => e.stopPropagation());
  backdrop.addEventListener("keypress", (e) => e.stopPropagation());

  document.body.appendChild(backdrop);
  openDialogEl = backdrop;
  if (focusTarget && focusTarget.focus) focusTarget.focus();
  return dialog;
}

function actionRow(...buttons) {
  const row = document.createElement("div");
  row.className = "item-dialog-actions";
  buttons.forEach((b) => row.appendChild(b));
  return row;
}

function button(text, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

// ---------------------------------------------------------------------
// The note dialog
// ---------------------------------------------------------------------

export function openNoteDialog(spec, { opener, onSaved } = {}) {
  const areaInfo = PERSONAL_AREAS[spec.area];
  openDialog({
    title: "My note",
    itemLabel: spec.label,
    opener,
    build(dialog, close) {
      const help = document.createElement("p");
      help.className = "caption";
      help.textContent = "A memory trick only you see. It shows up while you study this " + (areaInfo ? areaInfo.itemWord : "item") + ".";
      dialog.appendChild(help);

      const ta = document.createElement("textarea");
      ta.className = "item-dialog-text";
      ta.rows = 4;
      ta.maxLength = MAX_NOTE_LENGTH;
      ta.setAttribute("aria-label", "My note");
      ta.placeholder = "e.g. it looks like a little house";
      ta.value = getNote(spec.area, spec.key);
      dialog.appendChild(ta);

      const save = (text) => {
        const stored = setNote(spec.area, spec.key, text);
        if (onSaved) onSaved(stored);
        close();
      };
      const saveBtn = button("Save", "btn btn-primary btn-sm", () => save(ta.value));
      const cancelBtn = button("Cancel", "btn btn-outline btn-sm", close);
      const buttons = [saveBtn, cancelBtn];
      if (ta.value) buttons.push(button("Delete note", "btn btn-outline btn-sm item-dialog-danger", () => save("")));
      dialog.appendChild(actionRow(...buttons));

      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(ta.value);
      });
      return ta;
    },
  });
}

// ---------------------------------------------------------------------
// The report dialog
// ---------------------------------------------------------------------

export function openReportDialog(spec, { opener } = {}) {
  const reasons = REPORT_REASONS[spec.area] || ["Something else"];
  openDialog({
    title: "Report a mistake",
    itemLabel: spec.reportLabel || spec.label,
    opener,
    build(dialog, close) {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "item-dialog-reasons";
      const legend = document.createElement("legend");
      legend.textContent = "What looks wrong?";
      fieldset.appendChild(legend);
      reasons.forEach((reason, i) => {
        const label = document.createElement("label");
        label.className = "item-dialog-reason";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "report-reason";
        radio.value = reason;
        if (i === 0 && reasons.length === 1) radio.checked = true;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(" " + reason));
        fieldset.appendChild(label);
      });
      dialog.appendChild(fieldset);

      const ta = document.createElement("textarea");
      ta.className = "item-dialog-text";
      ta.rows = 3;
      ta.maxLength = REPORT_NOTE_MAX;
      ta.setAttribute("aria-label", "Details (optional)");
      ta.placeholder = "Details, and what it should say (optional)";
      dialog.appendChild(ta);

      const error = document.createElement("div");
      error.className = "item-dialog-error";
      error.setAttribute("role", "alert");
      dialog.appendChild(error);

      const send = button("Send report", "btn btn-primary btn-sm", async () => {
        const chosen = fieldset.querySelector("input:checked");
        if (!chosen) {
          error.textContent = "Please choose what looks wrong.";
          return;
        }
        send.disabled = true;
        const result = await submitReport({
          area: spec.area,
          itemKey: spec.reportKey || spec.key,
          itemLabel: spec.reportLabel || spec.label,
          reason: chosen.value,
          note: ta.value,
        });
        if (result.rejected) {
          send.disabled = false;
          error.textContent = result.error || "That report couldn't be saved.";
          return;
        }
        close();
        showToast({
          icon: "⚑",
          title: "Thank you!",
          body: result.queued ? "Saved. It will be sent when you're back online." : "Your report was sent.",
          duration: 3500,
        });
      });
      dialog.appendChild(actionRow(send, button("Cancel", "btn btn-outline btn-sm", close)));
      return fieldset.querySelector("input");
    },
  });
}

// ---------------------------------------------------------------------
// The tray for one item (cards, prompts, feedback)
// ---------------------------------------------------------------------

function starText(on) {
  return on ? "★" : "☆";
}

function setStarButton(btn, on) {
  btn.textContent = starText(on);
  btn.classList.toggle("is-on", on);
  btn.setAttribute("aria-pressed", String(on));
  btn.title = on ? "Remove from my list" : "Add to my list";
  btn.setAttribute("aria-label", btn.title);
}

function setNoteButton(btn, note) {
  btn.classList.toggle("is-on", !!note);
  btn.title = note ? "My note: " + note : "Add my own note";
  btn.setAttribute("aria-label", note ? "Edit my note" : "Add my own note");
}

/**
 * Builds the tray for one item. Returns a wrapper element holding the buttons and, when
 * `showNote` is true and the student has a note, the note itself beneath them.
 *
 *   options.personal  — include ☆ and ✎ (default true)
 *   options.report    — include ⚑ (default true)
 *   options.showNote  — show the saved note under the buttons (default true; pass false
 *                       before an answer is revealed so a note can't give it away)
 */
export function createItemTray(spec, { personal = true, report = true, showNote = true } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "item-tray-wrap";
  const tray = document.createElement("div");
  tray.className = "item-tray";
  wrap.appendChild(tray);

  const noteLine = document.createElement("div");
  noteLine.className = "item-note-line";
  noteLine.setAttribute("dir", "auto");

  if (personal) {
    const star = document.createElement("button");
    star.type = "button";
    star.className = "item-btn item-star";
    setStarButton(star, isStarred(spec.area, spec.key));
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      setStarButton(star, toggleStar(spec.area, spec.key));
    });
    tray.appendChild(star);

    const noteBtn = document.createElement("button");
    noteBtn.type = "button";
    noteBtn.className = "item-btn item-notebtn";
    noteBtn.textContent = "✎";
    const current = getNote(spec.area, spec.key);
    setNoteButton(noteBtn, current);
    noteLine.textContent = current;
    noteLine.hidden = !(showNote && current);
    noteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openNoteDialog(spec, {
        opener: noteBtn,
        onSaved: (stored) => {
          setNoteButton(noteBtn, stored);
          noteLine.textContent = stored;
          noteLine.hidden = !(showNote && stored);
        },
      });
    });
    tray.appendChild(noteBtn);
  }

  if (report) {
    const flag = document.createElement("button");
    flag.type = "button";
    flag.className = "item-btn item-report";
    flag.textContent = "⚑";
    flag.title = "Report a mistake";
    flag.setAttribute("aria-label", "Report a mistake");
    flag.addEventListener("click", (e) => {
      e.stopPropagation();
      openReportDialog(spec, { opener: flag });
    });
    tray.appendChild(flag);
  }

  if (personal) wrap.appendChild(noteLine);
  return wrap;
}

// ---------------------------------------------------------------------
// A column of trays for a review table
// ---------------------------------------------------------------------

/**
 * Adds a leading column of compact trays (and optionally a "My note" column) to the
 * `.custom-table` inside `container`. `rows` must be in the same order as the table's body
 * rows; `specFn(row)` returns the item's spec. One click handler serves the whole table,
 * and the saved stars and notes are read once, so a 2,000-row table stays quick.
 * The columns are hidden when printing.
 */
export function addTrayColumn(container, rows, specFn, { noteColumn = true } = {}) {
  const table = container.querySelector("table.custom-table");
  if (!table || !rows || rows.length === 0) return;
  const trs = table.querySelectorAll("tbody tr");
  const specs = rows.map(specFn);
  const area = specs[0].area;
  const entries = getEntries(area);

  const headRow = table.querySelector("thead tr");
  const th = document.createElement("th");
  th.className = "tray-col";
  th.textContent = "★";
  th.title = "Add to my list · note · report a mistake";
  headRow.insertBefore(th, headRow.firstChild);
  let noteTh = null;
  if (noteColumn) {
    noteTh = document.createElement("th");
    noteTh.className = "note-col";
    noteTh.textContent = "My note";
    headRow.appendChild(noteTh);
  }

  trs.forEach((tr, i) => {
    const spec = specs[i];
    if (!spec) return;
    const entry = entries[spec.key] || {};
    tr.dataset.trayIndex = String(i);

    const td = document.createElement("td");
    td.className = "tray-col";
    const tray = document.createElement("div");
    tray.className = "item-tray item-tray-row";
    const star = document.createElement("button");
    star.type = "button";
    star.className = "item-btn item-star";
    setStarButton(star, !!entry.s);
    const note = document.createElement("button");
    note.type = "button";
    note.className = "item-btn item-notebtn";
    note.textContent = "✎";
    setNoteButton(note, entry.n || "");
    const flag = document.createElement("button");
    flag.type = "button";
    flag.className = "item-btn item-report";
    flag.textContent = "⚑";
    flag.title = "Report a mistake";
    flag.setAttribute("aria-label", "Report a mistake");
    tray.append(star, note, flag);
    td.appendChild(tray);
    tr.insertBefore(td, tr.firstChild);

    if (noteColumn) {
      const nt = document.createElement("td");
      nt.className = "note-col";
      nt.setAttribute("dir", "auto");
      nt.textContent = entry.n || "";
      tr.appendChild(nt);
    }
  });

  table.addEventListener("click", (e) => {
    const btn = e.target.closest(".item-btn");
    if (!btn || !table.contains(btn)) return;
    const tr = btn.closest("tr");
    const spec = specs[Number(tr && tr.dataset.trayIndex)];
    if (!spec) return;
    if (btn.classList.contains("item-star")) {
      setStarButton(btn, toggleStar(spec.area, spec.key));
    } else if (btn.classList.contains("item-notebtn")) {
      openNoteDialog(spec, {
        opener: btn,
        onSaved: (stored) => {
          setNoteButton(btn, stored);
          const nt = tr.querySelector("td.note-col");
          if (nt) nt.textContent = stored;
        },
      });
    } else if (btn.classList.contains("item-report")) {
      openReportDialog(spec, { opener: btn });
    }
  });
}
