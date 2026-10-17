// "Report a mistake": sending a flag to the owner, and (for the owner only) reading them.
//
// Students: submitReport() posts to the report function. If the device is offline or the
// request fails, the report waits in a small queue (localStorage, NOT synced) and is retried
// the next time the app loads or the window regains focus, so a flag is never lost.
//
// Owner: fetchIsAdmin() asks the server whether the signed-in account is the owner; only
// then does the sidebar show the "Reports" link. The server enforces it: students get a
// 403 for everything except adding a report.

import { authFetch } from "./auth-fetch.js";

const ENDPOINT = "/.netlify/functions/report";
const QUEUE_KEY = "hebrewVerbQueue:reports"; // deliberately not under hebrewVerbApp: (stays on this device)
const MAX_QUEUE = 30;

/** The reasons offered in the report dialog, per area. The last one is always "Something else". */
export const REPORT_REASONS = {
  vocab: ["The Hebrew is wrong (spelling or vowels)", "The English meaning is wrong", "The lesson, part of speech or frequency is wrong", "Something else"],
  consonants: ["The name or pronunciation is wrong", "The form or keyboard key is wrong", "Something else"],
  vowels: ["The name, length or pronunciation is wrong", "The form or keyboard key is wrong", "Something else"],
  accents: ["The name is wrong", "The symbol or example placement is wrong", "The type or group is wrong", "Something else"],
  verbs: ["A form in the table is wrong", "A label (binyan, mode, person, gender, number) is wrong", "The translation is wrong", "Something else"],
};

/** Which source file the owner edits to fix each area (shown on the review page). */
export const REPORT_SOURCE_FILES = {
  vocab: "data-source/vocabulary.csv",
  consonants: "data-source/consonants.csv",
  vowels: "data-source/vowels.csv",
  accents: "data-source/accents.csv",
  verbs: "data-source (verb paradigms)",
};

function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(q) ? q : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(q) {
  try {
    if (q.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch (e) {
    /* storage unavailable — the report is simply not kept if sending fails */
  }
}

export function queuedReportCount() {
  return readQueue().length;
}

async function post(body) {
  const res = await authFetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch (e) {
      /* keep the generic message */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Sends one report. Resolves { sent: true } or { queued: true } (will retry later).
 * A report the server rejects as invalid (400) is dropped rather than queued forever.
 */
export async function submitReport(report) {
  const body = {
    area: report.area,
    itemKey: report.itemKey,
    itemLabel: report.itemLabel,
    reason: report.reason,
    note: report.note,
    page: report.page || (typeof location !== "undefined" ? location.hash.replace("#", "") : ""),
  };
  try {
    await post(body);
    return { sent: true };
  } catch (e) {
    if (e.status === 400 || e.status === 429) return { sent: false, rejected: true, error: e.message };
    writeQueue([...readQueue(), body]);
    return { queued: true };
  }
}

let flushing = false;
/** Tries to send anything waiting in the queue; stops at the first failure. */
export async function flushReportQueue() {
  if (flushing) return 0;
  const queue = readQueue();
  if (queue.length === 0) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const body of queue) {
      try {
        await post(body);
        sent++;
      } catch (e) {
        if (e.status !== 400 && e.status !== 429) break; // network or server trouble: keep the rest for later
        sent++; // invalid or over the limit: drop it
      }
    }
  } finally {
    writeQueue(queue.slice(sent));
    flushing = false;
  }
  return sent;
}

/** Retries the queue now, and again whenever the window regains focus or comes back online. */
export function initReportQueue() {
  flushReportQueue().catch(() => {});
  if (typeof window === "undefined") return;
  window.addEventListener("focus", () => flushReportQueue().catch(() => {}));
  window.addEventListener("online", () => flushReportQueue().catch(() => {}));
}

// ---------------------------------------------------------------------
// Owner only
// ---------------------------------------------------------------------

let adminCache = null;

/** True when the signed-in account is the owner. Any error counts as "no". */
export async function fetchIsAdmin() {
  if (adminCache !== null) return adminCache;
  try {
    const res = await authFetch(`${ENDPOINT}?whoami=1`);
    if (!res.ok) return false;
    adminCache = !!(await res.json()).admin;
    return adminCache;
  } catch (e) {
    return false;
  }
}

export async function fetchReports() {
  const res = await authFetch(ENDPOINT);
  if (!res.ok) {
    let message = `Could not load reports (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch (e) {
      /* generic */
    }
    throw new Error(message);
  }
  return (await res.json()).reports || [];
}

export const setReportStatus = (id, status) => post({ action: "status", id, status });
export const deleteReport = (id) => post({ action: "delete", id });

/** Groups reports by item (same area + item), items with the most open reports first. */
export function groupReports(reports) {
  const groups = new Map();
  for (const r of reports) {
    const id = `${r.area}::${r.itemKey}`;
    if (!groups.has(id)) groups.set(id, { id, area: r.area, itemKey: r.itemKey, itemLabel: r.itemLabel, reports: [] });
    groups.get(id).reports.push(r);
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    g.openCount = g.reports.filter((r) => r.status === "open").length;
    g.latest = g.reports[0].createdAt || 0;
  }
  return out.sort((a, b) => b.openCount - a.openCount || b.latest - a.latest);
}

/** The open reports as CSV text, for pasting into a spreadsheet. */
export function reportsToCsv(reports) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Area", "Item", "Reason", "Note", "Reporter", "Date", "Status"];
  const rows = reports.map((r) => [
    r.area,
    r.itemLabel || r.itemKey,
    r.reason,
    r.note,
    r.reporter,
    r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
    r.status,
  ]);
  return [header, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
}
