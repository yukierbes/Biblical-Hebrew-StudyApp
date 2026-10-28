// The word-level grammar pages of "Bible in Context": Nouns, Independent Personal Pronouns, Demonstratives,
// Adjectives, Interrogative ה, Prefixed Vav, Prefixed מִן and Verbs. Every page has the same four tabs and is built on
// the shared engine in ../bible-practice.js; this file only says what is specific to each page: what is highlighted,
// which answer boxes there are, what "Find" asks for, and what the guide shows.
//
// The rules and the data are made at build time (scripts/lib/grammar-rules.mjs, verb-rules.mjs and
// scripts/build-bible.mjs) from the Open Scriptures Hebrew Bible tagging and the owner's rule sheets.

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef } from "../bible-text.js";

const CIRCLE = "\u25cc";

// ---------------------------------------------------------------- shared helpers
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const range = (ex) => ({ markLetter: [ex.from ?? 0, ex.to ?? 999] });

/** Steps for a guided passage: one per tagged word, built from the word's `x` values by `fields`. */
const stepsOf = (fields) => (data, passage) => {
  const steps = [];
  for (const ref of passage.verses) {
    (data.verses[ref] || []).forEach((w, wi) => {
      if (w.x) steps.push({ ref, wi, pattern: w.x[0], ...fields(w.x) });
    });
  }
  return steps;
};

/** Up to `n` examples, spread out, each with its marked part highlighted. */
function exampleRow(mk, data, filter, markOf, showAccents, n = 3) {
  const ex = data.examples.filter(filter);
  const picks = [];
  const step = Math.max(1, Math.floor(ex.length / n));
  for (let i = 0; i < ex.length && picks.length < n; i += step) picks.push(ex[i]);
  const list = mk("div", "bible-guide-examples");
  for (const e of picks) {
    const w = data.verses[e.ref][e.wi];
    const item = mk("span", "bible-guide-example");
    item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${wordHtml(w, { ...markOf(e), showAccents })}</span> <span class="caption">${prettyRef(e.ref)}</span>`;
    list.appendChild(item);
  }
  return list;
}

/** A table card. `head` is an array of column titles; `rows` an array of arrays of strings; Hebrew columns are given by index. */
function tableCard(mk, title, intro, head, rows, hebrewCols = []) {
  const card = mk("div", "bible-guide-card");
  card.appendChild(mk("h3", "", title));
  if (intro) card.appendChild(mk("p", "", intro));
  const wrap = mk("div", "bible-table-scroll");
  const table = mk("table", "bible-suffix-table");
  const hr = mk("tr");
  for (const h of head) hr.appendChild(mk("th", "", h));
  table.appendChild(hr);
  for (const r of rows) {
    const tr = mk("tr");
    r.forEach((cell, i) => {
      const td = mk("td", hebrewCols.includes(i) ? "he-cell" : "");
      if (hebrewCols.includes(i)) {
        td.setAttribute("lang", "he");
        td.textContent = cell;
      } else td.innerHTML = hebrewHtml(cell);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  card.appendChild(wrap);
  return card;
}
const choicesOf = (labels) => labels.map((l) => ({ id: l, label: l }));
const typeHit = (w, type) => !!(w.x && w.x[0] === type);

// ---------------------------------------------------------------- Nouns
const nounPage = createPractice({
  dataset: "bible-noun",
  historyMode: "bible-noun",
  title: "Nouns",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "noun",
  promptText: "Is the highlighted noun absolute or construct, and what are its gender and number?",
  answerParts: (data) => [
    { title: "Absolute or construct", choices: data.groups.map((g) => ({ id: g.id, label: g.label })), answerOf: (ex) => ex.pattern },
    { title: "Gender and number", choices: choicesOf(data.gn), answerOf: (ex) => ex.gn },
  ],
  markWord: range,
  steps: stepsOf((x) => ({ gn: x[1], from: x[2], to: x[3] })),
  describe: (w, ex) => hebrewHtml(`This noun is ${ex.pattern}, ${ex.gn}.`),
  findTab: {
    label: "Find the noun",
    level: "word",
    types: [{ id: "absolute", label: "Absolute" }, { id: "construct", label: "Construct" }],
    prompt: (t) => `Tap every ${t.toLowerCase()} noun, then check.`,
    candidate: (words, type) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 12 && words.some((w) => typeHit(w, type)) && !words.some((w) => w.xh); },
    isTarget: (w, type) => typeHit(w, type),
    trap: (w, type) => (w.x ? `That noun is ${w.x[0]}, not ${type}.` : null),
    legend: "Green = correct, dotted green border = missed, red = not that kind of noun.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Noun patterns with real word examples from Genesis."));
    const defs = el("div", "bible-guide-card");
    defs.appendChild(el("h3", "", "Absolute and construct"));
    defs.appendChild(el("p", "", "Nouns may occur in two forms, either absolute or construct."));
    defs.appendChild(el("p", "", "An absolute noun stands on its own, or is the last noun of a construct chain."));
    defs.appendChild(el("p", "", "A construct noun is the first (or a middle) noun of a construct chain: it is linked to the noun that follows it."));
    for (const id of ["absolute", "construct"]) {
      defs.appendChild(el("p", "caption", `${cap(id)}:`));
      defs.appendChild(exampleRow(el, data, (e) => e.pattern === id, range, showAccents));
    }
    body.appendChild(defs);
    body.appendChild(tableCard(el, "Endings", "GN = gender and number.", ["GN", "Absolute", "Construct"], data.table.map((r) => [r.gn, r.absolute === "—" ? "—" : CIRCLE + r.absolute.replace(/ or /g, ` or ${CIRCLE}`), r.construct === "—" ? "—" : CIRCLE + r.construct.replace(/ or /g, ` or ${CIRCLE}`)]), [1, 2]));
    body.appendChild(el("p", "caption", "There is no distinct masculine singular form for absolute or construct nouns, but a construct masculine singular noun may show vowel reduction because it has lost the primary stress."));
    const chain = el("div", "bible-guide-card bible-watch");
    chain.appendChild(el("h3", "", "The construct chain"));
    chain.appendChild(el("p", "", "Two or more nouns can form a construct chain. The relationship between them is often a genitive one, and can be translated with “of” (for example “the house of the king”)."));
    chain.appendChild(el("p", "bible-rule", "• The final noun of a construct chain is always absolute, and it determines the definiteness of the whole chain."));
    chain.appendChild(el("p", "bible-rule", "• The accent is drawn to the final noun, which may lead to vowel reduction in the construct noun or nouns before it."));
    chain.appendChild(el("p", "bible-rule", "• Construct chains are sometimes, but not always, joined by a maqqef."));
    body.appendChild(chain);
  },
});

// ---------------------------------------------------------------- Independent personal pronouns
const pronounPage = createPractice({
  dataset: "bible-pronoun",
  historyMode: "bible-pronoun",
  title: "Independent Personal Pronouns",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "pronoun",
  promptText: "What are the person, gender and number (PGN) of the highlighted pronoun?",
  markWord: range,
  steps: stepsOf((x) => ({ from: x[1], to: x[2] })),
  describe: (w, ex) => hebrewHtml(`This is the independent personal pronoun for ${ex.pattern.slice(1).toUpperCase()}.`),
  findTab: {
    label: "Find the pronoun",
    level: "word",
    prompt: "Tap every independent personal pronoun, then check.",
    candidate: (words) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 12 && words.some((w) => w.x) && !words.some((w) => w.xh); },
    isTarget: (w) => !!w.x,
    trap: () => null,
    legend: "Green = correct, dotted green border = missed, red = not an independent personal pronoun.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Independent personal pronoun patterns with real word examples from Genesis."));
    body.appendChild(tableCard(el, "Independent personal pronouns", "PGN = person, gender and number (C = common).", ["PGN", "Singular", "Plural"], data.table.map((r) => [r.row, r.singular.join("  /  "), r.plural.join("  /  ")]), [1, 2]));
    const ex = el("div", "bible-guide-card");
    ex.appendChild(el("h3", "", "Examples"));
    ex.appendChild(exampleRow(el, data, () => true, range, showAccents, 6));
    body.appendChild(ex);
  },
});

// ---------------------------------------------------------------- Demonstratives
const DEMO_TYPE = [{ id: "pronoun", label: "Pronoun" }, { id: "adjective", label: "Adjective" }];
const demoPage = createPractice({
  dataset: "bible-demo",
  historyMode: "bible-demo",
  title: "Demonstratives",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "demonstrative",
  promptText: "What type of demonstrative is this, what are its gender and number, and is it near or far?",
  answerParts: () => [
    { title: "Type", choices: DEMO_TYPE, answerOf: (ex) => ex.type },
    { title: "Gender and number", choices: choicesOf(["MS", "FS", "MP", "FP"]), answerOf: (ex) => ex.gn },
    { title: "Distance", choices: [{ id: "near", label: "Near" }, { id: "far", label: "Far" }], answerOf: (ex) => ex.distance },
  ],
  markWord: () => ({ markLetter: [0, 999] }),
  steps: stepsOf((x) => ({ type: x[1], gn: x[2], distance: x[3] })),
  describe: (w, ex) => hebrewHtml(`This is a ${ex.distance} demonstrative ${ex.type}, ${ex.gn}.`),
  findTab: {
    label: "Find the demonstrative",
    level: "word",
    types: [{ id: "pronoun", label: "Demonstrative Pronoun" }, { id: "adjective", label: "Demonstrative Adjective" }],
    prompt: (t) => `Tap every ${t.toLowerCase()}, then check.`,
    candidate: (words, type) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 14 && words.some((w) => w.x && w.x[1] === type) && !words.some((w) => w.xh); },
    isTarget: (w, type) => !!(w.x && w.x[1] === type),
    trap: (w, type) => (w.x ? `That is a demonstrative ${w.x[1]}, not a demonstrative ${type}.` : null),
    legend: "Green = correct, dotted green border = missed, red = not that type of demonstrative.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Demonstrative patterns with real word examples from Genesis."));
    const pron = el("div", "bible-guide-card");
    pron.appendChild(el("h3", "", "Demonstrative pronouns"));
    pron.appendChild(el("p", "", "A demonstrative pronoun stands on its own and points to something near or far."));
    pron.appendChild(el("p", "bible-rule", "• Agreement: the pronoun must match the grammatical gender and number of the noun it replaces or points to."));
    pron.appendChild(el("p", "bible-rule", "• Plural: the plural near pronoun אֵלֶּה serves both masculine and feminine nouns."));
    pron.appendChild(el("p", "bible-rule", "• Far pronouns are identical to the third-person independent personal pronouns (הוּא, הִיא, הֵם, הֵן)."));
    pron.appendChild(el("p", "bible-rule", "• A pronoun does not need to agree in definiteness."));
    pron.appendChild(el("p", "bible-rule", "• As with predicate adjectives, an implied “to be” is added (for example “this is good”)."));
    pron.appendChild(exampleRow(el, data, (e) => e.type === "pronoun", range, showAccents, 4));
    body.appendChild(pron);
    const adj = el("div", "bible-guide-card");
    adj.appendChild(el("h3", "", "Demonstrative adjectives"));
    adj.appendChild(el("p", "", "Demonstrative adjectives use exactly the same base words as demonstrative pronouns, but they follow the noun they modify and match its definiteness by taking the definite article (הַ)."));
    adj.appendChild(el("p", "bible-rule", "• Like attributive adjectives, they directly modify the noun they agree with (for example “this good [one]”)."));
    adj.appendChild(el("p", "bible-rule", "• They agree with the noun in gender, number and definiteness."));
    adj.appendChild(exampleRow(el, data, (e) => e.type === "adjective", range, showAccents, 4));
    body.appendChild(adj);
    const rows = ["MS", "FS", "MP", "FP"].map((gn) => [gn, data.table.pronoun.near[gn], data.table.pronoun.far[gn], data.table.adjective.near[gn], data.table.adjective.far[gn]]);
    body.appendChild(tableCard(el, "The forms", "GN = gender and number.", ["GN", "Pronoun: near", "Pronoun: far", "Adjective: near", "Adjective: far"], rows, [1, 2, 3, 4]));
  },
});

// ---------------------------------------------------------------- Adjectives
const adjPage = createPractice({
  dataset: "bible-adj",
  historyMode: "bible-adj",
  title: "Adjectives",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "adjective",
  promptText: "What type of adjective is this, and what are its gender and number?",
  answerParts: (data) => [
    { title: "Adjective type", choices: data.groups.map((g) => ({ id: g.id, label: g.label })), answerOf: (ex) => ex.pattern },
    { title: "Gender and number", choices: choicesOf(data.gn), answerOf: (ex) => ex.gn },
  ],
  markWord: range,
  steps: stepsOf((x) => ({ gn: x[1], from: x[2], to: x[3] })),
  describe: (w, ex) => hebrewHtml(`This is a ${ex.pattern} adjective, ${ex.gn}.`),
  findTab: {
    label: "Find the adjective",
    level: "word",
    types: [{ id: "attributive", label: "Attributive" }, { id: "predicate", label: "Predicate" }, { id: "substantive", label: "Substantive" }],
    prompt: (t) => `Tap every ${t.toLowerCase()} adjective, then check.`,
    candidate: (words, type) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 14 && words.some((w) => typeHit(w, type)) && !words.some((w) => w.xh); },
    isTarget: (w, type) => typeHit(w, type),
    trap: (w, type) => (w.x ? `That adjective is ${w.x[0]}, not ${type}.` : null),
    legend: "Green = correct, dotted green border = missed, red = not that type of adjective.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Adjective patterns with real word examples from Genesis."));
    body.appendChild(tableCard(el, "Adjective endings", "", ["", "Masculine", "Feminine"], [["Singular", "—", CIRCLE + "ָה"], ["Plural", CIRCLE + "ִים", CIRCLE + "וֹת"]], [1, 2]));
    const TEXT = {
      attributive: ["It directly describes a noun (“the old man”).", "It usually stands after the noun it describes.", "It must agree with the noun in gender, number and definiteness."],
      predicate: ["It does not directly modify the noun. It makes a statement about the noun, with an implied “to be” (“the man is old”). The noun is the subject and the adjective is the predicate.", "It usually comes before the noun, but it can come after it.", "It must agree with the noun in gender and number, not in definiteness. If the noun and the adjective are both indefinite, it may be either attributive or predicate, and the context decides."],
      substantive: ["It functions as a noun (“the old one”).", "It does not modify a noun, so it stands on its own.", "It can be definite or indefinite."],
    };
    for (const id of ["attributive", "predicate", "substantive"]) {
      const card = el("div", "bible-guide-card");
      card.appendChild(el("h3", "", cap(id)));
      [["Function", 0], ["Position", 1], ["Agreement", 2]].forEach(([label, i]) => card.appendChild(el("p", "bible-rule", `• ${label}: ${TEXT[id][i]}`)));
      card.appendChild(exampleRow(el, data, (e) => e.pattern === id, range, showAccents, 3));
      body.appendChild(card);
    }
  },
});

// ---------------------------------------------------------------- Interrogative ה
const interrogPage = createPractice({
  dataset: "bible-interrog",
  historyMode: "bible-interrog",
  title: "Interrogative ה",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "interrogative",
  promptText: "Why does the interrogative ה take this form?",
  markWord: () => ({ markLetter: 0 }),
  steps: stepsOf(() => ({ from: 0, to: 0 })),
  describe: (w) => hebrewHtml(`This is the interrogative ה in the word ${w.t.split("/").join("")}.`),
  findTab: {
    label: "Find the interrogative",
    level: "word",
    prompt: "Tap every word that begins with the interrogative ה, then check. (Some words begin with the definite article, which can look the same.)",
    candidate: (words) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 14 && words.some((w) => w.x); },
    isTarget: (w) => !!w.x,
    trap: () => "A ה at the start of a word can also be the definite article, which can look just like the interrogative ה. Check the meaning.",
    legend: "Green = correct, dotted green border = missed, red = not the interrogative ה.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Interrogative ה patterns with real word examples from Genesis."));
    body.appendChild(tableCard(el, "The interrogative ה", "", ["Form", "Rule"], data.table.map((r) => [r.form, r.rule]), [0]));
    const side = tableCard(el, "Compared with the definite article", "The interrogative ה and the definite article can look very similar, and sometimes identical, but they look that way for different reasons.", ["Interrogative", "Definite article", "Why they can look alike"], data.table.map((r) => [r.form + " — " + r.rule, r.article, r.note]));
    side.classList.add("bible-watch");
    body.appendChild(side);
    const ex = el("div", "bible-guide-card");
    ex.appendChild(el("h3", "", "Examples"));
    ex.appendChild(exampleRow(el, data, () => true, () => ({ markLetter: 0 }), showAccents, 6));
    body.appendChild(ex);
  },
});

// ---------------------------------------------------------------- Prefixed vav
const vavPage = createPractice({
  dataset: "bible-vav",
  historyMode: "bible-vav",
  title: "Prefixed Vav",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "vav",
  promptText: "Why does the vav take this form?",
  markWord: () => ({ markLetter: 0 }),
  steps: stepsOf((x) => ({ identity: x[1], from: 0, to: 0 })),
  describe: (w) => hebrewHtml(`This is the vav in the word ${w.t.split("/").join("")}.`),
  findTab: {
    label: "Find the prefixed vav",
    level: "word",
    types: [{ id: "conj", label: "Vav Conjunction" }, { id: "consec", label: "Vav Consecutive" }],
    prompt: (t) => `Tap every word with a ${t.toLowerCase()}, then check.`,
    candidate: (words, type) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 10 && words.some((w) => w.x && w.x[1] === type) && !words.some((w) => w.xh); },
    isTarget: (w, type) => !!(w.x && w.x[1] === type),
    trap: (w, type) => (w.x ? `That vav is a ${w.x[1] === "conj" ? "vav conjunction" : "vav consecutive"}, not a ${type === "conj" ? "vav conjunction" : "vav consecutive"}. On a perfect verb the two are identical in form, so the verb’s use decides.` : null),
    legend: "Green = correct, dotted green border = missed, red = not that kind of vav.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Prefixed vav patterns with real word examples from Genesis."));
    body.appendChild(tableCard(el, "Forms of the vav", "", ["Form", "Rule"], data.table.map((r) => [r.forms.join("  "), r.rule]), [0]));
    const note = el("div", "bible-guide-card bible-watch");
    note.appendChild(el("h3", "", "Vav conjunction and vav consecutive"));
    note.appendChild(el("p", "bible-rule", "• A vav consecutive occurs only on perfect or imperfect verb forms."));
    note.appendChild(el("p", "bible-rule", "• When a vav consecutive is on a perfect verb, it is identical to a vav conjunction."));
    note.appendChild(el("p", "bible-rule", "• On an imperfect verb, the vav consecutive is וַ with a dagesh forte in the first letter of the verb (or the pataḥ lengthens or the dagesh is lost, following the same rules as the definite article)."));
    body.appendChild(note);
    const ex = el("div", "bible-guide-card");
    ex.appendChild(el("h3", "", "Examples"));
    ex.appendChild(exampleRow(el, data, () => true, () => ({ markLetter: 0 }), showAccents, 8));
    body.appendChild(ex);
  },
});

// ---------------------------------------------------------------- Prefixed מִן
const minPage = createPractice({
  dataset: "bible-min",
  historyMode: "bible-min",
  title: "Prefixed מִן",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "preposition",
  promptText: "Why does the preposition מִן take this form?",
  markWord: (w, ex) => ({ markLetter: [ex.from, ex.to] }),
  steps: stepsOf((x) => ({ from: x[1], to: x[2] })),
  describe: (w, ex) => hebrewHtml(`This is the preposition מִן in the word ${w.t.split("/").join("")}.`),
  findTab: {
    label: "Find the prefixed מִן",
    level: "word",
    prompt: "Tap every word that has the preposition מִן, then check.",
    candidate: (words) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 14 && words.some((w) => w.x) && !words.some((w) => w.xh); },
    isTarget: (w) => !!w.x,
    trap: () => null,
    legend: "Green = correct, dotted green border = missed, red = no preposition מִן in that word.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Prefixed מִן patterns with real word examples from Genesis."));
    body.appendChild(tableCard(el, "Forms of מִן", "", ["Form", "Rule"], data.table.map((r) => [r.forms.join("  "), r.rule]), [0]));
    const ex = el("div", "bible-guide-card");
    ex.appendChild(el("h3", "", "Examples"));
    ex.appendChild(exampleRow(el, data, () => true, (e) => ({ markLetter: [e.from, e.to] }), showAccents, 8));
    body.appendChild(ex);
  },
});

// ---------------------------------------------------------------- Verbs
const prefixLabel = (data, id) => data.prefixKinds.find((k) => k.id === id).label;
const verbPage = createPractice({
  dataset: "bible-verb",
  historyMode: "bible-verb",
  title: "Verbs",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "verb",
  promptText: "Parse the highlighted verb.",
  answerParts: (data) => [
    { title: "Binyan", choices: data.binyanim.map((b) => ({ id: b.id, label: b.label })), answerOf: (ex) => ex.pattern },
    { title: "Mode", choices: choicesOf(data.modes), answerOf: (ex) => ex.mode },
    { title: "PGN", choices: choicesOf(data.pgn), answerOf: (ex) => ex.pgn },
    { title: "Prefix", choices: data.prefixKinds, answerOf: (ex) => ex.prefix },
    { title: "Pronominal suffix", choices: choicesOf(data.suffixChoices), answerOf: (ex) => ex.suffix },
  ],
  markWord: (w, ex) => ({ markLetter: [ex.from, ex.to] }),
  steps: stepsOf((x) => ({ mode: x[1], pgn: x[2], prefix: x[3], suffix: x[4], types: x[5], from: x[6], to: x[7], root: x[8] })),
  // Before the parsing boxes, the learner types the root (three consonants; two when a weak letter drops out).
  rootStep: (ex) => (ex.root ? { root: ex.root, weak: ex.types.length > 0 } : null),
  describe: (w, ex) => hebrewHtml(`This is a ${ex.pattern} ${ex.mode.toLowerCase()}${ex.pgn === "None" ? "" : ", " + ex.pgn}${ex.prefix === "none" ? "" : ", with a " + ex.prefix + " prefix"}${ex.suffix === "None" ? "" : ", with a " + ex.suffix + " pronominal suffix"}.`),
  findTab: {
    label: "Find the verb",
    level: "word",
    types: [
      { id: "strong", label: "Strong Verb" }, { id: "i_guttural", label: "I-Guttural" }, { id: "i_aleph", label: "I-Aleph" }, { id: "i_nun", label: "I-Nun" },
      { id: "i_vav_yod", label: "I-Vav / I-Yod" }, { id: "ii_guttural", label: "II-Guttural" }, { id: "ii_vav_yod", label: "II-Vav / II-Yod" },
      { id: "ii_geminate", label: "II-Geminate" }, { id: "iii_guttural", label: "III-Guttural" }, { id: "iii_aleph", label: "III-Aleph" }, { id: "iii_he", label: "III-He" },
    ],
    prompt: (t) => `Tap every verb of this type: ${t}. Then check.`,
    candidate: (words, type) => { const real = words.filter((w) => !w.m && !w.s); return real.length >= 4 && real.length <= 9 && words.some((w) => verbHit(w, type)) && !words.some((w) => w.xh); },
    isTarget: (w, type) => verbHit(w, type),
    trap: (w, type) => (w.x ? `That verb is ${w.x[5].length ? w.x[5].join(" and ").replace(/_/g, "-") : "a strong verb"}, not ${type}.` : null),
    legend: "Green = correct, dotted green border = missed, red = not that kind of verb.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Verb parsing and verb types, with real word examples from Genesis."));
    const parse = el("div", "bible-guide-card");
    parse.appendChild(el("h3", "", "Parsing a verb"));
    parse.appendChild(el("p", "bible-rule", `• Binyan: ${data.binyanim.map((b) => b.label).join(", ")}.`));
    parse.appendChild(el("p", "bible-rule", `• Mode: ${data.modes.join(", ")}.`));
    parse.appendChild(el("p", "bible-rule", "• PGN: person, gender and number (for example 3MS). Participles have only gender and number (MS, FS, MP, FP); infinitives have none."));
    parse.appendChild(el("p", "bible-rule", "• Prefix: a vav conjunction, a vav consecutive, the interrogative ה, the definite article, or a preposition."));
    parse.appendChild(el("p", "bible-rule", "• Pronominal suffix: a suffix on the verb that gives the object (for example 3MS “him”), parsed by its own person, gender and number."));
    body.appendChild(parse);
    for (const b of data.binyanim) {
      const card = el("div", "bible-guide-card");
      card.appendChild(el("h3", "", b.label));
      card.appendChild(el("p", "", b.explain));
      card.appendChild(exampleRow(el, data, (e) => e.pattern === b.id, (e) => ({ markLetter: [e.from, e.to] }), showAccents, 3));
      body.appendChild(card);
    }
    const weak = el("div", "bible-guide-card bible-watch");
    weak.appendChild(el("h3", "", "The strong verb and the ten weak verb types"));
    for (const t of data.types) {
      weak.appendChild(el("p", "bible-rule", `• ${t.label}: ${t.explain}`));
      weak.appendChild(exampleRow(el, data, (e) => (t.id === "strong" ? e.types.length === 0 : e.types.includes(t.id)), (e) => ({ markLetter: [e.from, e.to] }), showAccents, 3));
    }
    body.appendChild(weak);
  },
});
function verbHit(w, type) {
  if (!w.x) return false;
  const types = w.x[5];
  return type === "strong" ? types.length === 0 : types.includes(type);
}

export { nounPage, pronounPage, demoPage, adjPage, interrogPage, vavPage, minPage, verbPage };
