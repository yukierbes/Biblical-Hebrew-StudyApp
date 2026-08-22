import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";

const { document } = await setupApp();
const content = document.getElementById("content");
const sidebarExtra = document.getElementById("sidebar-extra");

console.log("Vocabulary Flashcards page");

navigateTo(document, "vocab-flashcards");
await new Promise((r) => setTimeout(r, 30));

assert(content.innerHTML.includes("Vocabulary Flashcards"), "page renders its title");

// --- Sidebar filters mirror the Vocabulary Review page (Lesson, POS,
// Category — no Visible Columns section here, since there's no table) ---
const checklists = sidebarExtra.querySelectorAll(".checkbox-list");
assert(checklists.length === 3, `sidebar has 3 checkbox lists: Lesson, POS, Category (got ${checklists.length})`);
assert(!!sidebarExtra.querySelector('input[type="number"]'), "sidebar has the Minimum Frequency input");

// --- A card is showing, starting on the Hebrew face by default ---
let card = content.querySelector(".flashcard-interactive");
assert(!!card, "a flashcard is rendered");
assert(!!card.querySelector(".flashcard-interactive-hebrew"), "card starts showing the Hebrew face by default");
assert(!card.querySelector(".flashcard-interactive-english"), "English face is not shown before flipping");

let caption = content.querySelector(".caption")?.textContent || "";
assert(/Card 1 of \d+/.test(caption), `caption shows card position (got "${caption}")`);
assert(caption.includes("0 known") && caption.includes("0 to review"), "counts start at zero");

// --- Flipping shows the English face ---
click(card);
card = content.querySelector(".flashcard-interactive");
assert(!!card.querySelector(".flashcard-interactive-english"), "flipping reveals the English face");
assert(!card.querySelector(".flashcard-interactive-hebrew"), "Hebrew face is hidden once flipped");

// --- Switching start side to English shows English first on a fresh card ---
const englishChoiceBtn = findButtonByText(content, "English");
click(englishChoiceBtn);
card = content.querySelector(".flashcard-interactive");
assert(!!card.querySelector(".flashcard-interactive-english"), "after choosing English-first, the unflipped card shows English");
assert(!card.querySelector(".flashcard-interactive-hebrew"), "Hebrew is on the back when English-first is chosen");

// --- Marking "I Know It" advances the card and increments the count ---
click(findButtonByText(content, "I Know It"));
caption = content.querySelector(".caption")?.textContent || "";
assert(/Card 2 of \d+/.test(caption), `advances to card 2 after marking known (got "${caption}")`);
assert(caption.includes("1 known"), `known count increments (got "${caption}")`);

// --- Marking "Review Later" advances the card and increments that count ---
click(findButtonByText(content, "Review Later"));
caption = content.querySelector(".caption")?.textContent || "";
assert(/Card 3 of \d+/.test(caption), `advances to card 3 after marking for review (got "${caption}")`);
assert(caption.includes("1 to review"), `review count increments (got "${caption}")`);

// --- Filtering to a single lesson narrows the deck ---
const lessonLabels = sidebarExtra.querySelectorAll(".checkbox-list")[0].querySelectorAll("label");
const lesson1ACheckbox = [...lessonLabels].find((l) => l.textContent.trim() === "1A").querySelector("input");
lesson1ACheckbox.checked = true;
lesson1ACheckbox.dispatchEvent(new Event("change", { bubbles: true }));

caption = content.querySelector(".caption")?.textContent || "";
const totalMatch = caption.match(/Card 1 of (\d+)/);
assert(!!totalMatch, `filtering restarts the round at card 1 (got "${caption}")`);
assert(caption.includes("0 known") && caption.includes("0 to review"), "changing filters starts a fresh round (counts reset)");

click(findButtonByText(sidebarExtra, "Reset Filters"));

// --- Run the (now-full, reshuffled) deck all the way to the summary screen ---
let guard = 0;
while (!content.querySelector(".info-box")?.textContent.includes("Round Complete") && guard < 3000) {
  const knowBtn = findButtonByText(content, "I Know It");
  if (!knowBtn) break;
  click(knowBtn);
  guard++;
}
assert(guard < 3000, "finishing the deck reaches the summary screen in a bounded number of steps");
assert(content.querySelector(".info-box")?.textContent.includes("Round Complete"), "summary screen shows once every card is marked");
assert(!content.querySelector(".flashcard-interactive"), "no flashcard renders on the summary screen");

click(findButtonByText(content, "Restart Full Round"));
caption = content.querySelector(".caption")?.textContent || "";
assert(/Card 1 of \d+/.test(caption), "Restart Full Round begins a new round at card 1");

// --- Return to Home ---
click(findButtonByText(content, "Return to Home Page"));
await new Promise((r) => setTimeout(r, 30));
assert(document.querySelector(".nav-btn.active")?.dataset.page === "home", "Return to Home Page navigates correctly");

summary();
