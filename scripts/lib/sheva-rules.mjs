// Shevas: vocal or silent, and the reason (from the owner's "Shevas" sheet). The analysis is in hebrew-word.mjs.
//   reason  = the bullet in the pattern guide ("A simple sheva is vocal if: • It …")
//   explain = what is shown after an answer: the lead sentence, then the reason

const VOCAL = "It is a vocal sheva.";
const SILENT = "It is a silent sheva.";
const P = (id, group, lead, reason) => ({ id, group, label: group === "vocal" ? "Vocal Sheva" : "Silent Sheva", reason, explain: `${lead} ${reason}` });

export const SHEVA_PATTERNS = [
  P("v_first", "vocal", VOCAL, "It is under the first consonant of a form."),
  P("v_long", "vocal", VOCAL, "It comes after an unchangeably long vowel or an unaccented changeably long vowel, so it begins a medial syllable."),
  P("v_meteg", "vocal", VOCAL, "It comes after a meteg."),
  P("v_dagesh", "vocal", VOCAL, "It is under a consonant with a dagesh."),
  P("v_second", "vocal", VOCAL, "It is the second of two shevas together in the middle of a form."),
  P("s_short", "silent", SILENT, "It follows a short unaccented vowel."),
  P("s_lene", "silent", SILENT, "It immediately precedes a dagesh lene."),
  P("s_accented", "silent", SILENT, "It comes after an accented changeably long vowel."),
  P("s_first", "silent", SILENT, "It is the first of two shevas together in the middle of a form."),
  P("s_end", "silent", SILENT, "It is one of two shevas together at the end of a form (both are silent)."),
  P("s_kaf", "silent", SILENT, "It appears in a final kaf (ךְ)."),
];

export const SHEVA_GROUPS = [
  { id: "vocal", label: "Vocal Sheva", intro: "A simple sheva is vocal if:", patterns: ["v_first", "v_long", "v_meteg", "v_dagesh", "v_second"] },
  { id: "silent", label: "Silent Sheva", intro: "A simple sheva is silent if:", patterns: ["s_short", "s_lene", "s_accented", "s_first", "s_end", "s_kaf"] },
];
