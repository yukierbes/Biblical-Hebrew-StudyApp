// GET  /.netlify/functions/sync  -> { snapshot, meta, updatedAt } for the signed-in user (or empty if none yet)
// POST /.netlify/functions/sync  -> body { v: 2, snapshot, meta, known }: only the saved items that changed on this
//                                    device. Merges them into what is stored (per item, the newest change wins) and
//                                    answers with only what this device is missing. An older copy of the app that
//                                    sends a whole { snapshot, meta } still works and gets the whole merged copy back.
//                                    The stored copy is only rewritten when something changed.
//
// This is a classic (Lambda-compatible) Netlify Function, not an Edge
// Function — that distinction matters here because Netlify Identity only
// auto-populates `context.clientContext.user` (from the request's Identity
// JWT) for classic Functions. No manual token verification needed.
//
// Requires Netlify Identity to be enabled for this site (Site settings →
// Identity → Enable) and `@netlify/blobs` available at deploy (see
// package.json).
//
// Netlify's zero-config Blobs setup (getStore("name") with no
// credentials) isn't reliable for classic/Lambda-compatible functions —
// the same format Identity requires — so this passes siteID/token
// explicitly instead, read from two environment variables you set in
// Site configuration → Environment variables: BLOBS_SITE_ID and
// BLOBS_TOKEN. See the README's Cloud sync section for exactly how to
// find/create those.

import { getStore } from "@netlify/blobs";
import { processSyncPost } from "./merge-logic.js";

const STORE_NAME = "hebrew-verb-app-sync";

function getBlobsStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      "Missing BLOBS_SITE_ID / BLOBS_TOKEN environment variables — set them in Site configuration → Environment variables (see README)."
    );
  }
  return getStore({ name: STORE_NAME, siteID, token });
}

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Sign in required." }),
    };
  }

  const blobKey = user.sub;

  try {
    const store = getBlobsStore();

    if (event.httpMethod === "GET") {
      const existing = (await store.get(blobKey, { type: "json" })) || { snapshot: {}, meta: {}, updatedAt: 0 };
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(existing) };
    }

    if (event.httpMethod === "POST") {
      let incoming;
      try {
        incoming = JSON.parse(event.body || "{}");
      } catch (e) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid JSON body." }),
        };
      }

      // What is stored for this person (or null the first time). The rules for merging, and for answering with only
      // what the device is missing, live in merge-logic.js so they can be tested without Netlify.
      const existing = (await store.get(blobKey, { type: "json" })) || null;
      const { status, response, toStore } = processSyncPost(incoming, existing);

      // Only rewrite the stored copy when something actually changed.
      if (toStore) await store.set(blobKey, JSON.stringify(toStore));
      return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) };
    }

    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Sync failed: " + e.message }),
    };
  }
};
