// How a chapter is split into sections for the Reading page: about 8 to 12 verses each, ending at a paragraph mark
// (a petuhah or setumah) when one is close to the even split. A chapter of up to 12 verses is a single section.

/** [[1, 9], [10, 18], ...] for a chapter of n verses. `paraEnds` holds the verse numbers that end a paragraph. */
export function sectionsFor(n, paraEnds = new Set()) {
  if (n <= 12) return [[1, n]];
  const k = Math.ceil(n / 10);
  const out = [];
  let start = 1;
  for (let i = 1; i < k; i++) {
    const target = Math.round((n * i) / k);
    let end = target;
    for (const d of [0, 1, -1, 2, -2]) {
      const c = target + d;
      if (paraEnds.has(c) && c - start + 1 >= 5 && n - c >= 5) { end = c; break; }
    }
    end = Math.min(Math.max(end, start + 3), n - 4);
    out.push([start, end]);
    start = end + 1;
  }
  out.push([start, n]);
  return out;
}

