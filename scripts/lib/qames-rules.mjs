// Qameṣ vs qameṣ-ḥaṭuf: the patterns and the wording shown in the app (from the owner's "Qameṣ vs Qameṣ-ḥaṭuf" sheet).
// The analysis itself is in hebrew-word.mjs.

export const QAMES_PATTERNS = [
  { id: "qames_open", group: "qames", label: "Qameṣ", explain: "It is a qameṣ: it stands in an open syllable." },
  { id: "qames_vocal_sheva", group: "qames", label: "Qameṣ", explain: "It is a qameṣ: it is followed by a simple vocal sheva (usually accompanied by a meteg)." },
  { id: "qames_closed_accented", group: "qames", label: "Qameṣ", explain: "It is a qameṣ: it is in a closed accented syllable." },
  { id: "qames_closed_meteg", group: "qames", label: "Qameṣ", explain: "It is a qameṣ: it is in a closed unaccented syllable, but the syllable has a meteg." },
  { id: "hatuf_closed", group: "hatuf", label: "Qameṣ-ḥaṭuf", explain: "It is a qameṣ-ḥaṭuf: it is in a closed unaccented syllable." },
  { id: "hatuf_hataf", group: "hatuf", label: "Qameṣ-ḥaṭuf", explain: "It is a qameṣ-ḥaṭuf: it stands in an open syllable, but it precedes a ḥāṭef-qāmeṣ." },
  { id: "hatuf_before_hatuf", group: "hatuf", label: "Qameṣ-ḥaṭuf", explain: "It is a qameṣ-ḥaṭuf: it stands in an open syllable, but it precedes another qameṣ-ḥaṭuf." },
];

export const QAMES_GROUPS = [
  { id: "qames", label: "Qameṣ", patterns: ["qames_open", "qames_vocal_sheva", "qames_closed_accented", "qames_closed_meteg"] },
  { id: "hatuf", label: "Qameṣ-ḥaṭuf", patterns: ["hatuf_closed", "hatuf_hataf", "hatuf_before_hatuf"] },
];
