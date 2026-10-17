// POST /.netlify/functions/report                 body { area, itemKey, itemLabel, reason, note, page }
//        -> saves one "report a mistake" from the signed-in student.
// GET  /.netlify/functions/report?whoami=1        -> { admin: true|false }  (does the review page apply to me?)
// GET  /.netlify/functions/report                 -> { reports: [...] }     (owner only)
// POST /.netlify/functions/report                 body { action: "status", id, status }  (owner only)
//        A student is limited to a few reports a day and a total (report-logic.js); over it -> 429.
// POST /.netlify/functions/report                 body { action: "delete", id }          (owner only)
//
// Reports live in their own Netlify Blobs store, one small record per report, separate from
// the students' progress. Students can only ADD reports; reading, closing and deleting them
// is limited to the owner (OWNER_EMAIL environment variable, or the Identity role "admin").
// It uses the same BLOBS_SITE_ID / BLOBS_TOKEN variables as sync.js.

import { getStore } from "@netlify/blobs";
import { sanitizeReport, isAdmin, makeReportKey, checkReportLimit, REPORT_STATUSES } from "./report-logic.js";

const STORE_NAME = "hebrew-verb-app-reports";
const MAX_LISTED = 1000;

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function getReportStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error("Missing BLOBS_SITE_ID / BLOBS_TOKEN environment variables (see README).");
  }
  return getStore({ name: STORE_NAME, siteID, token });
}

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) return json(401, { error: "Sign in required." });

  const admin = isAdmin(user, process.env);

  try {
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      if (qs.whoami) return json(200, { admin });
      if (!admin) return json(403, { error: "Only the owner can open the reports." });

      const store = getReportStore();
      const { blobs } = await store.list({ prefix: "r-" });
      const keys = blobs.map((b) => b.key).sort().reverse().slice(0, MAX_LISTED);
      const reports = [];
      for (let i = 0; i < keys.length; i += 25) {
        const chunk = await Promise.all(keys.slice(i, i + 25).map((k) => store.get(k, { type: "json" })));
        chunk.forEach((r, j) => r && reports.push({ id: keys[i + j], ...r }));
      }
      return json(200, { reports });
    }

    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return json(400, { error: "Invalid JSON body." });
      }

      if (body.action === "status" || body.action === "delete") {
        if (!admin) return json(403, { error: "Only the owner can change reports." });
        const id = String(body.id || "");
        if (!/^r-[0-9]{14}-[0-9a-z]+$/.test(id)) return json(400, { error: "Bad report id." });
        const store = getReportStore();
        if (body.action === "delete") {
          await store.delete(id);
          return json(200, { ok: true });
        }
        if (!REPORT_STATUSES.includes(body.status)) return json(400, { error: "Bad status." });
        const existing = await store.get(id, { type: "json" });
        if (!existing) return json(404, { error: "Report not found." });
        await store.set(id, JSON.stringify({ ...existing, status: body.status, updatedAt: Date.now() }));
        return json(200, { ok: true });
      }

      const { report, error } = sanitizeReport(body);
      if (error) return json(400, { error });
      const store = getReportStore();
      // Per-student limits (see report-logic.js). The owner is not limited.
      const counterKey = "u-" + String(user.sub || user.email || "unknown").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
      const day = new Date().toISOString().slice(0, 10);
      let counter = null;
      if (!admin) {
        const check = checkReportLimit(await store.get(counterKey, { type: "json" }), report.itemKey, day);
        if (!check.ok) return json(check.status, { error: check.error });
        counter = check.counter;
      }
      const record = {
        ...report,
        status: "open",
        createdAt: Date.now(),
        reporter: String(user.email || user.sub || "").slice(0, 120),
      };
      await store.set(makeReportKey(), JSON.stringify(record));
      if (counter) await store.set(counterKey, JSON.stringify(counter));
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (e) {
    return json(500, { error: "Report failed: " + e.message });
  }
};
