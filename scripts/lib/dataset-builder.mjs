// A generic builder for the Bible practice datasets whose examples are WORDS (or a piece of a word) that a classifier
// recognises. A classifier is called for every word of every verse: classify(w, ctx) -> null (not relevant) or
// { pattern | null, why?, extra?: [..], example?: {..} }.
//   pattern null  -> the word is relevant but cannot be sorted with confidence: it is held back
//   extra         -> values stored on the word in the verse: { t, x: [pattern, ...extra] }
//   example       -> extra fields stored on the practice example
// Only verses of at most `shortWords` words (and the passage verses) are written to the data file.

export function buildWordDataset({ verses, passages, classify, shortWords = 12 }) {
  const out = { verses: {}, examples: [], held: [], counts: {}, totals: {} };
  const passageRefs = new Set(passages.flatMap((p) => p.verses));
  const wordCount = (v) => v.words.filter((w) => !w.seg).length;
  for (const v of verses) {
    const short = wordCount(v) <= shortWords;
    let any = false;
    const words = v.words.map((w, wi) => {
      if (w.seg === "x-maqqef") return { t: w.text, m: 1 };
      if (w.seg) return { t: w.text, s: 1 };
      const ctx = { verse: v, wi, words: v.words, beforeMaqqef: !!(v.words[wi + 1] && v.words[wi + 1].seg === "x-maqqef"), lastInVerse: !v.words.slice(wi + 1).some((x) => !x.seg) };
      const r = classify(w, ctx);
      if (!r) return { t: w.text };
      any = true;
      if (!r.pattern) {
        out.totals.held = (out.totals.held || 0) + 1;
        if (short) out.held.push({ ref: v.ref, wi, reason: r.why });
        return { t: w.text, xh: 1 };
      }
      out.totals[r.pattern] = (out.totals[r.pattern] || 0) + 1;
      if (short) {
        out.examples.push({ ref: v.ref, wi, pattern: r.pattern, ...(r.example || {}) });
        out.counts[r.pattern] = (out.counts[r.pattern] || 0) + 1;
      }
      return { t: w.text, x: [r.pattern, ...(r.extra || [])] };
    });
    // a verse is kept when it has something to practise (or is a passage verse): verses with nothing in them are left out
    if ((short && any) || passageRefs.has(v.ref)) out.verses[v.ref] = words;
  }
  return out;
}

/** The pieces of a word and where each starts among the word's letters: { pieces, tags, starts, ends } (ends are inclusive). */
export function pieceInfo(w, morphParts) {
  const pieces = w.text.split("/");
  const tags = morphParts(w.morph);
  if (pieces.length !== tags.length) return null;
  const starts = [];
  const ends = [];
  let n = 0;
  for (const p of pieces) {
    const c = [...p].filter((ch) => ch >= "א" && ch <= "ת").length;
    starts.push(n);
    ends.push(n + c - 1);
    n += c;
  }
  return { pieces, tags, starts, ends };
}
