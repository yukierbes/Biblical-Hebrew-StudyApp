// GET /.netlify/functions/get-reading?dataset=rd-gen-1  -> one chapter of Reading as JSON, for signed-in users only.
//
// A chapter (its verses, their parsing and the English) is a file of about 25 KB (the largest, Psalm 119, 100 KB).
// There are 929 of them, written by scripts/build-reading.mjs, and they are the bulk of the app's data. They are served
// by their own function, not by get-data.js, so that asking for vocabulary, the verb tables or a practice page does
// not have to start up with the whole Bible beside it.
//
// Each chapter is a small JavaScript module that holds the chapter's JSON as one string (see reading-chapters/loaders.js),
// loaded only when that chapter is asked for, and sent as it is. Like get-data.js, it checks the person is signed in.

import { READING_CHAPTERS } from "./reading-chapters/loaders.js";

/**
 * The text of a chapter, from what its loader returned. A chapter module is `export default "<json>"`. Run as it is
 * written, the loader's result has the text as `.default`. When Netlify packages the function it converts the modules to
 * CommonJS, and `.default` is then the module itself, `{ default: "<json>" }`, one level deeper. A response body must be a
 * string (an object makes Netlify answer 502, "cannot unmarshal object into ... body of type string"), so unwrap it
 * either way, and refuse anything that still is not text.
 */
export function chapterText(loaded) {
  let text = loaded && loaded.default;
  for (let i = 0; i < 3 && text && typeof text === "object" && "default" in text; i++) text = text.default;
  if (typeof text !== "string") throw new Error("the chapter file did not hold text");
  return text;
}

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Sign in required." }) };
  }
  const dataset = (event.queryStringParameters || {}).dataset;
  if (!Object.prototype.hasOwnProperty.call(READING_CHAPTERS, dataset)) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `Unknown chapter "${dataset}". Chapters are named like rd-gen-1 or rd-ps-23.` }) };
  }
  let text;
  try {
    text = chapterText(await READING_CHAPTERS[dataset]());
  } catch (e) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: `Could not load chapter "${dataset}": ${e.message}` }) };
  }
  return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" }, body: text };
};
