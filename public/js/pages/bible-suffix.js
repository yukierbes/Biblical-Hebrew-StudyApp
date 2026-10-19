// Pronominal Suffixes (Genesis): Type 1 and Type 2 suffixes. Same format as the Definite Article and
// Dagesh pages; the shared engine is ../bible-practice.js and the rules are in scripts/lib/suffix-rules.mjs
// (from the owner's Pronominal Suffixes table).

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef } from "../bible-text.js";

const TYPE_LABEL = { type1: "Type 1", type2: "Type 2" };
let tableForDescribe = null; // set when the data loads (the table gives the meaning of each person/gender/number)

const page = createPractice({
  dataset: "bible-suffix",
  historyMode: "bible-suffix",
  title: "Pronominal Suffixes",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "suffix",
  promptText: "Which type of suffix, and which person, gender and number, is on the highlighted word?",
  mainPartTitle: "Type",
  extraPart: (data) => ({ title: "PGN", choices: data.table.map((r) => ({ id: r.pgn, label: r.pgn })), answerOf: (ex) => ex.pgn }),
  markWord: (w, ex) => ({ markLetter: [ex.from, 999] }),
  steps: (data, passage) => {
    tableForDescribe = data.table;
    const steps = [];
    for (const ref of passage.verses) {
      (data.verses[ref] || []).forEach((w, wi) => {
        if (w.x) steps.push({ ref, wi, pattern: w.x[0], pgn: w.x[1], from: w.x[2] });
      });
    }
    return steps;
  },
  describe: (w) => {
    const [, pgn, , stem] = w.x;
    const row = (tableForDescribe || []).find((r) => r.pgn === pgn);
    return hebrewHtml(`This is a ${pgn} suffix${row ? ` (“${row.gloss}”)` : ""} on a ${stem}.`);
  },
  findTab: {
    label: "Find the pronominal suffix",
    level: "word",
    types: [
      { id: "type1", label: "Type 1" },
      { id: "type2", label: "Type 2" },
    ],
    prompt: (type) => `Tap every word that has a ${type} suffix, then check.`,
    candidate: (words, type) => {
      const real = words.filter((w) => !w.m && !w.s);
      return real.length >= 4 && real.length <= 12 && words.some((w) => w.x && w.x[0] === type) && !words.some((w) => w.xh);
    },
    isTarget: (w, type) => !!(w.x && w.x[0] === type),
    trap: (w, type) => (w.x ? `That word has a ${TYPE_LABEL[w.x[0]]} suffix, not a ${TYPE_LABEL[type]} suffix.` : null),
    legend: "Green = correct, dotted green border = missed, red = not that type of suffix.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    tableForDescribe = data.table;
    body.appendChild(el("p", "", "Pronominal suffix patterns with real word examples from Genesis."));

    const diff = el("div", "bible-guide-card");
    diff.appendChild(el("h3", "", "Type 1 and Type 2"));
    diff.appendChild(el("p", "", "Type 1 suffixes are added to singular nouns (סוּס “horse” → סוּסִי “my horse”)."));
    diff.appendChild(el("p", "", "Type 2 suffixes are added to plural nouns (סוּסִים “horses” → סוּסַי “my horses”). Most have a yod before the suffix."));
    diff.appendChild(el("p", "", "Some prepositions and particles also take suffixes. Each one takes Type 1 or Type 2 suffixes, so the type has to be learned with the word."));
    for (const [type, title] of [["type1", "Type 1 with a preposition:"], ["type2", "Type 2 with a preposition:"]]) {
      diff.appendChild(el("p", "caption", title));
      const list = el("div", "bible-guide-examples");
      const seen = new Set();
      for (const e of data.examples) {
        if (list.children.length >= 4) break;
        if (e.pattern !== type || e.stem !== "preposition") continue;
        const w = data.verses[e.ref][e.wi];
        const text = w.t.split("/").join("");
        if (seen.has(text)) continue;
        seen.add(text);
        const item = el("span", "bible-guide-example");
        item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${wordHtml(w, { markLetter: [e.from, 999], showAccents })}</span> <span class="caption">${prettyRef(e.ref)}</span>`;
        list.appendChild(item);
      }
      diff.appendChild(list);
    }
    body.appendChild(diff);

    const card = el("div", "bible-guide-card");
    card.appendChild(el("h3", "", "The suffixes (example: סוּס “horse”, סוּסִים “horses”)"));
    const wrap = el("div", "bible-table-scroll");
    const table = el("table", "bible-suffix-table");
    const head = el("tr");
    for (const h of ["PGN", "Type 1 suffix (singular nouns)", "Example (horse)", "Type 2 suffix (plural nouns)", "Example (horses)", "Translation"]) head.appendChild(el("th", "", h));
    table.appendChild(head);
    const circle = (s) => (s.charCodeAt(0) < 0x5d0 ? "\u25cc" + s : s);
    for (const r of data.table) {
      const tr = el("tr");
      tr.appendChild(el("td", "", r.pgn));
      for (const text of [r.type1.map(circle).join("  /  "), r.eg1, r.type2.map(circle).join("  /  "), r.eg2]) {
        const td = el("td", "he-cell");
        td.setAttribute("lang", "he");
        td.textContent = text;
        tr.appendChild(td);
      }
      tr.appendChild(el("td", "", `${r.gloss} horse / ${r.gloss} horses`));
      table.appendChild(tr);
    }
    wrap.appendChild(table);
    card.appendChild(wrap);
    card.appendChild(el("p", "caption", "PGN = person, gender and number (for example 3MS = third person, masculine, singular)."));
    body.appendChild(card);
  },
});

export const mount = page.mount;
export const unmount = page.unmount;
