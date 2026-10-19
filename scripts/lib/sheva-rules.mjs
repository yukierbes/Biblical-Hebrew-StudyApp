// Shevas: vocal or silent, and the reason (from the owner's "Shevas" sheet). The analysis is in hebrew-word.mjs.

export const SHEVA_PATTERNS = [
  { id: "v_first", group: "vocal", label: "Vocal Sheva", explain: "It is vocal: it is under the first consonant of a form." },
  { id: "v_long", group: "vocal", label: "Vocal Sheva", explain: "It is vocal: it comes after an unchangeably long vowel or an unaccented changeably long vowel, so it begins a medial syllable." },
  { id: "v_meteg", group: "vocal", label: "Vocal Sheva", explain: "It is vocal: it comes after a meteg." },
  { id: "v_dagesh", group: "vocal", label: "Vocal Sheva", explain: "It is vocal: it is under a consonant with a dagesh." },
  { id: "v_second", group: "vocal", label: "Vocal Sheva", explain: "It is vocal: it is the second of two shevas together in the middle of a form." },
  { id: "s_short", group: "silent", label: "Silent Sheva", explain: "It is silent: it follows a short unaccented vowel." },
  { id: "s_lene", group: "silent", label: "Silent Sheva", explain: "It is silent: it immediately precedes a dagesh lene." },
  { id: "s_accented", group: "silent", label: "Silent Sheva", explain: "It is silent: it comes after an accented changeably long vowel." },
  { id: "s_first", group: "silent", label: "Silent Sheva", explain: "It is silent: it is the first of two shevas together in the middle of a form." },
  { id: "s_end", group: "silent", label: "Silent Sheva", explain: "It is silent: two shevas together at the end of a form are both silent." },
  { id: "s_kaf", group: "silent", label: "Silent Sheva", explain: "It is silent: it appears in a final kaf (ךְ)." },
];

export const SHEVA_GROUPS = [
  { id: "vocal", label: "Vocal Sheva", patterns: ["v_first", "v_long", "v_meteg", "v_dagesh", "v_second"] },
  { id: "silent", label: "Silent Sheva", patterns: ["s_short", "s_lene", "s_accented", "s_first", "s_end", "s_kaf"] },
];
