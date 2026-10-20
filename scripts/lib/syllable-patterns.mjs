// The five syllable rules from the owner's "Syllables & Stress" sheet (plus "other"), and the answer choices.
export const SYLLABLE_PATTERNS = [
  { id: "CAPL", group: "CAPL", label: "CAPL", explain: "CAPL: a closed accented syllable prefers a long vowel." },
  { id: "OPRL", group: "OPRL", label: "OPRL", explain: "OPRL: an open pretonic syllable requires a long vowel." },
  { id: "CURS", group: "CURS", label: "CURS", explain: "CURS: a closed unaccented syllable requires a short vowel." },
  { id: "OAPS", group: "OAPS", label: "OAPS", explain: "OAPS: an open accented syllable prefers a short vowel." },
  { id: "OOPPS", group: "OOPPS", label: "OOPPS", explain: "OOPPS: an originally open propretonic syllable gets a sheva." },
  { id: "other", group: "other", label: "Other", explain: "This syllable does not show one of the five patterns, so it is an exception to them or follows a different pattern." },
];
export const SYLLABLE_GROUPS = SYLLABLE_PATTERNS.map((p) => ({ id: p.id, label: p.label, patterns: [p.id] }));
