// Transliteration letters with a dot below (ṣ ḥ ṭ ḍ ẓ ṛ ṇ) written so the CURRENT font can draw them itself.
//
// Why: IBM Plex Sans and Plex Mono (the body fonts) have the dot-below mark as a separate combining character but no
// ready-made ṣ, ḥ or ṭ, while Fraunces (the heading font) has the ready-made letters but not the combining mark.
// A letter the font lacks is borrowed from another font, which is why such letters came out a different size
// from their neighbours. The vowel and consonant data store "s + dot", which Plex draws well; the Bible pages
// store the single-character form. This module makes both come out right wherever they are shown:
//   - in body text and buttons (Plex): s + combining dot below
//   - in headings (Fraunces): the single character
// Only the characters are swapped. The words themselves are never changed, and typed answers are not touched.

const BASES = "SsHhTtDdZzRrNn";
const COMPOSED = /[\u1E62\u1E63\u1E24\u1E25\u1E6C\u1E6D\u1E0C\u1E0D\u1E92\u1E93\u1E5A\u1E5B\u1E46\u1E47]/g;
const DECOMPOSED = new RegExp(`[${BASES}]\\u0323`, "g");
const ANY = new RegExp(`[\\u1E62\\u1E63\\u1E24\\u1E25\\u1E6C\\u1E6D\\u1E0C\\u1E0D\\u1E92\\u1E93\\u1E5A\\u1E5B\\u1E46\\u1E47]|[${BASES}]\\u0323`);

/** `text` with its dot-below letters in one form: single characters (`composed` true) or letter + dot (false). */
export function setDotForm(text, composed) {
  if (!ANY.test(text)) return text;
  return composed ? text.replace(DECOMPOSED, (m) => m.normalize("NFC")) : text.replace(COMPOSED, (m) => m.normalize("NFD"));
}

/** Whether an element is set in the heading font (the one that has the single-character letters). */
export function isHeadingFont(el, getStyle = (e) => getComputedStyle(e)) {
  const family = (getStyle(el).fontFamily || "").split(",")[0] || "";
  return /fraunces/i.test(family);
}

/** Fixes every text node under `root` (a node or an element). Returns how many were changed. */
export function fixDotsIn(root, { getStyle } = {}) {
  let changed = 0;
  const handle = (node) => {
    const v = node.nodeValue;
    if (!v || !ANY.test(v)) return;
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, textarea")) return;
    const next = setDotForm(v, isHeadingFont(parent, getStyle));
    if (next !== v) {
      node.nodeValue = next;
      changed += 1;
    }
  };
  if (root.nodeType === 3) {
    handle(root);
    return changed;
  }
  const walker = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let n;
  while ((n = walker.nextNode())) handle(n);
  return changed;
}

/**
 * Starts keeping the whole page right, now and as it changes. Does nothing where fonts are not in play (a test
 * environment without document.fonts), so text there stays exactly as the code wrote it.
 */
export function initLatinMarks() {
  if (typeof document === "undefined" || !document.fonts || !document.body) return null;
  fixDotsIn(document.body);
  let queue = [];
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const todo = queue;
    queue = [];
    for (const n of todo) if (n.isConnected) fixDotsIn(n);
  };
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") queue.push(r.target);
      else r.addedNodes.forEach((n) => queue.push(n));
    }
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  return obs;
}
