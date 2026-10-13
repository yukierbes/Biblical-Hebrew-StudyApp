import { assert, summary } from "./helpers.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_FILES = ["vocabulary.json", "accents.json", "verbs.json"];

// A scratch copy of just what the scripts need, so tests can damage files freely.
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "build-data-"));
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  cpSync(join(ROOT, "data-source"), join(dir, "data-source"), { recursive: true });
  cpSync(join(ROOT, "netlify", "functions", "data"), join(dir, "netlify", "functions", "data"), { recursive: true });
  mkdirSync(join(dir, "public", "js"), { recursive: true });
  cpSync(join(ROOT, "public", "js", "constants.js"), join(dir, "public", "js", "constants.js"));
  cpSync(join(ROOT, "public", "sw.js"), join(dir, "public", "sw.js"));
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  return dir;
}
const runBuild = (dir, args = [], env = {}) =>
  spawnSync("node", ["scripts/build-data.mjs", ...args], { cwd: dir, env: { ...process.env, ...env }, encoding: "utf-8" });
const runStamp = (dir, args = [], env = {}) =>
  spawnSync("node", ["scripts/stamp-sw.mjs", ...args], { cwd: dir, env: { ...process.env, NETLIFY: "", ...env }, encoding: "utf-8" });
const read = (dir, ...p) => readFileSync(join(dir, ...p), "utf-8");
const dataSnapshot = (dir) => DATA_FILES.map((f) => read(dir, "netlify", "functions", "data", f)).join("\n");
const json = (dir, f) => JSON.parse(read(dir, "netlify", "functions", "data", f));
const vocabCsv = (dir) => join(dir, "data-source", "vocabulary.csv");
const verbFiles = (dir) => readdirSync(join(dir, "data-source", "verbs")).filter((f) => f.endsWith(".csv")).sort();
const all = (r) => `${r.stdout}\n${r.stderr}`;
const made = [];
const fresh = () => {
  const d = sandbox();
  made.push(d);
  return d;
};

// ======================================================================
console.log("Rebuilding the data from the CSV files");

{
  const dir = fresh();
  const before = dataSnapshot(dir);
  const r = runBuild(dir);
  assert(r.status === 0, `a build of the current CSV files succeeds (exit ${r.status})`);
  assert(dataSnapshot(dir) === before, "...and gives exactly the data that is already published");
  assert(!/WARNINGS/.test(r.stdout), "...with no warnings about the current data");
}

{
  // Updating Hebrew: a new word with vowel points arrives intact.
  const dir = fresh();
  const word = "\u05EA\u05BC\u05D5\u05B9\u05D3\u05B8\u05D4"; // תּוֹדָה
  writeFileSync(vocabCsv(dir), read(dir, "data-source", "vocabulary.csv").replace(/\r?\n$/, "") + `\r\n99Z,7,${word},thanks,Noun,\r\n`);
  const r = runBuild(dir);
  const vocab = json(dir, "vocabulary.json");
  const last = vocab.rows[vocab.rows.length - 1];
  assert(r.status === 0 && last.Hebrew === word && last.English === "thanks" && last.Frequency === 7, "a new Hebrew word (with its vowel points) is published exactly as typed");
  assert(vocab.lessonOrder[vocab.lessonOrder.length - 1] === "99Z", "...and a new lesson is added at the end of the lesson list");
}

{
  // Excel's "CSV UTF-8" adds a byte-order mark and Windows line endings.
  const dir = fresh();
  const text = read(dir, "data-source", "vocabulary.csv");
  writeFileSync(vocabCsv(dir), "\uFEFF" + text.replace(/\r?\n/g, "\r\n"));
  const r = runBuild(dir);
  assert(r.status === 0 && json(dir, "vocabulary.json").rows.length === 1991, "a file saved as 'CSV UTF-8' by Excel (byte-order mark, Windows line endings) works");
}

{
  // Changing an existing Hebrew form in a verb file.
  const dir = fresh();
  const file = join(dir, "data-source", "verbs", verbFiles(dir)[0]);
  const text = readFileSync(file, "utf-8");
  const edited = text.replace("\u05E7\u05B8\u05D8\u05B7\u05DC", "\u05E7\u05B8\u05D8\u05B8\u05DC"); // קָטַל -> קָטָל
  assert(edited !== text, "(the test found a form to change)");
  writeFileSync(file, edited);
  runBuild(dir);
  assert(json(dir, "verbs.json").data["Strong Verb (\u05E7\u05D8\u05DC)"][0].Conjugation === "\u05E7\u05B8\u05D8\u05B8\u05DC", "an edited Hebrew form in a verb file shows up in the published data");
}

{
  // --check reads and reports but never writes.
  const dir = fresh();
  writeFileSync(vocabCsv(dir), read(dir, "data-source", "vocabulary.csv").replace(/\r?\n$/, "") + "\r\n99Z,7,\u05D0,x,Noun,\r\n");
  const before = dataSnapshot(dir);
  const r = runBuild(dir, ["--check"]);
  assert(r.status === 0 && dataSnapshot(dir) === before && /nothing will be written/i.test(r.stdout), "--check reports and writes nothing");
}

// ======================================================================
console.log("\nProblems it must catch (and say so plainly)");

{
  // Hebrew saved in a non-UTF-8 encoding (e.g. Windows Hebrew): bytes that aren't valid UTF-8.
  const dir = fresh();
  const before = dataSnapshot(dir);
  const header = "Lesson,Frequency,Hebrew,English,POS,Category\r\n";
  writeFileSync(vocabCsv(dir), Buffer.concat([Buffer.from(header + "1A,5,"), Buffer.from([0xe0, 0xe1, 0xe2]), Buffer.from(",word,Noun,\r\n")]));
  const r = runBuild(dir);
  assert(r.status === 1 && /not saved as UTF-8/.test(r.stderr) && /CSV UTF-8/.test(r.stderr), "a file in another encoding is refused, with how to fix it");
  assert(dataSnapshot(dir) === before, "...and nothing was changed");
}

{
  // Hebrew replaced by "?" (what Excel's plain 'CSV' does)
  const dir = fresh();
  const before = dataSnapshot(dir);
  writeFileSync(vocabCsv(dir), read(dir, "data-source", "vocabulary.csv").replace(/[\u0590-\u05FF]+/g, "???"));
  const r = runBuild(dir);
  assert(r.status === 1 && /column should contain Hebrew/.test(r.stderr) && /wrong format/.test(r.stderr), "Hebrew that turned into '?' is caught");
  assert(/row \d+ "\?\?\?"/.test(r.stderr), "...naming the rows and what was found");
  assert(dataSnapshot(dir) === before, "...and nothing was changed");
}

{
  const dir = fresh();
  const text = "Lesson,Frequency,Hebrew,English,POS,Category\r\n1A,1,\u05D0,a,Noun,\r\n";
  writeFileSync(vocabCsv(dir), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
  const r = runBuild(dir);
  assert(r.status === 1 && /UTF-16/.test(r.stderr), "a 'Unicode Text' (UTF-16) file is recognised and refused");
}

{
  const dir = fresh();
  const before = dataSnapshot(dir);
  writeFileSync(vocabCsv(dir), read(dir, "data-source", "vocabulary.csv").replace("Hebrew", "Hebrw"));
  const r = runBuild(dir);
  assert(r.status === 1 && /missing the column\(s\): Hebrew/.test(r.stderr) && /Hebrw/.test(r.stderr), "a mistyped column heading is reported, showing the headings it found");
  assert(dataSnapshot(dir) === before, "...and nothing was changed");
}

{
  // A cut-off upload
  const dir = fresh();
  const before = dataSnapshot(dir);
  const lines = read(dir, "data-source", "vocabulary.csv").split(/\r?\n/);
  writeFileSync(vocabCsv(dir), lines.slice(0, 100).join("\r\n") + "\r\n");
  let r = runBuild(dir);
  assert(r.status === 1 && /only 99 vocabulary words/.test(r.stderr) && /published data has 1991/.test(r.stderr), "a file with far fewer rows than before is refused (looks cut off)");
  assert(dataSnapshot(dir) === before, "...and the published data is untouched");
  r = runBuild(dir, [], { ALLOW_DATA_SHRINK: "1" });
  assert(r.status === 0 && json(dir, "vocabulary.json").rows.length === 99, "ALLOW_DATA_SHRINK=1 lets a deliberate big cut through");
}

{
  // A modest decrease is only a warning
  const dir = fresh();
  const lines = read(dir, "data-source", "vocabulary.csv").split(/\r?\n/).filter(Boolean);
  writeFileSync(vocabCsv(dir), lines.slice(0, Math.floor(lines.length * 0.8)).join("\r\n") + "\r\n");
  const r = runBuild(dir);
  assert(r.status === 0 && /down from 1991/.test(r.stdout), "losing a few rows is allowed, with a note");
}

{
  // Several problems are all reported together, and nothing at all is written
  const dir = fresh();
  const before = dataSnapshot(dir);
  writeFileSync(vocabCsv(dir), read(dir, "data-source", "vocabulary.csv").replace("English", "Englsh"));
  writeFileSync(join(dir, "data-source", "accents.csv"), Buffer.from([0xe0, 0xe1, 0x2c]));
  const r = runBuild(dir);
  assert(r.status === 1 && /vocabulary\.csv is missing/.test(r.stderr) && /accents\.csv is not saved as UTF-8/.test(r.stderr), "every problem is listed in one go");
  assert(dataSnapshot(dir) === before, "...and not even the good files were updated");
}

{
  // Duplicate verb name
  const dir = fresh();
  const first = verbFiles(dir)[0];
  cpSync(join(dir, "data-source", "verbs", first), join(dir, "data-source", "verbs", "99 " + first.replace(/^\d+\s*/, "")));
  const r = runBuild(dir);
  assert(r.status === 1 && /Two verb files make the verb/.test(r.stderr), "two verb files with the same name are caught");
}

{
  // A new verb file is simply added
  const dir = fresh();
  const rows = ["Binyan,Mode,Person,Gender,Number,Conjugation,Gloss Translation", "Qal,Perfect,3,M,S,\u05D1\u05B8\u05BC\u05D3\u05B7\u05E7,he examined"];
  writeFileSync(join(dir, "data-source", "verbs", "26 New Verb (\u05D1\u05D3\u05E7).csv"), rows.join("\r\n") + "\r\n");
  const r = runBuild(dir);
  const verbs = json(dir, "verbs.json");
  assert(r.status === 0 && verbs.datasets.length === 26 && verbs.datasets[25] === "New Verb (\u05D1\u05D3\u05E7)", "a new numbered verb file adds a verb (listed after the others)");
}

// ======================================================================
console.log("\nWarnings (worth a look, but they don't stop the build)");

{
  const dir = fresh();
  const file = join(dir, "data-source", "verbs", verbFiles(dir)[3]);
  let text = readFileSync(file, "utf-8");
  text = text.replace(/Qal/, "Qaal"); // typo'd binyan, once
  writeFileSync(file, text);
  const r = runBuild(dir);
  assert(r.status === 0 && /WARNINGS/.test(r.stdout) && /unexpected Binyan value/.test(r.stdout) && /Qaal/.test(r.stdout), "an unknown binyan (a likely typo) is flagged but doesn't stop the build");
}

{
  const dir = fresh();
  const file = join(dir, "data-source", "verbs", verbFiles(dir)[0]);
  writeFileSync(file, readFileSync(file, "utf-8").replace(/,Perfect,/, ",Perfet,"));
  const r = runBuild(dir);
  assert(r.status === 0 && /unexpected Mode value/.test(r.stdout), "an unknown mode is flagged");
}

{
  const dir = fresh();
  cpSync(vocabCsv(dir), join(dir, "data-source", "vocabulary (1).csv"));
  const r = runBuild(dir);
  assert(r.status === 0 && /vocabulary \(1\)\.csv is not used by the app/.test(r.stdout), "a stray file (e.g. a download named 'vocabulary (1).csv') is pointed out");
}

{
  // A lesson that is split into two stretches
  const dir = fresh();
  const lines = read(dir, "data-source", "vocabulary.csv").split(/\r?\n/).filter(Boolean);
  lines.push("1A,1,\u05D0,again,Noun,");
  writeFileSync(vocabCsv(dir), lines.join("\r\n") + "\r\n");
  const r = runBuild(dir);
  assert(r.status === 0 && /lesson "1A" starts again/.test(r.stdout), "a lesson split into two places is flagged (it would be listed in the wrong order)");
}

// ======================================================================
console.log("\nService worker version (stamp-sw)");

{
  const dir = fresh();
  const original = read(dir, "public", "sw.js");
  let r = runStamp(dir);
  assert(r.status === 0 && read(dir, "public", "sw.js") === original, "on your own computer it leaves public/sw.js alone");
  r = runStamp(dir, [], { NETLIFY: "true", COMMIT_REF: "0123456789abcdef0123" });
  assert(r.status === 0 && /const CACHE_VERSION = "hebrew-verb-app-0123456789";/.test(read(dir, "public", "sw.js")), "on Netlify it stamps the deploy's commit id into the version");
  runStamp(dir, [], { NETLIFY: "true", COMMIT_REF: "fedcba9876543210" });
  assert(/hebrew-verb-app-fedcba9876";/.test(read(dir, "public", "sw.js")) && read(dir, "public", "sw.js").split("CACHE_VERSION =").length === 2, "the next deploy gets a different version (and only the one line changes)");
  const rest = (t) => t.replace(/const CACHE_VERSION = "[^"]*";/, "");
  assert(rest(read(dir, "public", "sw.js")) === rest(original), "nothing else in the file is touched");
  runStamp(dir, ["--force"], { COMMIT_REF: "aaaaaaaaaaaaaaaa" });
  assert(/hebrew-verb-app-aaaaaaaaaa";/.test(read(dir, "public", "sw.js")), "--force stamps it anyway");
  writeFileSync(join(dir, "public", "sw.js"), "// no version line here\n");
  r = runStamp(dir, [], { NETLIFY: "true", COMMIT_REF: "bbbbbbbbbbbb" });
  assert(r.status === 0 && /couldn't find/.test(r.stderr), "if the version line is ever missing, it warns but never fails the deploy");
}

for (const d of made) rmSync(d, { recursive: true, force: true });
summary();
