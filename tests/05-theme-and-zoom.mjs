import { setupApp, assert, summary, click } from "./helpers.mjs";

const { document, window, localStorage } = await setupApp();

console.log("Dark mode + text zoom");

const themeBtn = document.getElementById("theme-toggle");
const varOf = (name) => window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();

assert(document.documentElement.getAttribute("data-theme") !== "dark", "light theme by default");
const inkLight = varOf("--ink");
const paperLight = varOf("--paper");

click(themeBtn);
assert(document.documentElement.getAttribute("data-theme") === "dark", "data-theme=dark after toggling");
assert(themeBtn.textContent.includes("Light Mode"), "button label flips to Light Mode");
const inkDark = varOf("--ink");
const paperDark = varOf("--paper");
assert(inkDark !== inkLight && paperDark !== paperLight, "--ink and --paper actually change value in dark mode");
assert(localStorage.getItem("theme") === "dark", "dark preference persisted to localStorage");

click(themeBtn);
assert(document.documentElement.getAttribute("data-theme") !== "dark", "toggling back removes data-theme");
assert(localStorage.getItem("theme") === "light", "light preference persisted");

const zoomOut = document.getElementById("zoom-out");
const zoomIn = document.getElementById("zoom-in");
const zoomReset = document.getElementById("zoom-reset");

assert(zoomReset.textContent === "100%", "zoom starts at 100%");
click(zoomIn);
assert(zoomReset.textContent === "110%", "zoom-in increases by 10%");
assert(document.documentElement.style.fontSize === "110%", "root font-size actually updated");
assert(localStorage.getItem("textZoom") === "110", "zoom persisted to localStorage");

for (let i = 0; i < 10; i++) click(zoomIn);
assert(zoomReset.textContent === "160%", "zoom is clamped at the 160% maximum");
assert(zoomIn.disabled === true, "zoom-in button disables at the maximum");

click(zoomReset);
assert(zoomReset.textContent === "100%", "reset button returns to 100%");

for (let i = 0; i < 10; i++) click(zoomOut);
assert(zoomReset.textContent === "80%", "zoom is clamped at the 80% minimum");
assert(zoomOut.disabled === true, "zoom-out button disables at the minimum");

summary();
