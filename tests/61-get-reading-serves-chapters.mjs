import fs from "node:fs";
import { assert, summary } from "./helpers.mjs";
import { handler } from "../netlify/functions/get-reading.js";

// get-reading serves one chapter of Reading at a time, to signed-in people only, exactly as built.

const DATA = new URL("../netlify/functions/data/reading/", import.meta.url);
const MODULES = new URL("../netlify/functions/reading-chapters/", import.meta.url);
const source = fs.readFileSync(new URL("../netlify/functions/get-reading.js", import.meta.url), "utf8");
const chapterFiles = fs.readdirSync(DATA).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const signedIn = { clientContext: { user: { sub: "u" } } };
const ask = (dataset, ctx = signedIn) => handler({ queryStringParameters: dataset === undefined ? {} : { dataset } }, ctx);

console.log("What is there to serve");
assert(chapterFiles.length === 929, `all 929 chapters of the Hebrew Bible were built (${chapterFiles.length})`);
const table = fs.readFileSync(new URL("loaders.js", MODULES), "utf8");
const names = [...table.matchAll(/"(rd-[a-z0-9]+-\d+)": \(\) => import\("\.\/\1\.js"\)/g)].map((m) => m[1]);
assert(names.length === 929 && chapterFiles.every((f) => names.includes(f)) && names.every((n) => chapterFiles.includes(n)), "every chapter has a loader, and every loader a chapter");
assert(names.every((n) => fs.existsSync(new URL(`${n}.js`, MODULES))), "...and a module");
assert(!/\.json/.test(source) && /READING_CHAPTERS/.test(source), "chapters are loaded one at a time, only when asked for (no data file is imported up front)");

console.log("\nSigned in");
for (const name of ["rd-gen-1", "rd-ruth-2", "rd-ps-119", "rd-jonah-4", "rd-dan-2", "rd-2chr-36", "rd-song-8"]) {
  const r = await ask(name);
  assert(r.statusCode === 200 && r.headers["Content-Type"] === "application/json" && r.body === fs.readFileSync(new URL(`${name}.json`, DATA), "utf8"), `${name} is served exactly as built`);
}
assert(ask("rd-gen-1").then((r) => r.headers["Cache-Control"] === "private, max-age=300") && (await ask("rd-gen-1")).headers["Cache-Control"] === "private, max-age=300", "with the same caching header as the other data");
let ok = 0, big = 0;
for (const name of chapterFiles) {
  const r = await ask(name);
  const raw = fs.readFileSync(new URL(`${name}.json`, DATA), "utf8");
  if (r.statusCode === 200 && r.body === raw) ok++;
  if (raw.length > 5.5e6) big++;
}
assert(ok === chapterFiles.length, `all ${chapterFiles.length} chapters can be served, each exactly as built (${ok})`);
assert(big === 0, "no chapter comes near the 6 MB a function may send");
assert(JSON.parse((await ask("rd-ps-119")).body).n === 176 && JSON.parse((await ask("rd-ps-119")).body).b === "Ps", "Psalm 119 has its 176 verses");

console.log("\nNot allowed or unknown");
assert((await ask("rd-gen-1", {})).statusCode === 401 && (await ask("rd-gen-1", { clientContext: {} })).statusCode === 401, "signed out: refused");
for (const bad of ["rd-gen-999", "rd-nope-1", "bible-reading", "vocabulary", "../sync", "__proto__", "constructor", "rd-gen-1.js", "RD-GEN-1", ""]) {
  assert((await ask(bad)).statusCode === 400, `"${bad}" is refused`);
}
assert((await ask(undefined)).statusCode === 400, "no name: refused");
assert(/rd-gen-1/.test((await ask("nope")).body), "the refusal says how chapters are named");

summary();
