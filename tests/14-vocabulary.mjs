import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");
const sidebarExtra = document.getElementById("sidebar-extra");

console.log("Vocabulary Review page");

navigateTo(document, "vocabulary");
await new Promise((r) => setTimeout(r, 30));

assert(content.innerHTML.includes("Vocabulary Review"), "page renders its title");

let rows = content.querySelectorAll("table.custom-table tbody tr");
assert(rows.length === 1991, `all 1991 words show with no filters applied (got ${rows.length})`);

const captionText = content.querySelector(".caption")?.textContent || "";
assert(captionText.includes("1991 of 1991"), `caption reports the full unfiltered count (got "${captionText}")`);

// --- Lesson ordering must be the TRUE pedagogical sequence, not
// alphabetical (5AA/5BB come after 5Z, not between 5A/5B) ---
const checklists = sidebarExtra.querySelectorAll(".checkbox-list");
assert(checklists.length === 4, `sidebar has 4 checkbox lists: Lesson, POS, Category, Visible Columns (got ${checklists.length})`);

const lessonLabels = checklists[0].querySelectorAll("label");
const lessonTexts = [...lessonLabels].map((l) => l.textContent.trim());
const idx5A = lessonTexts.indexOf("5A");
const idx5Z = lessonTexts.indexOf("5Z");
const idx5AA = lessonTexts.indexOf("5AA");
const idx5BB = lessonTexts.indexOf("5BB");
assert(idx5A !== -1 && idx5Z !== -1 && idx5AA !== -1 && idx5BB !== -1, "lesson list includes 5A, 5Z, 5AA, and 5BB");
assert(idx5AA > idx5Z && idx5BB > idx5AA, "5AA and 5BB come after 5Z (true file order), not alphabetically between 5A and 5B");
assert(lessonTexts[0] === "1A" && lessonTexts[1] === "1B", "lesson list starts 1A, 1B in the correct sequence");

// --- Filtering by Lesson ---
const lesson1ACheckbox = [...lessonLabels].find((l) => l.textContent.trim() === "1A").querySelector("input");
lesson1ACheckbox.checked = true;
lesson1ACheckbox.dispatchEvent(new Event("change", { bubbles: true }));

rows = content.querySelectorAll("table.custom-table tbody tr");
assert(rows.length > 0 && rows.length < 1991, `filtering to Lesson 1A narrows the table (got ${rows.length} rows)`);

// Reset and try POS filtering instead.
click(findButtonByText(sidebarExtra, "Reset Filters"));
rows = content.querySelectorAll("table.custom-table tbody tr");
assert(rows.length === 1991, "Reset Filters restores the full list");

const posLabels = sidebarExtra.querySelectorAll(".checkbox-list")[1].querySelectorAll("label");
const verbCheckbox = [...posLabels].find((l) => l.textContent.trim() === "Verb").querySelector("input");
verbCheckbox.checked = true;
verbCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
rows = content.querySelectorAll("table.custom-table tbody tr");
const verbRowCount = rows.length;
assert(verbRowCount > 0 && verbRowCount < 1991, `filtering to POS=Verb narrows the table (got ${verbRowCount} rows)`);

// Every visible row's POS column should actually say "Verb".
const posCellIndex = [...content.querySelectorAll("table.custom-table thead th")].findIndex(
  (th) => th.textContent.trim() === "POS"
);
const allVerb = [...rows].every((tr) => tr.children[posCellIndex].textContent.trim() === "Verb");
assert(allVerb, "every visible row after filtering actually has POS = Verb");

click(findButtonByText(sidebarExtra, "Reset Filters"));

// --- Category filter: blank categories are NOT offered as a checkbox
// option (per "leave blank categories blank"), but rows without a
// category still appear normally when no Category filter is active ---
const categoryLabels = sidebarExtra.querySelectorAll(".checkbox-list")[2].querySelectorAll("label");
const categoryTexts = [...categoryLabels].map((l) => l.textContent.trim());
assert(!categoryTexts.some((t) => t === "" || t === "Uncategorized"), "no blank/placeholder entry appears in the Category filter list");
assert(categoryTexts.length === 17, `Category filter lists all 17 real categories (got ${categoryTexts.length})`);

const categoryCellIndex = [...content.querySelectorAll("table.custom-table thead th")].findIndex(
  (th) => th.textContent.trim() === "Category"
);
const blankCategoryRows = [...content.querySelectorAll("table.custom-table tbody tr")].filter(
  (tr) => tr.children[categoryCellIndex].textContent.includes("—")
);
assert(blankCategoryRows.length > 0, "words with no assigned category show a placeholder (—), not hidden or relabeled");
assert(
  [...content.querySelectorAll("table.custom-table tbody tr")].every((tr) =>
    !!tr.children[categoryCellIndex].querySelector(".vocab-cat-edit-btn")
  ),
  "every row's Category cell has an Edit button"
);

// --- Minimum Frequency filter ---
const freqInput = sidebarExtra.querySelector('input[type="number"]');
freqInput.value = "1000";
freqInput.dispatchEvent(new Event("input", { bubbles: true }));
rows = content.querySelectorAll("table.custom-table tbody tr");
assert(rows.length > 0 && rows.length < 1991, `minimum frequency filter narrows the table (got ${rows.length} rows)`);

const freqCellIndex = [...content.querySelectorAll("table.custom-table thead th")].findIndex(
  (th) => th.textContent.trim() === "Frequency"
);
const allAboveMin = [...rows].every((tr) => parseInt(tr.children[freqCellIndex].textContent, 10) >= 1000);
assert(allAboveMin, "every visible row has Frequency >= the minimum entered");

freqInput.value = "";
freqInput.dispatchEvent(new Event("input", { bubbles: true }));

// --- Visible columns selector ---
const columnList = sidebarExtra.querySelectorAll(".checkbox-list")[3];
const hebrewColCheckbox = [...columnList.querySelectorAll("label")]
  .find((l) => l.textContent.trim() === "Hebrew")
  .querySelector("input");
hebrewColCheckbox.checked = false;
hebrewColCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
const headers = [...content.querySelectorAll("table.custom-table thead th")].map((th) => th.textContent.trim());
assert(!headers.includes("Hebrew"), "unchecking Hebrew in Visible Columns removes it from the table");

// --- Category editor: reassign a word to a new category, create a
// brand-new category, and confirm the change is reflected live ---
// Restore the Hebrew column (unchecked by the Visible Columns test above).
hebrewColCheckbox.checked = true;
hebrewColCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

const firstRow = content.querySelector("table.custom-table tbody tr");
const firstRowHebrew = firstRow.children[[...content.querySelectorAll("table.custom-table thead th")].findIndex(
  (th) => th.textContent.trim() === "Hebrew"
)].textContent.trim();

click(firstRow.querySelector(".vocab-cat-edit-btn"));

let modal = document.getElementById("vocab-category-editor-modal");
assert(!!modal, "clicking Edit opens the category editor modal");
assert(modal.textContent.includes(firstRowHebrew), "modal title references the correct word");

const addCatInput = modal.querySelector('input[type="text"]');
addCatInput.value = "Test Custom Category";
addCatInput.dispatchEvent(new Event("input", { bubbles: true }));
click(findButtonByText(modal, "Add Category"));

const newCatLabels = [...modal.querySelectorAll("label")].map((l) => l.textContent.trim());
assert(newCatLabels.includes("Test Custom Category"), "newly added category appears in the modal's checklist");

const newCatCheckbox = [...modal.querySelectorAll("label")]
  .find((l) => l.textContent.trim() === "Test Custom Category")
  .querySelector("input");
assert(newCatCheckbox.checked, "the newly added category is automatically checked for this word");

click(findButtonByText(modal, "Save"));
assert(!document.getElementById("vocab-category-editor-modal"), "modal closes after Save");

rows = content.querySelectorAll("table.custom-table tbody tr");
const updatedFirstRow = rows[0];
// Re-checking Hebrew above re-appends it at the end of the column
// order (renderCheckboxList's Set-based ordering), so recompute the
// Category column's current position rather than reusing the earlier
// (now possibly stale) categoryCellIndex.
const categoryCellIndexAfterReorder = [...content.querySelectorAll("table.custom-table thead th")].findIndex(
  (th) => th.textContent.trim() === "Category"
);
assert(
  updatedFirstRow.children[categoryCellIndexAfterReorder].textContent.includes("Test Custom Category"),
  "the table immediately reflects the newly assigned category"
);

// The new category should now also appear as a sidebar filter option.
const categoryTextsAfter = [...sidebarExtra.querySelectorAll(".checkbox-list")[2].querySelectorAll("label")].map((l) =>
  l.textContent.trim()
);
assert(categoryTextsAfter.includes("Test Custom Category"), "new category shows up as a sidebar filter option");

// Filtering by the new category should isolate just that one word.
const testCatCheckbox = [...sidebarExtra.querySelectorAll(".checkbox-list")[2].querySelectorAll("label")]
  .find((l) => l.textContent.trim() === "Test Custom Category")
  .querySelector("input");
testCatCheckbox.checked = true;
testCatCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
rows = content.querySelectorAll("table.custom-table tbody tr");
assert(rows.length === 1, `filtering by the new category isolates exactly the reassigned word (got ${rows.length} rows)`);

click(findButtonByText(sidebarExtra, "Reset Filters"));

// --- Reset a word's category override back to its original ---
const editedRow = [...content.querySelectorAll("table.custom-table tbody tr")].find((tr) =>
  tr.children[[...content.querySelectorAll("table.custom-table thead th")].findIndex((th) => th.textContent.trim() === "Hebrew")]
    .textContent.trim() === firstRowHebrew
);
click(editedRow.querySelector(".vocab-cat-edit-btn"));
modal = document.getElementById("vocab-category-editor-modal");
assert(!!findButtonByText(modal, "Reset to Original Category"), "modal offers a reset option once a word has an override");
click(findButtonByText(modal, "Reset to Original Category"));
assert(!document.getElementById("vocab-category-editor-modal"), "modal closes after reset");

const categoryCellIndexFinal = [...content.querySelectorAll("table.custom-table thead th")].findIndex(
  (th) => th.textContent.trim() === "Category"
);
const rowAfterReset = [...content.querySelectorAll("table.custom-table tbody tr")].find((tr) =>
  tr.children[[...content.querySelectorAll("table.custom-table thead th")].findIndex((th) => th.textContent.trim() === "Hebrew")]
    .textContent.trim() === firstRowHebrew
);
assert(
  !rowAfterReset.children[categoryCellIndexFinal].textContent.includes("Test Custom Category"),
  "resetting the override removes the custom category from the table"
);

click(findButtonByText(content, "Download CSV"));
click(findButtonByText(content, "Download Excel"));

// --- Return to Home ---
click(findButtonByText(content, "Return to Home Page"));
await new Promise((r) => setTimeout(r, 30));
assert(document.querySelector(".nav-btn.active")?.dataset.page === "home", "Return to Home Page navigates correctly");

summary();
