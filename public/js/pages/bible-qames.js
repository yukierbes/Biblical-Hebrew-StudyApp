// Qameṣ vs Qameṣ-ḥaṭuf (Genesis). Same format as the other Bible pages; the shared engine is ../bible-practice.js and
// the rules are in scripts/lib/hebrew-word.mjs and qames-rules.mjs (from the owner's "Qameṣ vs Qameṣ-ḥaṭuf" sheet).
//
// A qameṣ and a qameṣ-ḥaṭuf are written with the same mark, so the answer depends on the syllable: open or closed,
// accented or not, and what follows. Cases the spelling cannot settle are held back and never shown as examples.

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef, letterWithMarks } from "../bible-text.js";

const HATUF = new Set(["hatuf_closed", "hatuf_hataf", "hatuf_before_hatuf"]);
const typeOf = (pattern) => (HATUF.has(pattern) ? "hatuf" : "qames");

const page = createPractice({
  dataset: "bible-qames",
  historyMode: "bible-qames",
  title: "Qameṣ vs Qameṣ-ḥaṭuf",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "qameṣ",
  promptText: "Is the highlighted vowel a qameṣ or a qameṣ-ḥaṭuf?",
  markWord: (w, ex) => ({ markLetter: ex.li }),
  steps: (data, passage) => {
    const steps = [];
    for (const ref of passage.verses) {
      (data.verses[ref] || []).forEach((w, wi) => {
        for (const [li, pattern] of w.q || []) steps.push({ ref, wi, li, pattern });
      });
    }
    return steps;
  },
  describe: (w, ex) => hebrewHtml(`This is the vowel under ${letterWithMarks(w.t.split("/").join(""), ex.li)} in the word ${w.t.split("/").join("")}.`),
  findTab: {
    label: "Find the qameṣ",
    level: "letter",
    types: [
      { id: "qames", label: "Qameṣ" },
      { id: "hatuf", label: "Qameṣ-ḥaṭuf" },
    ],
    prompt: (type) => `Tap every consonant that has a ${type}, then check.`,
    candidate: (words, type) => {
      const real = words.filter((w) => !w.m && !w.s);
      const hits = words.reduce((n, w) => n + (w.q ? w.q.filter((x) => typeOf(x[1]) === type).length : 0), 0);
      return real.length >= 3 && real.length <= 9 && hits >= 1 && hits <= 5 && !words.some((w) => w.qh && w.qh.length);
    },
    isTarget: (w, type, li) => !!(w.q && w.q.some((x) => x[0] === li && typeOf(x[1]) === type)),
    trap: (w, type, li) => {
      const other = w.q && w.q.find((x) => x[0] === li);
      return other ? `That vowel is a ${typeOf(other[1]) === "hatuf" ? "qameṣ-ḥaṭuf" : "qameṣ"}, not a ${type === "hatuf" ? "qameṣ-ḥaṭuf" : "qameṣ"}.` : null;
    },
    legend: "Green = correct, dotted green border = missed, red = not that vowel.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Qameṣ and qameṣ-ḥaṭuf patterns with real word examples from Genesis."));
    for (const g of data.groups) {
      const card = el("div", "bible-guide-card");
      const total = g.patterns.reduce((n, id) => n + ((data.totals && data.totals[id]) || 0), 0);
      const h = el("h3", "", g.label);
      h.insertAdjacentHTML("beforeend", ` <span class="caption">(${total} in ${data.source.book})</span>`);
      card.appendChild(h);
      card.appendChild(el("p", "", g.intro));
      for (const id of g.patterns) {
        const p = data.patterns.find((x) => x.id === id);
        card.appendChild(el("p", "bible-rule", `• ${p.reason}`));
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
        card.appendChild(list);
      }
      body.appendChild(card);
    }
  },
});

export const mount = page.mount;
export const unmount = page.unmount;
