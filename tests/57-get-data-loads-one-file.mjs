import fs from "node:fs";
import { assert, summary } from "./helpers.mjs";
import { handler } from "../netlify/functions/get-data.js";

// The data function loads only the file that was asked for, and still serves exactly the same data.

const DATA = new URL("../netlify/functions/data/", import.meta.url);
const source = fs.readFileSync(new URL("../netlify/functions/get-data.js", import.meta.url), "utf8");
// The old one-file-per-book Reading data (bible-reading-gen.json ...) is gone: ignore any copies still lying about.
const allFiles = fs.readdirSync(DATA).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const files = allFiles.filter((f) => !/^bible-reading-/.test(f));
if (allFiles.length !== files.length) console.log("  note: old bible-reading-<book>.json files are still in netlify/functions/data; they are no longer used and can be deleted.");
const chapterFiles = fs.readdirSync(new URL("reading/", DATA)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const signedIn = { clientContext: { user: { sub: "u", email: "a@b.c" } } };
const ask = (dataset, ctx = signedIn) => handler({ queryStringParameters: dataset === undefined ? {} : { dataset } }, ctx);

console.log("Nothing is loaded up front");
assert(!/^import\s.*\.json/m.test(source), "no data file is imported at the top (they used to be loaded all at once on every wake-up)");
const lazy = [...source.matchAll(/import\("\.\/data\/([\w-]+)\.json", \{ with: \{ type: "json" \} \}\)/g)].map((m) => m[1]);
assert(lazy.length === files.length, `a loader for every data file (${lazy.length} of ${files.length})`);
assert(files.every((f) => lazy.includes(f)), "...so none is left out when a new book or page is added to the build");
assert(lazy.every((f) => files.includes(f)), "...and none points at a file that does not exist");

const tableText = fs.readFileSync(new URL("reading-loaders.js", DATA), "utf8");
const tableNames = [...tableText.matchAll(/"(rd-[a-z0-9]+-\d+)": \(\) => import\("\.\/reading\/\1\.json", \{ with: \{ type: "json" \} \}\)/g)].map((m) => m[1]);
assert(tableNames.length === chapterFiles.length && chapterFiles.every((f) => tableNames.includes(f)), `every Reading chapter file has a loader (${tableNames.length} of ${chapterFiles.length})`);
assert(/\.\.\.READING_LOADERS/.test(source), "get-data.js serves the Reading chapters from that table");

console.log("\nSigned in");
let r = await ask("vocabulary");
assert(r.statusCode === 200 && r.headers["Content-Type"] === "application/json", "a dataset is served");
assert(r.body === JSON.stringify(JSON.parse(fs.readFileSync(new URL("vocabulary.json", DATA), "utf8"))), "...exactly as built");
assert(r.headers["Cache-Control"] === "private, max-age=300", "...with the same caching headers as before");
for (const name of files) {
  const res = await ask(name);
  assert(res.statusCode === 200 && JSON.stringify(JSON.parse(res.body)) === JSON.stringify(JSON.parse(fs.readFileSync(new URL(`${name}.json`, DATA), "utf8"))), `${name} is served unchanged`);
}
assert((await ask("vocabulary")).body === r.body, "asking again gives the same answer");
for (const name of ["rd-gen-1", "rd-ruth-2", "rd-ps-119", "rd-jonah-4"]) {
  const res = await ask(name);
  assert(res.statusCode === 200 && res.body === JSON.stringify(JSON.parse(fs.readFileSync(new URL(`reading/${name}.json`, DATA), "utf8"))), `Reading chapter ${name} is served unchanged`);
}
assert(JSON.parse((await ask("rd-ps-119")).body).n === 176, "Psalm 119 has its 176 verses");
let chaptersOk = 0;
for (const name of chapterFiles) { const res = await ask(name); if (res.statusCode === 200 && JSON.parse(res.body).v) chaptersOk++; }
assert(chaptersOk === chapterFiles.length, `all ${chapterFiles.length} chapters can be served (${chaptersOk})`);

console.log("\nNot allowed or unknown");
r = await ask("vocabulary", {});
assert(r.statusCode === 401, "signed out: refused");
r = await ask("vocabulary", { clientContext: {} });
assert(r.statusCode === 401, "no user: refused");
r = await ask("nope");
assert(r.statusCode === 400 && /Unknown dataset/.test(r.body) && /rd-ruth-2/.test(r.body), "an unknown name: a clear 400 that lists the real ones");
assert((await ask("rd-gen-999")).statusCode === 400 && (await ask("rd-nope-1")).statusCode === 400, "a chapter that does not exist is refused");
r = await ask(undefined);
assert(r.statusCode === 400, "no name: 400");
for (const sneaky of ["../sync", "__proto__", "constructor", "toString", "../../package"]) {
  assert((await ask(sneaky)).statusCode === 400, `"${sneaky}" is refused`);
}

summary();
