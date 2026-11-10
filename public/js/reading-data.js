// Turns a Reading chapter file (see scripts/build-reading.mjs, "compactWord") back into the word objects the page
// works with, and names passages. Pure functions: nothing here touches the page or the network.
//
// A word object is { t, parts: [[piece, label], …], lem?, gl?, root?, a?, pos } (t has "/" between its pieces);
//   { t, m: 1 } is a maqqef and { t, s: 1 } another mark (sof pasuq, paseq, a paragraph mark);
//   { t, kq: { words: […], gap } } is a ketiv/qere pair: t is the ketiv's CONSONANTS (what is written), kq.words are
//   the qere (what is read) as ordinary word objects, and gap is true when the word is read but not written (t is "").
//   a: 1 on a word means Aramaic.

const stripMarks = (s) => s.replace(/[^\u05d0-\u05ea]/g, "");

/** The root of a verb from its dictionary form: three letters joined with dashes, else "". */
export function rootOf(lem) {
  const letters = [...stripMarks(lem || "")];
  return letters.length === 3 ? letters.join(" – ") : "";
}

function expandItem(it, L, X) {
  const kind = it[0];
  if (kind === 1) return { t: it[1], m: 1 };
  if (kind === 2) return { t: it[1], s: 1 };
  if (kind === 3 || kind === 4) {
    const w = { t: it[1], kq: { words: it[2].map((x) => expandItem(x, L, X)), gap: kind === 4 } };
    if (it[3] & 2) w.a = 1;
    return w;
  }
  const [t, flat, x, flags, pos] = it;
  const parts = [];
  for (let i = 0; i < flat.length; i += 2) parts.push([flat[i], L[flat[i + 1]]]);
  const w = { t, parts, pos: pos || "" };
  if (x >= 0 && X[x]) {
    w.lem = X[x][0];
    if (X[x][1]) w.gl = X[x][1];
    if (flags & 1) {
      const root = rootOf(X[x][0]);
      if (root) w.root = root;
    }
  }
  if (flags & 2) w.a = 1;
  return w;
}

/**
 * One chapter file -> { book, chapter, count, headings (verses at the start that are a psalm's heading), sections: [{ from, to, verses: [refs] }], verses: { ref: [word …] }, english: { ref: text } }
 */
export function expandChapter(raw) {
  const verses = {};
  const english = {};
  for (let n = 1; n <= raw.n; n++) {
    const ref = `${raw.b}.${raw.c}.${n}`;
    verses[ref] = (raw.v[n] || []).map((it) => expandItem(it, raw.L, raw.X));
    if (raw.e[n]) english[ref] = raw.e[n];
  }
  const sections = raw.s.map(([from, to]) => ({
    from,
    to,
    verses: Array.from({ length: to - from + 1 }, (_, i) => `${raw.b}.${raw.c}.${from + i}`),
  }));
  return { book: raw.b, chapter: raw.c, count: raw.n, headings: raw.h || 0, sections, verses, english };
}

/** "Gen.12.3" -> { book: "Gen", chapter: 12, verse: 3 } */
export function parseRef(ref) {
  const [book, c, v] = String(ref).split(".");
  return { book, chapter: Number(c), verse: Number(v) };
}

/** The dataset name of a chapter: rd-gen-1 */
export const chapterDatasetName = (bookId, chapter) => `rd-${bookId.toLowerCase()}-${chapter}`;

/** A plain reference: "Genesis 1:1–9", "Psalm 23:1–6", "Genesis 1:1" for a single verse. */
export function plainRef(bookName, chapter, from, to) {
  return `${bookName} ${chapter}:${from}${to > from ? `–${to}` : ""}`;
}

/** The words of a verse as they are READ: a ketiv/qere pair counts as its qere words; a plain word as itself. Marks are left out. */
export function readWords(words) {
  const out = [];
  words.forEach((w, wi) => {
    if (w.m || w.s) return;
    if (w.kq) {
      for (const q of w.kq.words) if (!q.m && !q.s) out.push({ w: q, wi, fromKq: true });
    } else out.push({ w, wi, fromKq: false });
  });
  return out;
}
