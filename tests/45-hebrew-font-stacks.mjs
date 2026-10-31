import fs from "node:fs";
import { assert, summary } from "./helpers.mjs";

// Hebrew letters inside English text (a title like "Interrogative ה", a definition, an instruction box)
// must come out in the Hebrew font even when they are not wrapped in lang="he".

const css = fs.readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");
const stack = (name) => (css.match(new RegExp(`--${name}:\\s*([^;]+);`)) || [])[1] || "";

console.log("Hebrew fonts in the text font stacks");
for (const name of ["font-body", "font-display", "font-mono"]) {
  const s = stack(name);
  const iHebrew = s.indexOf("'Hebrew Text'");
  assert(iHebrew > 0, `--${name} lists the Hebrew font`);
  assert(!s.includes("Cardo"), `--${name}: Cardo is not in it (a Latin letter the first font lacks would be drawn from Cardo, at another size)`);
  assert(iHebrew < s.search(/system-ui|ui-monospace|serif|sans-serif|monospace/) || /^'(Fraunces|IBM Plex)/.test(s.trim()), `--${name}: the Latin font still comes first`);
  assert(/^'(Fraunces|IBM Plex Sans|IBM Plex Mono)'/.test(s.trim()), `--${name}: English letters still use the original font`);
}
assert(stack("font-hebrew").startsWith("'SBL Hebrew'"), "--font-hebrew is unchanged");

const face = css.match(/@font-face\s*{[^}]*'Hebrew Text'[^}]*}/);
assert(!!face, "'Hebrew Text' is defined");
assert(face && /local\('SBL Hebrew'\)/.test(face[0]), "...as the installed SBL Hebrew");
assert(face && /unicode-range:\s*U\+0590-05FF/.test(face[0]), "...limited to Hebrew letters, so no other character changes font");

summary();
