export const GENERATOR_COLUMNS = ["Binyan", "Mode", "Person", "Gender", "Number"];

export const BINYAN_ORDER = ["Qal", "Niphal", "Piel", "Pual", "Hitpael", "Hiphil", "Hophal"];

export const MODE_ORDER = [
  "Perfect", "Imperfect", "Jussive", "Cohortative", "Imperative",
  "Infinitive Absolute", "Infinitive Construct",
  "Active Participle", "Passive Participle",
];

export const PERSON_ORDER = ["3", "2", "1"];
export const GENDER_ORDER = ["M", "F", "C"];
export const NUMBER_ORDER = ["S", "P"];

export const ORDER_MAP = {
  Mode: MODE_ORDER,
  Person: PERSON_ORDER,
  Gender: GENDER_ORDER,
  Number: NUMBER_ORDER,
};

// Datasets that use the Polel/Polal/Hitpolel binyan set instead of Piel/Pual/Hitpael
export const POLEL_DATASETS = new Set([
  "II-Yod Vav (קום)",
  "II-Geminate (סבב)",
]);

export const BINYAN_ORDER_WITH_POLEL = [
  "Qal", "Niphal", "Piel", "Polel", "Pual", "Polal", "Hitpael", "Hitpolel", "Hiphil", "Hophal",
];

export const BINYAN_ORDER_ONLY_POLEL = [
  "Qal", "Niphal", "Polel", "Polal", "Hitpolel", "Hiphil", "Hophal",
];

// Answer-input option lists that include an "NA" (blank) option, used in
// Parsing practice/quiz dropdowns.
export const MODE_OPTIONS = [...MODE_ORDER];
export const PERSON_OPTIONS_NA = ["3", "2", "1", "NA"];
export const GENDER_OPTIONS_NA = ["M", "F", "C", "NA"];
export const NUMBER_OPTIONS_NA = ["S", "P", "NA"];
