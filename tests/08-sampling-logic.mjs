import { assert, summary } from "./helpers.mjs";
import { pickCycling, morphKey, sampleN } from "../js/helpers.js";

console.log("Sampling logic (pickCycling, sampleN)");

const pool = [
  { Binyan: "Qal", Mode: "Perfect", Person: "3", Gender: "M", Number: "S", Dataset: "X" },
  { Binyan: "Qal", Mode: "Perfect", Person: "3", Gender: "F", Number: "S", Dataset: "X" },
  { Binyan: "Qal", Mode: "Perfect", Person: "2", Gender: "M", Number: "S", Dataset: "X" },
];

const shown = new Set();
const draws = [];
for (let i = 0; i < 12; i++) {
  draws.push(morphKey(pickCycling(pool, shown)));
}

for (let cycle = 0; cycle < 4; cycle++) {
  const slice = draws.slice(cycle * 3, cycle * 3 + 3);
  assert(new Set(slice).size === 3, `cycle ${cycle + 1} of 3 draws contains no repeats`);
}

// sampleN without replacement when n <= pool size
const sample = sampleN([1, 2, 3, 4, 5], 3, false);
assert(sample.length === 3, "sampleN returns the requested count");
assert(new Set(sample).size === 3, "sampleN without replacement has no duplicates");

// sampleN growing with replacement when n > pool size
const grown = sampleN([1, 2], 5, true);
assert(grown.length === 5, "sampleN grows to the requested count when allowed to repeat");

summary();
