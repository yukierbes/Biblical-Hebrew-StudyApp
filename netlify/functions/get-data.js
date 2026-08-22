// GET /.netlify/functions/get-data?dataset=verbs|vocabulary|accents
//
// Requires a signed-in Netlify Identity user (any invited user — no
// specific role needed, since registration is invite-only already).
// The datasets themselves live at netlify/functions/data/*.json —
// inside the Function's own bundle, never inside public/ (the site's
// publish directory) — so there is no plain URL that serves them
// without going through this auth check first.
//
// Classic (Lambda-compatible) function, same reasoning as sync.js: this
// format is what gets `context.clientContext.user` populated from the
// Identity JWT automatically.

import { createRequire } from "node:module";

// A plain CommonJS require() reads JSON with zero import-syntax version
// concerns (unlike ESM JSON import attributes, whose exact syntax has
// shifted across Node versions) — the most portable way to pull these
// files into the bundle.
const require = createRequire(import.meta.url);

const LOADERS = {
  verbs: () => require("./data/verbs.json"),
  vocabulary: () => require("./data/vocabulary.json"),
  accents: () => require("./data/accents.json"),
};

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Sign in required." }),
    };
  }

  const dataset = (event.queryStringParameters || {}).dataset;
  const loader = LOADERS[dataset];
  if (!loader) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Unknown dataset "${dataset}". Expected verbs, vocabulary, or accents.` }),
    };
  }

  try {
    const data = loader();
    return {
      statusCode: 200,
      // Cached only in the requester's own browser (never a shared/CDN
      // cache), since the response requires their personal auth token.
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to load dataset: " + e.message }),
    };
  }
};
