// Helpers for showing Bible words from the "bible-article" dataset.
// Hebrew is shown exactly as stored; the only change ever made is HIDING accent marks
// (U+0591–U+05AF) when the person turns them off. Vowel points, dagesh, meteg and
// maqqef are never touched.

const ACCENTS = /[\u0591-\u05AF]/g;
export const stripAccents = (s) => s.replace(ACCENTS, "");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Escapes text and wraps every run of Hebrew in a span that uses the app's Hebrew font and size control. */
export function hebrewHtml(text) {
  return esc(text).replace(/[\u0590-\u05FF]+/g, (m) => `<span lang="he" dir="rtl" class="bible-inline">${m}</span>`);
}

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
export function wordHtml(word, { markPiece = -1, markLetter = -1, showAccents = true } = {}) {
  if (markLetter >= 0) return letterMarkedHtml(word.t.split("/").join(""), markLetter, showAccents);
  const pieces = word.t.split("/").map((p) => (showAccents ? p : stripAccents(p)));
  return pieces.map((p, i) => (i === markPiece ? `<mark class="bible-mark">${esc(p)}</mark>` : esc(p))).join("");
}

/** One letter (and the marks written with it) wrapped in <mark>; `letterIndex` counts letters from the start of the word. */
export function letterMarkedHtml(text, letterIndex, showAccents = true) {
  let out = "";
  let n = -1;
  let open = false;
  for (const ch of text) {
    const isLetter = ch >= "\u05d0" && ch <= "\u05ea";
    if (!showAccents && ch >= "\u0591" && ch <= "\u05af") continue;
    if (isLetter) {
      if (open) { out += "</mark>"; open = false; }
      n += 1;
      if (n === letterIndex) { out += '<mark class="bible-mark">'; open = true; }
    }
    out += esc(ch);
  }
  if (open) out += "</mark>";
  return out;
}

/** Index (among the letters) of the first vav carrying a dot and no vowel of its own — the šureq vowel — or -1. */
export function shureqIndex(text) {
  let n = -1;
  let cur = null;
  const done = () => (cur && cur.letter === "ו" && cur.marks.includes("\u05bc") && !/[\u05b0-\u05bb]/.test(cur.marks.replace("\u05bc", "")) ? cur.index : -1);
  for (const ch of text) {
    if (ch >= "\u05d0" && ch <= "\u05ea") {
      const hit = done();
      if (hit >= 0) return hit;
      n += 1;
      cur = { letter: ch, marks: "", index: n };
    } else if (cur) cur.marks += ch;
  }
  return done();
}

/** The plain text of a word with its pieces joined. */
export function wordText(word, showAccents = true) {
  const t = word.t.split("/").join("");
  return showAccents ? t : stripAccents(t);
}

/**
 * Builds a verse element (right-to-left). `opts.mark(wi, word)` may return a piece index to
 * highlight (or -1); `opts.markLetter(wi, word)` highlights one letter instead; `opts.onWord(wi, word, el)` turns words into buttons (for "tap the article").
 */
export function buildVerse(words, { showAccents = true, mark = null, markLetter = null, onWord = null, className = "" } = {}) {
  const el = document.createElement("div");
  el.className = "bible-verse " + className;
  el.setAttribute("lang", "he");
  el.setAttribute("dir", "rtl");
  words.forEach((w, wi) => {
    const joiner = w.m || w.s; // maqqef and sof pasuq attach to the word before
    const span = document.createElement(onWord && !joiner ? "button" : "span");
    if (onWord && !joiner) span.type = "button";
    span.className = "bible-word" + (joiner ? " bible-joiner" : "");
    span.innerHTML = wordHtml(w, { markPiece: mark ? mark(wi, w) : -1, markLetter: markLetter ? markLetter(wi, w) : -1, showAccents });
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
