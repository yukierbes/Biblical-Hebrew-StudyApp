// Qameṣ vs qameṣ-ḥaṭuf: the patterns and the wording shown in the app (from the owner's "Qameṣ vs Qameṣ-ḥaṭuf" sheet).
// The analysis itself is in hebrew-word.mjs.
//   reason  = the bullet in the pattern guide ("A vowel is a qameṣ if: • It …")
//   explain = what is shown after an answer: the lead sentence, then the reason

const QAMES = "It is a qameṣ.";
const HATUF = "It is a qameṣ-ḥaṭuf.";
const P = (id, group, lead, reason) => ({ id, group, label: group === "qames" ? "Qameṣ" : "Qameṣ-ḥaṭuf", reason, explain: `${lead} ${reason}` });

export const QAMES_PATTERNS = [
  P("qames_open", "qames", QAMES, "It stands in an open syllable."),
  P("qames_vocal_sheva", "qames", QAMES, "It is followed by a simple vocal sheva (usually accompanied by a meteg)."),
  P("qames_closed_accented", "qames", QAMES, "It is in a closed accented syllable."),
  P("qames_closed_meteg", "qames", QAMES, "It is in a closed unaccented syllable with a meteg."),
  P("hatuf_closed", "hatuf", HATUF, "It is in a closed unaccented syllable."),
  P("hatuf_hataf", "hatuf", HATUF, "It is in an open syllable and precedes a ḥāṭef-qāmeṣ (with or without a meteg)."),
  P("hatuf_before_hatuf", "hatuf", HATUF, "It is in an open syllable and precedes another qameṣ-ḥaṭuf."),
];

export const QAMES_GROUPS = [
  { id: "qames", label: "Qameṣ", intro: "A vowel is a qameṣ if:", patterns: ["qames_open", "qames_vocal_sheva", "qames_closed_accented", "qames_closed_meteg"] },
  { id: "hatuf", label: "Qameṣ-ḥaṭuf", intro: "A vowel is a qameṣ-ḥaṭuf if:", patterns: ["hatuf_closed", "hatuf_hataf", "hatuf_before_hatuf"] },
];
