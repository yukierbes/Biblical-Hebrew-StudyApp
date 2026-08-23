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
//
// The three datasets are imported statically below, using the standard
// JSON import-attribute syntax, rather than loaded at request time via
// createRequire(import.meta.url) — that approach crashed in Netlify's
// deployed function environment with "The argument 'filename' must be
// a file URL object... Received undefined", because import.meta.url
// comes back undefined there. A static import has no such dependency.
import verbsData from "./data/verbs.json" with { type: "json" };
import vocabularyData from "./data/vocabulary.json" with { type: "json" };
import accentsData from "./data/accents.json" with { type: "json" };

const DATASETS = {
  verbs: verbsData,
  vocabulary: vocabularyData,
  accents: accentsData,
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
  const data = DATASETS[dataset];
  if (!data) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Unknown dataset "${dataset}". Expected verbs, vocabulary, or accents.` }),
    };
  }

  return {
    statusCode: 200,
    // Cached only in the requester's own browser (never a shared/CDN
    // cache), since the response requires their personal auth token.
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
    body: JSON.stringify(data),
  };
};
