import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { setupApp, assert, summary, navigateTo, click, findButtonByText } from "./helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const vocab = JSON.parse(readFileSync(path.join(ROOT, "netlify/functions/data/vocabulary.json"), "utf-8"));

// Find a Lesson + POS + Category combination that narrows the pool to
// exactly one row, so Practice mode's "Generate a Word" is deterministic
// for the test. Prefer one where both sides have multiple accepted
// answers (comma-separated), to exercise the "either spelling" / "major
// words" matching rules.
function uniqueMatchCount(r) {
  return vocab.rows.filter((x) => x.Lesson === r.Lesson && x.POS === r.POS && x.Category === r.Category).length;
}

function findDeterministicWord() {
  const withCommas = vocab.rows.filter((r) => (r.Hebrew || "").includes(",") && (r.English || "").includes(","));
  const uniqueWithCommas = withCommas.find((r) => r.Category && uniqueMatchCount(r) === 1);
  if (uniqueWithCommas) return uniqueWithCommas;
  return vocab.rows.find((r) => r.Category && uniqueMatchCount(r) === 1) || null;
}

const multiAnswerWord = findDeterministicWord();

console.log("Vocabulary Typing page");

if (!multiAnswerWord) {
  console.log("  (skipped — no Lesson in the dataset narrows to a single word)");
  summary();
} else {
  const { document } = await setupApp();
  const content = document.getElementById("content");
  const sidebarExtra = document.getElementById("sidebar-extra");

  navigateTo(document, "vocab-typing");
  await new Promise((r) => setTimeout(r, 30));

  assert(content.innerHTML.includes("Vocabulary Typing"), "page renders its title");

  // --- Same filter sidebar as the other Vocabulary pages ---
  const checklists = sidebarExtra.querySelectorAll(".checkbox-list");
  assert(checklists.length === 3, `sidebar has 3 checkbox lists: Lesson, POS, Category (got ${checklists.length})`);
  assert(!!sidebarExtra.querySelector('input[type="number"]'), "sidebar has the Minimum Frequency input");

  // --- Practice / Quiz mode radios and the direction chooser exist ---
  assert(!!content.querySelector('input[name="vocab-typing-mode"]'), "Practice/Quiz mode radios render");
  assert(!!findButtonByText(content, "Hebrew → type English"), "direction choice includes Hebrew → English");
  assert(!!findButtonByText(content, "English → type Hebrew"), "direction choice includes English → Hebrew");

  // --- Narrow the sidebar filter to our single deterministic word via
  // Lesson + Part of Speech + Category together ---
  const [lessonListEl, posListEl, categoryListEl] = sidebarExtra.querySelectorAll(".checkbox-list");

  const lessonCheckbox = [...lessonListEl.querySelectorAll("label")]
    .find((l) => l.textContent.trim() === multiAnswerWord.Lesson)
    .querySelector("input");
  lessonCheckbox.checked = true;
  lessonCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

  const posCheckbox = [...sidebarExtra.querySelectorAll(".checkbox-list")[1].querySelectorAll("label")]
    .find((l) => l.textContent.trim() === multiAnswerWord.POS)
    .querySelector("input");
  posCheckbox.checked = true;
  posCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

  const categoryCheckbox = [...sidebarExtra.querySelectorAll(".checkbox-list")[2].querySelectorAll("label")]
    .find((l) => l.textContent.trim() === multiAnswerWord.Category)
    .querySelector("input");
  categoryCheckbox.checked = true;
  categoryCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

  // --- Direction: Hebrew shown, type English ---
  click(findButtonByText(content, "Hebrew → type English"));
  click(findButtonByText(content, "Generate a Word"));

  assert(!!content.querySelector(".hebrew-display span[lang='he']"), "Hebrew prompt renders when direction is Hebrew→English");

  const acceptedEnglish = multiAnswerWord.English.replace(/\([^)]*\)/g, " ")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)[0];

  let answerInput = content.querySelector(".field-group input[type='text']");
  answerInput.value = acceptedEnglish;
  answerInput.dispatchEvent(new Event("input", { bubbles: true }));
  click(findButtonByText(content, "Check Answer"));

  assert(
    !!content.querySelector(".field-label.pill-good"),
    `typing one accepted English word/phrase ("${acceptedEnglish}") is marked correct`
  );

  answerInput = content.querySelector(".field-group input[type='text']");
  answerInput.value = "definitely not a real answer";
  answerInput.dispatchEvent(new Event("input", { bubbles: true }));
  click(findButtonByText(content, "Check Answer"));
  assert(!!content.querySelector(".field-label.pill-warn"), "a wrong English answer is marked incorrect, not silently accepted");

  click(findButtonByText(content, "Show Answer"));
  assert(content.querySelectorAll(".hebrew-display").length >= 2, "Show Answer reveals the correct answer alongside the prompt");

  // --- Get Hint: Lesson, then Part of Speech, then Category (3rd click) ---
  click(findButtonByText(content, "Generate a Word")); // fresh word resets hint state
  assert(!!findButtonByText(content, "Get Hint"), "Get Hint button is present in Practice mode");
  assert(!content.textContent.includes("Lesson:"), "no hint is shown before Get Hint is clicked");

  click(findButtonByText(content, "Get Hint"));
  assert(content.textContent.includes(`Lesson: ${multiAnswerWord.Lesson}`), "first Get Hint click reveals the Lesson");
  assert(!content.textContent.includes("Part of Speech:"), "Part of Speech is not revealed by the first hint click");
  assert(!content.textContent.includes("Category:"), "Category is not revealed by the first hint click");

  click(findButtonByText(content, "Get Hint"));
  assert(
    content.textContent.includes(`Part of Speech: ${multiAnswerWord.POS}`),
    "second Get Hint click additionally reveals the Part of Speech"
  );
  assert(!content.textContent.includes("Category:"), "Category is not revealed until the third hint click");
  assert(!findButtonByText(content, "No More Hints"), "hint button still has a Category hint left for this word");

  click(findButtonByText(content, "Get Hint"));
  assert(
    content.textContent.includes(`Category: ${multiAnswerWord.Category}`),
    "third Get Hint click additionally reveals the Category, since this word has one"
  );
  assert(!!findButtonByText(content, "No More Hints"), "hint button is exhausted after Lesson + Part of Speech + Category");

  // --- Direction: English shown, type Hebrew — exercises the Hebrew
  // keyboard button and "either accepted spelling" matching ---
  click(findButtonByText(content, "English → type Hebrew"));
  click(findButtonByText(content, "Generate a Word"));

  assert(!!findButtonByText(content, "Hebrew Keyboard"), "Hebrew Keyboard button is available when typing Hebrew");

  const hebrewVariants = multiAnswerWord.Hebrew.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const acceptedHebrew = hebrewVariants[hebrewVariants.length - 1]; // deliberately NOT the first variant

  const hebInput = content.querySelector('.field-group input[dir="rtl"]');
  hebInput.value = acceptedHebrew;
  hebInput.dispatchEvent(new Event("input", { bubbles: true }));
  click(findButtonByText(content, "Check Answer"));

  assert(
    !!content.querySelector(".field-label.pill-good"),
    hebrewVariants.length > 1
      ? "entering just one of several accepted Hebrew spellings is marked correct"
      : "entering the correct Hebrew spelling is marked correct"
  );

  // --- Switch to Quiz mode: Check/Show Answer buttons are gone ---
  const quizRadio = [...content.querySelectorAll('input[name="vocab-typing-mode"]')].find((r) => r.value === "Quiz");
  click(quizRadio);

  assert(!findButtonByText(content, "Check Answer"), "Quiz mode has no Check Answer button");
  assert(!findButtonByText(content, "Show Answer"), "Quiz mode has no Show Answer button");
  assert(content.innerHTML.includes("Vocabulary Typing Quiz"), "quiz filter step renders");

  click(findButtonByText(content, "No, use all vocabulary"));
  assert(content.innerHTML.includes("How many questions"), "quiz proceeds to the length step");

  const lengthInput = content.querySelector('input[type="number"]');
  lengthInput.value = "2";
  lengthInput.dispatchEvent(new Event("input", { bubbles: true }));
  click(findButtonByText(content, "Start Quiz"));

  assert(!!content.querySelector(".progress-bar-outer"), "quiz question step shows a progress bar");
  assert(!findButtonByText(content, "Check Answer"), "no Check Answer button during quiz questions");
  assert(!findButtonByText(content, "Get Hint"), "no Get Hint button during quiz questions");
  assert(!content.textContent.includes("Lesson:") && !content.textContent.includes("Part of Speech:") && !content.textContent.includes("Category:"), "no extra Lesson/POS/Category info shown during quiz questions");
  assert(!!findButtonByText(content, "Next Question"), "Next Question button is present");
  assert(!!findButtonByText(content, "End Quiz"), "End Quiz button is present");

  click(findButtonByText(content, "End Quiz"));
  assert(content.innerHTML.includes("Quiz Summary"), "End Quiz jumps straight to the summary screen");
  assert(!!findButtonByText(content, "Start a New Quiz"), "summary offers Start a New Quiz");

  // --- Return to Home ---
  click(findButtonByText(content, "Return to Home Page"));
  await new Promise((r) => setTimeout(r, 30));
  assert(document.querySelector(".nav-btn.active")?.dataset.page === "home", "Return to Home Page navigates correctly");

  summary();
}
