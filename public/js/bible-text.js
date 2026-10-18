// Helpers for showing Bible words from the "bible-article" dataset.
// Hebrew is shown exactly as stored; the only change ever made is HIDING accent marks
// (U+0591–U+05AF) when the person turns them off. Vowel points, dagesh, meteg and
// maqqef are never touched.

const ACCENTS = /[\u0591-\u05AF]/g;
export const stripAccents = (s) => s.replace(ACCENTS, "");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** "Gen.1.2" -> "Genesis 1:2" */
export function prettyRef(ref) {
  const [, c, v] = ref.split(".");
  return `Genesis ${c}:${v}`;
}

/**
 * One word as HTML. The pieces of a word are separated by "/" in the data
 * (prefix / article / noun …); here they are joined back together. `markPiece`
 * (a piece index) wraps that piece in <mark>; `showAccents` false hides the accent marks.
 */
export function wordHtml(word, { markPiece = -1, showAccents = true } = {}) {
  const pieces = word.t.split("/").map((p) => (showAccents ? p : stripAccents(p)));
  return pieces.map((p, i) => (i === markPiece ? `<mark class="bible-mark">${esc(p)}</mark>` : esc(p))).join("");
}

/** The plain text of a word with its pieces joined. */
export function wordText(word, showAccents = true) {
  const t = word.t.split("/").join("");
  return showAccents ? t : stripAccents(t);
}

/**
 * Builds a verse element (right-to-left). `opts.mark(wi, word)` may return a piece index to
 * highlight (or -1); `opts.onWord(wi, word, el)` turns words into buttons (for "tap the article").
 */
export function buildVerse(words, { showAccents = true, mark = null, onWord = null, className = "" } = {}) {
  const el = document.createElement("div");
  el.className = "bible-verse " + className;
  el.setAttribute("lang", "he");
  el.setAttribute("dir", "rtl");
  words.forEach((w, wi) => {
    const joiner = w.m || w.s; // maqqef and sof pasuq attach to the word before
    const span = document.createElement(onWord && !joiner ? "button" : "span");
    if (onWord && !joiner) span.type = "button";
    span.className = "bible-word" + (joiner ? " bible-joiner" : "");
    span.innerHTML = wordHtml(w, { markPiece: mark ? mark(wi, w) : -1, showAccents });
    span.dataset.wi = String(wi);
    if (onWord && !joiner) span.addEventListener("click", () => onWord(wi, w, span));
    el.appendChild(span);
    if (!joiner && wi < words.length - 1 && !(words[wi + 1] && words[wi + 1].s)) {
      // a space between words — but not before a maqqef/sof pasuq
      if (!(words[wi + 1] && words[wi + 1].m)) el.appendChild(document.createTextNode(" "));
    }
  });
  return el;
}

const SHOW_KEY = "bibleShowAccents";
export function getShowAccents() {
  try {
    return localStorage.getItem(SHOW_KEY) !== "0";
  } catch (e) {
    return true;
  }
}
export function setShowAccents(on) {
  try {
    localStorage.setItem(SHOW_KEY, on ? "1" : "0");
  } catch (e) {
    /* not critical */
  }
}
