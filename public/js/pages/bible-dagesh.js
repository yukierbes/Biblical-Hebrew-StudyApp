// Dagesh in Context (Genesis): dagesh lene, dagesh forte and mappiq. Same format as the
// Definite Article page; the shared engine is ../bible-practice.js and the rules are in
// scripts/lib/dagesh-rules.mjs (from the owner's "Hebrew Dagesh" and "Gutturals Reject Dagesh" sheets).

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef, shureqIndex, letterMarkedHtml } from "../bible-text.js";

const isTarget = (w) => !!(w.d && w.d.some((x) => x[1] !== "held"));

/** The letter at position `li` of a word, with the marks written on it. */
function letterWithMarks(text, li) {
  let n = -1;
  let out = "";
  for (const ch of text) {
    if (ch >= "\u05d0" && ch <= "\u05ea") {
      n += 1;
      if (n > li) break;
    }
    if (n === li) out += ch;
  }
  return out;
}

const page = createPractice({
  dataset: "bible-dagesh",
  historyMode: "bible-dagesh",
  title: "Dagesh",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "dagesh",
  promptText: "What is the dot in the highlighted letter?",
  markWord: (w, ex) => ({ markLetter: ex.li }),
  steps: (data, passage) => {
    const steps = [];
    for (const ref of passage.verses) {
      (data.verses[ref] || []).forEach((w, wi) => {
        for (const [li, pattern] of w.d || []) if (pattern !== "held") steps.push({ ref, wi, li, pattern });
      });
    }
    return steps;
  },
  describe: (w, ex) => hebrewHtml(`This is the dot in ${letterWithMarks(w.t.split("/").join(""), ex.li)} in the word ${w.t.split("/").join("")}.`),
  findTab: {
    label: "Find the dagesh",
    level: "letter",
    types: [
      { id: "lene", label: "Dagesh Lene" },
      { id: "forte", label: "Dagesh Forte" },
      { id: "mappiq", label: "Mappiq" },
    ],
    prompt: (type) => `Tap every consonant that has a ${type}, then check.`,
    candidate: (words, type) => {
      const real = words.filter((w) => !w.m && !w.s);
      const hits = words.reduce((n, w) => n + (w.d ? w.d.filter((x) => x[1] === type).length : 0), 0);
      return real.length >= 3 && real.length <= 9 && hits >= 1 && hits <= 6 && !words.some((w) => w.d && w.d.some((x) => x[1] === "held"));
    },
    isTarget: (w, type, li) => !!(w.d && w.d.some((x) => x[0] === li && x[1] === type)),
    trap: (w, type, li) => {
      if (w.u && w.u.includes(li)) return "The dot in a vav with no vowel of its own is a šureq vowel, not a dagesh.";
      const other = w.d && w.d.find((x) => x[0] === li && x[1] !== "held");
      if (other) return `That consonant has a ${other[1] === "mappiq" ? "mappiq" : "dagesh " + other[1]}, not a ${type === "mappiq" ? "mappiq" : "dagesh " + type}.`;
      return null;
    },
    legend: "Green = correct, dotted green border = missed, red = not that kind of dot.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Dagesh and mappiq patterns with real word examples from Genesis."));
    for (const p of data.patterns) {
      const card = el("div", "bible-guide-card");
      const h = el("h3", "", p.label);
      h.insertAdjacentHTML("beforeend", ` <span class="caption">(${(data.totals && data.totals[p.id]) || data.counts[p.id] || 0} in ${data.source.book})</span>`);
      card.appendChild(h);
      card.appendChild(el("p", "", p.explain));
      const ex = data.examples.filter((e) => e.pattern === p.id);
      const picks = [];
      const step = Math.max(1, Math.floor(ex.length / 4));
      for (let i = 0; i < ex.length && picks.length < 4; i += step) picks.push(ex[i]);
      const list = el("div", "bible-guide-examples");
      for (const e of picks) {
        const w = data.verses[e.ref][e.wi];
        const item = el("span", "bible-guide-example");
        item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${wordHtml(w, { markLetter: e.li, showAccents })}</span> <span class="caption">${prettyRef(e.ref)}</span>`;
        list.appendChild(item);
      }
      card.appendChild(list);
      body.appendChild(card);
    }

    const how = el("div", "bible-guide-card");
    how.appendChild(el("h3", "", "Lene or forte? Ask in this order"));
    const ol = el("ol");
    ol.appendChild(el("li", "", "Is the consonant a BeGaD KeFaT consonant (ב ג ד כ פ ת)?"));
    ol.appendChild(el("li", "", "Is the consonant preceded by silence?"));
    how.appendChild(ol);
    how.appendChild(el("p", "", "If both answers are yes, it is a dagesh lene. If either answer is no, it is a dagesh forte. The five gutturals (א ה ח ע ר) reject a dagesh forte."));
    body.appendChild(how);

    const shureq = el("div", "bible-guide-card bible-watch");
    shureq.appendChild(el("h3", "", "A dot in a vav is not always a dagesh"));
    shureq.appendChild(el("p", "", "A vav with a dot and no vowel of its own (וּ) is the šureq vowel, not a dagesh. A vav with a dot and a vowel of its own is a dagesh forte, and doubles the vav."));
    const exampleRow = (title, items) => {
      shureq.appendChild(el("p", "caption", title));
      const list = el("div", "bible-guide-examples");
      for (const { text, mark, ref } of items) {
        const item = el("span", "bible-guide-example");
        item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${letterMarkedHtml(text, mark, showAccents)}</span> <span class="caption">${prettyRef(ref)}</span>`;
        list.appendChild(item);
      }
      shureq.appendChild(list);
    };
    // vav with a dagesh forte (the vav has its own vowel)
    const forteVav = [];
    const seenF = new Set();
    for (const e of data.examples) {
      if (forteVav.length >= 4) break;
      if (e.pattern !== "forte") continue;
      const text = data.verses[e.ref][e.wi].t.split("/").join("");
      const letter = [...text].filter((c) => c >= "\u05d0" && c <= "\u05ea")[e.li];
      if (letter !== "ו" || seenF.has(text)) continue;
      seenF.add(text);
      forteVav.push({ text, mark: e.li, ref: e.ref });
    }
    exampleRow("Dagesh forte in a vav (the vav has a vowel of its own):", forteVav);
    const sureqVav = [];
    const seenS = new Set();
    for (const [ref, words] of Object.entries(data.verses)) {
      if (sureqVav.length >= 4) break;
      for (const w of words) {
        if (sureqVav.length >= 4 || !w.u || w.d) continue;
        const text = w.t.split("/").join("");
        if (seenS.has(text) || text.length > 8) continue;
        seenS.add(text);
        sureqVav.push({ text, mark: w.u[0], ref });
      }
    }
    exampleRow("Šureq (a vav with a dot and no vowel of its own):", sureqVav);
    body.appendChild(shureq);
  },
});

export const mount = page.mount;
export const unmount = page.unmount;
