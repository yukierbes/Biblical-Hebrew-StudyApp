// Prefixed Prepositions (Genesis): ל, בּ and כּ. Same format as the other Bible pages; the shared engine is
// ../bible-practice.js and the rules are in scripts/lib/prefix-rules.mjs (from the owner's "Prefixed Prepositions" table).
//
// The answer boxes use the owner's inputs: Lexical Form, Simple Sheva, Compound Sheva, יְ, Tone Syllable, Definite Article,
// יהוה, אֱ. The pattern guide shows the table of forms and rules WITHOUT the answer-input column.

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef } from "../bible-text.js";

const NAMES = { ל: "lamed", ב: "bet", כ: "kaf" };

const page = createPractice({
  dataset: "bible-prefix",
  historyMode: "bible-prefix",
  title: "Prefixed Prepositions",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "preposition",
  promptText: "Why does the preposition take this form?",
  markWord: (w, ex) => ({ markLetter: ex.li }),
  steps: (data, passage) => {
    const steps = [];
    for (const ref of passage.verses) {
      (data.verses[ref] || []).forEach((w, wi) => {
        if (w.p) steps.push({ ref, wi, li: 0, pattern: w.p[0], letter: w.p[1] });
      });
    }
    return steps;
  },
  describe: (w) => hebrewHtml(`This is a prefixed ${w.p[1]} (${NAMES[w.p[1]]}) in the word ${w.t.split("/").join("")}.`),
  findTab: {
    label: "Find the prefixed preposition",
    level: "word",
    types: [
      { id: "ל", label: "ל (lamed)" },
      { id: "ב", label: "בּ (bet)" },
      { id: "כ", label: "כּ (kaf)" },
    ],
    prompt: (type) => `Tap every word with a prefixed ${type}, then check.`,
    candidate: (words, type) => {
      const real = words.filter((w) => !w.m && !w.s);
      return real.length >= 4 && real.length <= 12 && words.some((w) => w.p && w.p[1] === type) && !words.some((w) => w.ph);
    },
    isTarget: (w, type) => !!(w.p && w.p[1] === type),
    trap: (w, type) => (w.p ? `That word has a prefixed ${w.p[1]} (${NAMES[w.p[1]]}), not a prefixed ${type}.` : null),
    legend: "Green = correct, dotted green border = missed, red = no prefixed preposition of that kind.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Prefixed preposition patterns with real word examples from Genesis."));
    const card = el("div", "bible-guide-card");
    card.appendChild(el("h3", "", "ל, בּ and כּ"));
    card.appendChild(el("p", "", "These rules apply to all three prepositions. In ב and כ the dagesh lene is shown."));
    const wrap = el("div", "bible-table-scroll");
    const table = el("table", "bible-suffix-table");
    const head = el("tr");
    for (const h of ["ל", "ב", "כ", "Rule"]) head.appendChild(el("th", "", h));
    table.appendChild(head);
    for (const row of data.table) {
      const tr = el("tr");
      for (const letter of ["ל", "ב", "כ"]) {
        const td = el("td", "he-cell");
        td.setAttribute("lang", "he");
        td.textContent = row.forms[letter].join("  ");
        tr.appendChild(td);
      }
      tr.appendChild(el("td", "", row.rule));
      table.appendChild(tr);
    }
    wrap.appendChild(table);
    card.appendChild(wrap);
    body.appendChild(card);

    const art = el("div", "bible-guide-card bible-watch");
    art.appendChild(el("h3", "", "With the definite article"));
    art.appendChild(el("p", "", "When a prefixed preposition and the definite article occur together, the preposition replaces the article’s ה, but the vowels follow the pattern of the definite article:"));
    for (const [id, text] of [
      ["article_lexical", "Lexical form: pataḥ on the preposition and a dagesh forte in the noun’s first letter."],
      ["article_compensatory", "Compensatory lengthening before א, ר or ע: qameṣ on the preposition."],
      ["article_implicit", "Implicit doubling before ה, ח or ע: pataḥ on the preposition, with no dagesh written."],
      ["article_exceptional", "Exceptional form before an unaccented ה or ע with qameṣ: segol on the preposition."],
    ]) {
      art.appendChild(el("p", "bible-rule", `• ${text}`));
      const ex = data.examples.filter((e) => e.pattern === id);
      if (!ex.length) continue;
      const picks = [];
      const step = Math.max(1, Math.floor(ex.length / 3));
      for (let i = 0; i < ex.length && picks.length < 3; i += step) picks.push(ex[i]);
      const list = el("div", "bible-guide-examples");
      for (const e of picks) {
        const w = data.verses[e.ref][e.wi];
        const item = el("span", "bible-guide-example");
        item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${wordHtml(w, { markLetter: e.li, showAccents })}</span> <span class="caption">${prettyRef(e.ref)}</span>`;
        list.appendChild(item);
      }
      art.appendChild(list);
    }
    body.appendChild(art);
  },
});

export const mount = page.mount;
export const unmount = page.unmount;
