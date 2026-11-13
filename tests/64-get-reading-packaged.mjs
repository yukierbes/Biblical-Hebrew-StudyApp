import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { assert, summary } from "./helpers.mjs";
import { handler, chapterText } from "../netlify/functions/get-reading.js";

// A chapter must always reach the browser as TEXT. When Netlify packages the function it converts the chapter modules to
// CommonJS, which wraps the text one level deeper ({ default: "…" }); sent as it was, Netlify answers 502 ("cannot
// unmarshal object into … body of type string") and Reading shows "Could not load this chapter". Running the code as it
// is written cannot show that, so this test checks the unwrapping directly and, when Netlify's packager is available,
// packages the function the way a deploy does and asks the packaged copy for chapters.

const FUNCTIONS = new URL("../netlify/functions/", import.meta.url);
const signedIn = { clientContext: { user: { sub: "u" } } };

console.log("Unwrapping a chapter's text");
const text = '{"b":"Gen","c":1}';
assert(chapterText({ default: text }) === text, "a chapter module as it is written: the text is its default");
assert(chapterText({ default: { default: text } }) === text, "as packaged (CommonJS): the text is one level deeper");
assert(chapterText({ default: { default: { default: text } } }) === text, "...even two levels deeper");
for (const bad of [undefined, null, {}, { default: 5 }, { default: { other: 1 } }, { default: { default: {} } }]) {
  let threw = false;
  try { chapterText(bad); } catch (e) { threw = /did not hold text/.test(e.message); }
  assert(threw, `something that is not text is refused, not sent: ${JSON.stringify(bad)}`);
}

console.log("\nWhat the function answers");
for (const name of ["rd-gen-1", "rd-ps-119", "rd-zech-14"]) {
  const r = await handler({ queryStringParameters: { dataset: name } }, signedIn);
  assert(r.statusCode === 200 && typeof r.body === "string" && JSON.parse(r.body).c > 0, `${name}: a 200 with a text body that is the chapter`);
}

console.log("\nThe function as Netlify packages it");
let zip = null;
try {
  const req = createRequire(path.join(process.env.ZIP_IT_DIR || process.cwd(), "x.js"));
  zip = req("@netlify/zip-it-and-ship-it");
} catch (e) {
  /* not installed: it is not a dependency of the app */
}
if (!zip) {
  console.log("  (skipped: to run this part, install Netlify's packager once outside the project, for example `cd /tmp && npm i @netlify/zip-it-and-ship-it`, and run this test with ZIP_IT_DIR=/tmp)");
} else {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "zisi-"));
  const results = await zip.zipFunctions(FUNCTIONS.pathname, out, { basePath: path.resolve(FUNCTIONS.pathname, "../.."), config: { "*": {} } });
  const packed = results.find((r) => r.name === "get-reading");
  assert(!!packed, "get-reading is packaged");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unz-"));
  const { execFileSync } = await import("node:child_process");
  execFileSync("unzip", ["-q", packed.path, "-d", dir]);
  const bundled = await import(path.join(dir, "get-reading.js"));
  const files = execFileSync("find", [dir, "-name", "rd-*.js"]).toString().trim().split("\n").length;
  assert(files === 929, `all 929 chapter files are inside the packaged function (${files})`);
  for (const name of ["rd-gen-1", "rd-ps-119", "rd-zech-14"]) {
    const r = await bundled.handler({ queryStringParameters: { dataset: name } }, signedIn);
    assert(r.statusCode === 200 && typeof r.body === "string" && JSON.parse(r.body).c > 0, `packaged: ${name} is a 200 with a text body`);
  }
}

summary();
