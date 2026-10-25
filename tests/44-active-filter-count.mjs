import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";

// The "N active" note on the Filters header must count every filter that narrows the list,
// including the Minimum Frequency box and the My list buttons (Starred / With my note).

const { document } = await setupApp();
const content = document.getElementById("content");
const sidebarExtra = document.getElementById("sidebar-extra");
const tick = () => new Promise((r) => setTimeout(r, 40));
const myListBtn = (label) => [...sidebarExtra.querySelectorAll(".mylist-choices button")].find((b) => b.textContent.trim().startsWith(label)); // labels carry a count, e.g. "Starred (0)"
const filtersSection = () => [...sidebarExtra.querySelectorAll(".sidebar-section")].find((s) => s.querySelector(".sidebar-title")?.textContent.trim() === "Filters");
const note = () => filtersSection().dataset.summary || "";

for (const page of ["vocabulary", "vocab-flashcards", "vocab-typing", "vocab-games"]) {
  console.log(page);
  navigateTo(document, page);
  await tick();
  assert(note() === "", `${page}: nothing is active at first`);

  const freq = sidebarExtra.querySelector('input[type="number"]');
  freq.value = "1000";
  freq.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  assert(note() === "1 active", `${page}: a minimum frequency counts as an active filter (got "${note()}")`);

  freq.value = "0";
  freq.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  assert(note() === "", `${page}: a minimum of 0 does not narrow anything, so it does not count (got "${note()}")`);

  freq.value = "50";
  freq.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  click(myListBtn("Starred"));
  await tick();
  assert(note() === "2 active", `${page}: frequency plus Starred counts as two (got "${note()}")`);

  click(myListBtn("Everything"));
  await tick();
  assert(note() === "1 active", `${page}: back to Everything leaves just the frequency (got "${note()}")`);

  const freqNow = sidebarExtra.querySelector('input[type="number"]'); // the sidebar was redrawn by the My list click
  freqNow.value = "";
  freqNow.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  assert(note() === "", `${page}: clearing the frequency box clears the count (got "${note()}")`);
}

summary();
