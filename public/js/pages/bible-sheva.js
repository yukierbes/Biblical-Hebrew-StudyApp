// Shevas (Genesis): vocal or silent, and why. Same format as the other Bible pages; the shared engine is
// ../bible-practice.js and the rules are in scripts/lib/hebrew-word.mjs and sheva-rules.mjs (from the owner's "Shevas" sheet).

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef, letterWithMarks } from "../bible-text.js";

const typeOf = (pattern) => (pattern.startsWith("v_") ? "vocal" : "silent");

const page = createPractice({
  dataset: "bible-sheva",
  historyMode: "bible-sheva",
  title: "Shevas",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "sheva",
  promptText: "Is the sheva under the highlighted consonant vocal or silent?",
  markWord: (w, ex) => ({ markLetter: ex.li }),
  steps: (data, passage) => {
    const steps = [];
    for (const ref of passage.verses) {
      (data.verses[ref] || []).forEach((w, wi) => {
        for (const [li, pattern] of w.sh || []) steps.push({ ref, wi, li, pattern });
      });
    }
    return steps;
  },
  describe: (w, ex) => hebrewHtml(`This is the sheva under ${letterWithMarks(w.t.split("/").join(""), ex.li)} in the word ${w.t.split("/").join("")}.`),
  findTab: {
    label: "Find the sheva",
    level: "letter",
    types: [
      { id: "vocal", label: "Vocal Sheva" },
      { id: "silent", label: "Silent Sheva" },
    ],
    prompt: (type) => `Tap every consonant with a ${type}, then check.`,
    candidate: (words, type) => {
      const real = words.filter((w) => !w.m && !w.s);
      const hits = words.reduce((n, w) => n + (w.sh ? w.sh.filter((x) => typeOf(x[1]) === type).length : 0), 0);
      return real.length >= 3 && real.length <= 9 && hits >= 1 && hits <= 5 && !words.some((w) => w.shh && w.shh.length);
    },
    isTarget: (w, type, li) => !!(w.sh && w.sh.some((x) => x[0] === li && typeOf(x[1]) === type)),
    trap: (w, type, li) => {
      const other = w.sh && w.sh.find((x) => x[0] === li);
      return other ? `That sheva is ${typeOf(other[1])}, not ${type}.` : null;
    },
    legend: "Green = correct, dotted green border = missed, red = not that kind of sheva.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Vocal and silent sheva patterns with real word examples from Genesis."));
    for (const g of data.groups) {
      const card = el("div", "bible-guide-card");
      const total = g.patterns.reduce((n, id) => n + ((data.totals && data.totals[id]) || 0), 0);
      const h = el("h3", "", g.label);
      h.insertAdjacentHTML("beforeend", ` <span class="caption">(${total} in ${data.source.book})</span>`);
      card.appendChild(h);
      card.appendChild(el("p", "", g.id === "vocal" ? "A simple sheva is vocal if:" : "A simple sheva is silent if:"));
      for (const id of g.patterns) {
        const p = data.patterns.find((x) => x.id === id);
        card.appendChild(el("p", "bible-rule", p.explain.replace(/^It is (vocal|silent): /, "• ")));
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
