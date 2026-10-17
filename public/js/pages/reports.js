// Mistake Reports: the owner's private review page (#reports).
//
// Students flag items with the ⚑ button; the flags land here, grouped by item so a word
// reported by several students shows once with a count. For each item the owner sees who
// said what, which source file to edit, and can mark it Fixed, Dismiss it, reopen it, or
// delete it. "Copy open reports" puts them on the clipboard as CSV for a spreadsheet.
//
// Only the owner can load the data (the server refuses anyone else), so a student who
// somehow opens #reports just sees a short message.

import { fetchReports, setReportStatus, deleteReport, groupReports, reportsToCsv, REPORT_SOURCE_FILES } from "../reports.js";
import { PERSONAL_AREAS } from "../personal.js";

const state = { reports: [], filter: "open", loading: true, error: "" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_LABEL = { open: "Open", fixed: "Fixed", dismissed: "Dismissed" };

function visibleReports() {
  return state.filter === "all" ? state.reports : state.reports.filter((r) => r.status === state.filter);
}

function groupHtml(g) {
  const areaName = (PERSONAL_AREAS[g.area] || {}).label || g.area;
  const source = REPORT_SOURCE_FILES[g.area] || "";
  const rows = g.reports
    .map(
      (r) => `
      <div class="rep-report rep-${esc(r.status)}" data-id="${esc(r.id)}">
        <div class="rep-reason"><b>${esc(r.reason || "No reason given")}</b>${r.note ? `<div class="rep-note" dir="auto">${esc(r.note)}</div>` : ""}</div>
        <div class="rep-meta">${esc(r.reporter || "unknown")} · ${esc(formatDate(r.createdAt))} · <span class="rep-status">${esc(STATUS_LABEL[r.status] || r.status)}</span></div>
        <div class="rep-actions">
          ${r.status !== "fixed" ? `<button type="button" class="btn btn-outline btn-sm" data-act="fixed">Mark fixed</button>` : ""}
          ${r.status !== "dismissed" ? `<button type="button" class="btn btn-outline btn-sm" data-act="dismissed">Dismiss</button>` : ""}
          ${r.status !== "open" ? `<button type="button" class="btn btn-outline btn-sm" data-act="open">Reopen</button>` : ""}
          <button type="button" class="btn btn-outline btn-sm rep-delete" data-act="delete">Delete</button>
        </div>
      </div>`
    )
    .join("");
  return `
    <section class="rep-group pm-card">
      <div class="rep-group-head">
        <div class="rep-item" dir="auto">${esc(g.itemLabel || g.itemKey)}</div>
        <div class="caption">${esc(areaName)}${source ? ` · fix in <code>${esc(source)}</code>` : ""} · ${g.reports.length} ${g.reports.length === 1 ? "report" : "reports"}${g.openCount ? `, ${g.openCount} open` : ""}</div>
      </div>
      ${rows}
    </section>`;
}

function render(content) {
  if (state.loading) {
    content.innerHTML = `<h1 class="page-title">Mistake Reports</h1><p class="caption">Loading…</p>`;
    return;
  }
  if (state.error) {
    content.innerHTML = `<h1 class="page-title">Mistake Reports</h1><div class="alert alert-warning">${esc(state.error)}</div>`;
    return;
  }

  const counts = { open: 0, fixed: 0, dismissed: 0 };
  state.reports.forEach((r) => {
    counts[r.status] = (counts[r.status] || 0) + 1;
  });
  const groups = groupReports(visibleReports());

  const filters = [
    ["open", `Open (${counts.open})`],
    ["fixed", `Fixed (${counts.fixed})`],
    ["dismissed", `Dismissed (${counts.dismissed})`],
    ["all", `All (${state.reports.length})`],
  ]
    .map(([id, label]) => `<button type="button" class="choice-btn${state.filter === id ? " selected" : ""}" data-filter="${id}" aria-pressed="${state.filter === id}">${esc(label)}</button>`)
    .join("");

  content.innerHTML = `
    <h1 class="page-title">Mistake Reports</h1>
    <p class="caption">Flags from students, grouped by item. Only you can see this page.</p>
    <div class="rep-toolbar">
      <div class="choice-group">${filters}</div>
      <button type="button" class="btn btn-outline btn-sm" id="rep-copy"${counts.open ? "" : " disabled"}>Copy open reports (CSV)</button>
      <button type="button" class="btn btn-outline btn-sm" id="rep-refresh">Refresh</button>
    </div>
    <div id="rep-copy-note" class="caption" role="status"></div>
    ${groups.length ? groups.map(groupHtml).join("") : `<div class="alert alert-info">${state.filter === "open" ? "No open reports. Nothing to fix right now." : "Nothing here."}</div>`}
  `;
}

async function load(content) {
  state.loading = true;
  state.error = "";
  render(content);
  try {
    state.reports = await fetchReports();
  } catch (e) {
    state.error = e.message || "Could not load the reports.";
  }
  state.loading = false;
  render(content);
}

let mountedContent = null;
let onClick = null;

export function mount({ content }) {
  state.filter = "open";
  load(content);

  mountedContent = content;
  onClick = async (e) => {
    const filterBtn = e.target.closest("[data-filter]");
    if (filterBtn) {
      state.filter = filterBtn.dataset.filter;
      render(content);
      return;
    }
    if (e.target.closest("#rep-refresh")) {
      load(content);
      return;
    }
    if (e.target.closest("#rep-copy")) {
      const csv = reportsToCsv(state.reports.filter((r) => r.status === "open"));
      const note = content.querySelector("#rep-copy-note");
      try {
        await navigator.clipboard.writeText(csv);
        if (note) note.textContent = "Copied. Paste it into a spreadsheet.";
      } catch (err) {
        if (note) note.textContent = "Couldn't copy automatically. Your browser blocked clipboard access.";
      }
      return;
    }
    const actBtn = e.target.closest("[data-act]");
    if (!actBtn) return;
    const card = actBtn.closest("[data-id]");
    const id = card && card.dataset.id;
    const report = state.reports.find((r) => r.id === id);
    if (!report) return;
    actBtn.disabled = true;
    try {
      if (actBtn.dataset.act === "delete") {
        if (!window.confirm("Delete this report for good?")) {
          actBtn.disabled = false;
          return;
        }
        await deleteReport(id);
        state.reports = state.reports.filter((r) => r.id !== id);
      } else {
        await setReportStatus(id, actBtn.dataset.act);
        report.status = actBtn.dataset.act;
      }
      render(content);
    } catch (err) {
      actBtn.disabled = false;
      const note = content.querySelector("#rep-copy-note");
      if (note) note.textContent = "That didn't save: " + err.message;
    }
  };
  content.addEventListener("click", onClick);
}

// #content is shared by every page, so the listener must come off when leaving.
export function unmount() {
  if (mountedContent && onClick) mountedContent.removeEventListener("click", onClick);
  mountedContent = null;
  onClick = null;
}
