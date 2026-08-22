import { execFileSync } from "child_process";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(__dirname)
  .filter((f) => /^\d+.*\.mjs$/.test(f))
  .sort();

let allPassed = true;
const results = [];

for (const file of testFiles) {
  const fullPath = path.join(__dirname, file);
  process.stdout.write(`\n--- ${file} ---\n`);
  try {
    const output = execFileSync("node", [fullPath], { encoding: "utf-8" });
    process.stdout.write(output);
    results.push({ file, ok: true });
  } catch (e) {
    process.stdout.write(e.stdout || "");
    process.stderr.write(e.stderr || "");
    results.push({ file, ok: false });
    allPassed = false;
  }
}

console.log("\n=============================");
console.log("Test file summary:");
for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.file}`);
}
console.log("=============================");

if (!allPassed) {
  console.error("\nSome test files failed.");
  process.exit(1);
} else {
  console.log("\nAll test files passed.");
}
