// Accent-aware reading: which accent divides a verse, and how strong each pause is.
//
// The accent marks stay in the text exactly as they are. This module only READS them: it looks each mark up in
// the app's Accents data (prose or poetry set), and reports which words end a phrase (a disjunctive accent), how
// strong that division is (group 1 strongest to group 4), and the verse's main division: the atnakh if the verse
// has one, otherwise its strongest disjunctive before the last. Silluq is the accent of the last word; the same
// mark (ֽ) elsewhere in a verse is a meteg, which is not an accent.

const SILLUQ = "\u05BD";
const BASE = /\u25CC/g;

/** Looks accents up by character: { prose: Map, poetry: Map }. */
export function buildAccentIndex(rows) {
  const index = { prose: new Map(), poetry: new Map() };
  for (const r of rows || []) {
    const ch = String(r.Symbol || "").replace(BASE, "").trim();
    if (!ch) continue;
    const set = /Poetry/i.test(r.Type) ? index.poetry : index.prose;
    if (set.has(ch)) continue;
    set.set(ch, {
      ch,
      name: r.EnglishName,
      hebrewName: r.HebrewName,
      disjunctive: /Disjunctive/i.test(r.Type),
      group: parseInt(r.Group, 10) || 0, // 1 (strongest) to 4; 0 for conjunctives
    });
  }
  return index;
}

/** Books whose accents are the poetic set. */
export const isPoetryBook = (book) => book === "Ps";

/**
 * Reads the accents of one verse (an array of reading words).
 *   words: [{ wi, accents: [accent], pause: accent|null }]  (pause = the disjunctive on the word, if any)
 *   main:  { wi, accent } | null   the verse's main division
 *   last:  the index of the last real word
 */
export function analyzeVerse(words, { poetry = false, index }) {
  const set = poetry ? index.poetry : index.prose;
  let last = -1;
  words.forEach((w, i) => {
    if (!w.m && !w.s) last = i;
  });
  const out = words.map((w, wi) => {
    const accents = [];
    if (!w.m && !w.s) {
      for (const ch of w.t || "") {
        if (ch === SILLUQ) continue; // handled below: silluq only on the last word
        const a = set.get(ch);
        if (a && !accents.includes(a)) accents.push(a);
      }
      if (wi === last && (w.t || "").includes(SILLUQ)) {
        const sil = set.get(SILLUQ);
        if (sil) accents.push(sil);
      }
    }
    const disj = accents.filter((a) => a.disjunctive).sort((a, b) => a.group - b.group)[0] || null;
    return { wi, accents, pause: disj };
  });
  // The main division: an atnakh if there is one; otherwise the strongest disjunctive (not the last word's silluq).
  let main = null;
  const atnach = out.find((o) => o.pause && /atna/i.test(o.pause.name));
  if (atnach) main = { wi: atnach.wi, accent: atnach.pause };
  else {
    const candidates = out.filter((o) => o.pause && o.wi !== last).sort((a, b) => a.pause.group - b.pause.group || a.wi - b.wi);
    if (candidates.length) main = { wi: candidates[0].wi, accent: candidates[0].pause };
  }
  return { words: out, main, last };
}

/** "group 1 (strongest)" ... "group 4 (weakest)" for display. */
export function groupLabel(group) {
  return group === 1 ? "group 1 (strongest)" : group === 4 ? "group 4 (weakest)" : `group ${group}`;
}
