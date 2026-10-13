#!/usr/bin/env node
// Gives the service worker a new version number on every deploy.
//
// The app caches its files so it works offline and loads fast (public/sw.js).
// A browser only replaces that cache when the service worker file itself
// changes, which is what the CACHE_VERSION line inside it is for. Bumping that
// by hand after every change was easy to forget (and when it was forgotten,
// people kept seeing the old app or old data). So Netlify runs this script as
// part of every build (see `command` in netlify.toml) and it writes the deploy's
// commit id into that line: every deploy is a new version, automatically.
//
// It only does anything on Netlify (where the NETLIFY variable is set), so
// running it by accident on your own computer never edits the file in your
// repository. Use --force to run it anyway.
//
// It can never fail a deploy: if anything is odd, it says so and carries on.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SW = join(ROOT, "public", "sw.js");

try {
  if (!process.env.NETLIFY && !process.argv.includes("--force")) {
    console.log("stamp-sw: not running on Netlify, so public/sw.js is left as it is.");
    process.exit(0);
  }
  const id = (process.env.COMMIT_REF || process.env.DEPLOY_ID || process.env.BUILD_ID || "").slice(0, 10) || `t${Date.now().toString(36)}`;
  const source = readFileSync(SW, "utf-8");
  const line = /const CACHE_VERSION = "[^"]*";/;
  if (!line.test(source)) {
    console.warn("stamp-sw: couldn't find the CACHE_VERSION line in public/sw.js, so it was left as it is.");
    process.exit(0);
  }
  writeFileSync(SW, source.replace(line, `const CACHE_VERSION = "hebrew-verb-app-${id}";`), "utf-8");
  console.log(`stamp-sw: service worker version is now hebrew-verb-app-${id}`);
} catch (e) {
  console.warn(`stamp-sw: skipped (${e.message}). The deploy continues.`);
}
