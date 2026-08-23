const MORPH_COLUMNS = ["Binyan", "Mode", "Person", "Gender", "Number"];

const FRIENDLY_VALUE_LABELS = {
  Person: { "3": "3rd person", "2": "2nd person", "1": "1st person" },
  Gender: { M: "masculine", F: "feminine", C: "common" },
  Number: { S: "singular", P: "plural" },
};

function friendlyValue(field, value) {
  return (FRIENDLY_VALUE_LABELS[field] && FRIENDLY_VALUE_LABELS[field][value]) || value;
}

/**
 * Many written Hebrew forms are genuinely ambiguous — the exact same
 * Conjugation string is the correct spelling for more than one
 * morphological parsing (e.g. Imperfect 3fs/2ms and Jussive 3fs/2ms
 * often collapse to one written form). `matchingRows` should be every
 * row in the dataset that shares the target's Conjugation string
 * (including the target itself).
 *
 * Returns one elimination-style hint per ambiguous field — a field is
 * only included if it actually varies across the matching rows, so an
 * unambiguous form yields no hints at all.
 */
export function computeAmbiguityHints(target, matchingRows) {
  if (!matchingRows || matchingRows.length <= 1) return [];

  const hints = [];
  for (const field of MORPH_COLUMNS) {
    const targetValue = target[field];
    const otherValues = [
      ...new Set(
        matchingRows
          .map((r) => r[field])
          .filter((v) => v !== targetValue && (v ?? "").toString().trim() !== "")
      ),
    ];
    if (otherValues.length === 0) continue;

    const labels = otherValues.map((v) => friendlyValue(field, v));
    const text =
      labels.length === 1
        ? `Not ${labels[0]}`
        : `Not ${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
    hints.push({ field, text });
  }
  return hints;
}

/** Mirrors is_valid_combo(row). */
export function isValidCombo(row) {
  return (row.Conjugation ?? "").toString().trim() !== "";
}

/** Mirrors get_filtered_rows(df, filters). */
export function getFilteredRows(rows, filters) {
  let out = rows;
  for (const [col, vals] of Object.entries(filters || {})) {
    if (vals && vals.length) {
      const set = new Set(vals);
      out = out.filter((r) => set.has((r[col] ?? "").toString()));
    }
  }
  return out;
}

/**
 * Mirrors group_by_conjugation(df, preserve_cols): one row per unique
 * combination of morphological features (+ preserve cols), keeping the
 * first matching row.
 */
export function groupByConjugation(rows, preserveCols = []) {
  const groupCols = [...MORPH_COLUMNS, ...preserveCols.filter((c) => !MORPH_COLUMNS.includes(c))];
  const seen = new Map();
  const order = [];
  for (const r of rows) {
    if (!isValidCombo(r) && r.Conjugation === undefined) continue;
    const key = groupCols.map((c) => r[c] ?? "").join("||");
    if (!seen.has(key)) {
      seen.set(key, r);
      order.push(key);
    }
  }
  return order.map((k) => seen.get(k));
}

/**
 * Mirrors the construction-quiz style grouping: group by morph columns
 * (+ Dataset), aggregating Conjugation / Gloss Translation into arrays.
 */
export function groupByConjugationList(rows, groupCols = [...MORPH_COLUMNS, "Dataset"]) {
  const map = new Map();
  const order = [];
  for (const r of rows) {
    const key = groupCols.map((c) => r[c] ?? "").join("||");
    if (!map.has(key)) {
      const base = {};
      for (const c of groupCols) base[c] = r[c] ?? "";
      base.Conjugation = [];
      base["Gloss Translation"] = [];
      map.set(key, base);
      order.push(key);
    }
    const entry = map.get(key);
    entry.Conjugation.push(r.Conjugation);
    entry["Gloss Translation"].push(r["Gloss Translation"]);
  }
  return order.map((k) => map.get(k));
}

/** Random sample of n items from array without replacement (n <= array.length required). */
function sampleWithoutReplacement(array, n) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** Random sample of n items, allowing replacement if n > array.length. */
export function sampleN(array, n, allowGrowWithReplacement = true) {
  if (array.length === 0) return [];
  if (n <= array.length) return sampleWithoutReplacement(array, n);
  if (!allowGrowWithReplacement) return sampleWithoutReplacement(array, array.length);

  const base = sampleWithoutReplacement(array, array.length);
  const remainder = n - array.length;
  const extra = [];
  for (let i = 0; i < remainder; i++) {
    extra.push(array[Math.floor(Math.random() * array.length)]);
  }
  return base.concat(extra);
}

export function pickOne(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/** Stable key for a morphological combo, used to track what's already been shown. */
export function morphKey(item) {
  return MORPH_COLUMNS.map((c) => item[c] ?? "").join("|") + "|" + (item.Dataset ?? "");
}

/**
 * Picks a random item from `pool`, preferring ones not yet in
 * `shownKeys` so a practice session cycles through the full set of
 * available forms before any repeat, rather than drawing uniformly at
 * random every time (which tends to over-show a handful of common
 * forms and under-show rarer ones). Once every item has been shown,
 * the cycle resets and starts preferring fresh draws again.
 */
export function pickCycling(pool, shownKeys) {
  if (!pool || pool.length === 0) return null;
  let available = pool.filter((item) => !shownKeys.has(morphKey(item)));
  if (available.length === 0) {
    shownKeys.clear();
    available = pool;
  }
  const picked = pickOne(available);
  shownKeys.add(morphKey(picked));
  return picked;
}

/** Convert an array of row objects into CSV text for the given columns. */
export function toCSV(rows, columns) {
  const escape = (v) => {
    const s = (v ?? "").toString();
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.map(escape).join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => escape(r[c])).join(","));
  }
  return lines.join("\n");
}

export function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCSV(rows, columns, filename) {
  const csv = toCSV(rows, columns);
  downloadBlob(csv, filename, "text/csv;charset=utf-8;");
}

/** Requires the SheetJS `XLSX` global (loaded via CDN script tag in index.html). */
export function downloadXLSX(rows, columns, filename, sheetName = "Sheet1") {
  const data = rows.map((r) => {
    const o = {};
    for (const c of columns) o[c] = r[c];
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

const HEBREW_RUN = /[\u0590-\u05FF\uFB1D-\uFB4F]+/g;

/**
 * Wrap any run of Hebrew-script characters in a `<span lang="he" dir="rtl">`
 * so it can be reliably targeted with the Hebrew font, while leaving
 * surrounding Latin text untouched. Safe to call on strings with no
 * Hebrew at all (returns the escaped string unchanged).
 */
export function wrapHebrewSpans(value) {
  const text = (value ?? "").toString();
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(HEBREW_RUN, (m) => `<span lang="he" dir="rtl">${m}</span>`);
}

export function normalizeAnswer(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" / ");
  return value.toString();
}

/**
 * Strips Hebrew niqqud (vowel points), cantillation marks, and related
 * combining diacritics (Unicode range \u0591–\u05C7) from a string,
 * leaving the base consonant letters untouched. Used for
 * diacritic-insensitive Hebrew search — "קטל" should find "קָטַל".
 */
export function stripNiqqud(value) {
  return (value ?? "").toString().normalize("NFC").replace(/[\u0591-\u05C7]/g, "");
}

export { MORPH_COLUMNS };
