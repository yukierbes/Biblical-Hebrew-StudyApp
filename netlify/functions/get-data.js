// GET /.netlify/functions/get-data?dataset=<name>  -> the named dataset as JSON, for signed-in users only.
//
// The datasets (vocabulary, verbs, accents, the Bible practice pages, one file per Reading book, and so on) sit in
// ./data and are written by the build (scripts/build-*.mjs). They are never served as plain files, so only
// people signed in through Netlify Identity can get them.
//
// Each file is loaded only when it is first asked for, not all at once when the function wakes up. The function
// holds about 7 MB of data in all, and an ordinary request needs one file of it (a page of Reading is 0.2 MB), so
// loading everything on every wake-up was wasted work. A file that has been asked for is kept (as text) for as
// long as the function stays awake.
//
// To add a dataset: write its file in ./data (the build does this), then add one line below. The loader needs
// the literal file name so the bundler includes the file; test 57 checks that every file in ./data has a line.
// The chapters of Reading are not served here: get-reading.js serves them (there are 929), so that this function
// stays small. Only the Reading index (bible-reading) is.

const LOADERS = {
  verbs: () => import("./data/verbs.json", { with: { type: "json" } }),
  vocabulary: () => import("./data/vocabulary.json", { with: { type: "json" } }),
  accents: () => import("./data/accents.json", { with: { type: "json" } }),
  consonants: () => import("./data/consonants.json", { with: { type: "json" } }),
  vowels: () => import("./data/vowels.json", { with: { type: "json" } }),
  "bible-article": () => import("./data/bible-article.json", { with: { type: "json" } }),
  "bible-dagesh": () => import("./data/bible-dagesh.json", { with: { type: "json" } }),
  "bible-suffix": () => import("./data/bible-suffix.json", { with: { type: "json" } }),
  "bible-qames": () => import("./data/bible-qames.json", { with: { type: "json" } }),
  "bible-prefix": () => import("./data/bible-prefix.json", { with: { type: "json" } }),
  "bible-syllable": () => import("./data/bible-syllable.json", { with: { type: "json" } }),
  "bible-noun": () => import("./data/bible-noun.json", { with: { type: "json" } }),
  "bible-pronoun": () => import("./data/bible-pronoun.json", { with: { type: "json" } }),
  "bible-demo": () => import("./data/bible-demo.json", { with: { type: "json" } }),
  "bible-adj": () => import("./data/bible-adj.json", { with: { type: "json" } }),
  "bible-verb": () => import("./data/bible-verb.json", { with: { type: "json" } }),
  "bible-interrog": () => import("./data/bible-interrog.json", { with: { type: "json" } }),
  "bible-vav": () => import("./data/bible-vav.json", { with: { type: "json" } }),
  "bible-min": () => import("./data/bible-min.json", { with: { type: "json" } }),
  "bible-sheva": () => import("./data/bible-sheva.json", { with: { type: "json" } }),
  "bible-reading": () => import("./data/bible-reading.json", { with: { type: "json" } }),
  "bible-mixed": () => import("./data/bible-mixed.json", { with: { type: "json" } }),
};

// dataset name -> its JSON text, filled the first time each is asked for
const bodies = new Map();

async function bodyFor(dataset) {
  if (!Object.prototype.hasOwnProperty.call(LOADERS, dataset)) return null;
  if (!bodies.has(dataset)) {
    const module = await LOADERS[dataset]();
    bodies.set(dataset, JSON.stringify(module.default));
  }
  return bodies.get(dataset);
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

  const dataset = (event.queryStringParameters || {}).dataset;
  let body;
  try {
    body = await bodyFor(dataset);
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Could not load dataset "${dataset}": ${e.message}` }),
    };
  }
  if (body === null) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Unknown dataset "${dataset}". Expected one of: ${Object.keys(LOADERS).join(", ")}.` }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
    body,
  };
};
