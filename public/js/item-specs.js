// How each kind of study item describes itself to the item tray (see item-tray.js):
// which personal-list area it belongs to, its stable key, and a plain-text label for the
// dialogs and for reports. The keys are the same ones the spaced-repetition schedule uses.

import { vocabRowKey } from "./vocab-overrides.js";
import { accentRowKey } from "./accent-filters.js";
import { morphKey } from "./helpers.js";

export function vocabSpec(row) {
  return {
    area: "vocab",
    key: vocabRowKey(row),
    label: [row.Hebrew, row.English].filter(Boolean).join(" — "),
  };
}

/** A consonant or vowel; `set` is the letter set from letter-sets.js. */
export function letterSpec(set, row) {
  return {
    area: set.id,
    key: set.rowKey(row),
    label: [row.Name, row.Form].filter(Boolean).join(" "),
  };
}

export function accentSpec(row) {
  return {
    area: "accents",
    key: accentRowKey(row),
    label: [row.HebrewName, row.EnglishName].filter(Boolean).join(" — "),
  };
}

/** The verb root (paradigm) a verb row belongs to: this is what gets starred and noted. */
export function verbRootSpec(row) {
  return { area: "verbs", key: row.Dataset, label: row.Dataset };
}

/**
 * One verb form: starring and noting still belong to the root, but a report names the
 * exact form so the owner can find the cell ("Strong Verb (קטל) · Qal · Perfect · 3MS").
 * `hideForm` leaves the Hebrew answer out of the label, for screens that ask the student
 * to produce it (Construction), so the report dialog can't give the answer away.
 */
export function verbFormSpec(row, { hideForm = false } = {}) {
  const parts = [row.Dataset, row.Binyan, row.Mode, [row.Person, row.Gender, row.Number].filter(Boolean).join("")].filter(Boolean);
  const where = parts.join(" · ");
  const form = !hideForm && row.Conjugation ? `${row.Conjugation}${row["Gloss Translation"] ? " (" + row["Gloss Translation"] + ")" : ""}` : "";
  return {
    ...verbRootSpec(row),
    reportKey: morphKey(row),
    reportLabel: form ? `${where}: ${form}` : where,
  };
}
