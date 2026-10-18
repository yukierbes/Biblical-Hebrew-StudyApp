// Definite Article in Context (Genesis). The page itself is the shared engine in
// ../bible-practice.js; this file says what is specific to the article:
// what to highlight, how to describe it, what "Find the article" asks for, and the guide.
//
// The Hebrew text and its tagging come from the Open Scriptures Hebrew Bible (see Sources &
// Credits). The patterns follow the owner's own rule sheets (scripts/lib/article-rules.mjs).
// Examples that do not match those rules are never shown.

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef } from "../bible-text.js";

const isArticle = (w) => w.a !== undefined && w.p !== "held";

const page = createPractice({
  dataset: "bible-article",
  historyMode: "bible-article",
  title: "Definite Article in Context",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "article",
  promptText: "What is happening at the article in the highlighted word?",
  markWord: (w) => ({ markPiece: w.a }),
  steps: (data, passage) => {
    const steps = [];
    for (const ref of passage.verses) {
      (data.verses[ref] || []).forEach((w, wi) => {
        if (isArticle(w)) steps.push({ ref, wi, pattern: w.p });
      });
    }
    return steps;
  },
  describe: (w) => {
    const pieces = w.t.split("/");
    return hebrewHtml(`This word is ${pieces[w.a]} + ${pieces.slice(w.a + 1).join("")}.`);
  },
  findTab: {
    label: "Find the article",
    prompt: "Tap every word that has the definite article, then check.",
    candidate: (words) => {
      const real = words.filter((w) => !w.m && !w.s);
      return real.length >= 5 && real.length <= 14 && !words.some((w) => w.p === "held") && words.some((w) => w.a !== undefined);
    },
    isTarget: (w) => w.a !== undefined,
    trap: (w) => (w.i ? "One of the words you tapped begins with the interrogative particle, which looks like the article but is a different word." : null),
    legend: "Green = correct, dotted green border = missed, red = not an article.",
  },
  renderGuide: (body, { data, el, showAccents }) => {
    body.appendChild(el("p", "", "Definite article patterns with real word examples from Genesis."));
    for (const g of data.groups) {
      const card = el("div", "bible-guide-card");
      const count = g.patterns.reduce((n, id) => n + (data.counts[id] || 0), 0);
      const h = el("h3", "", g.label);
      h.insertAdjacentHTML("beforeend", ` <span class="caption">(${count} in ${data.source.book})</span>`);
      card.appendChild(h);
      for (const id of g.patterns) {
        const p = data.patterns.find((x) => x.id === id);
        card.appendChild(el("p", "", p.explain));
        const ex = data.examples.filter((e) => e.pattern === id);
        const picks = [];
        const step = Math.max(1, Math.floor(ex.length / 4));
        for (let i = 0; i < ex.length && picks.length < 4; i += step) picks.push(ex[i]);
        const list = el("div", "bible-guide-examples");
        for (const e of picks) {
          const w = data.verses[e.ref][e.wi];
          const item = el("span", "bible-guide-example");
          item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${wordHtml(w, { markPiece: w.a, showAccents })}</span> <span class="caption">${prettyRef(e.ref)}</span>`;
          list.appendChild(item);
        }
        card.appendChild(list);
      }
      body.appendChild(card);
    }
    const watch = el("div", "bible-guide-card bible-watch");
    watch.appendChild(el("h3", "", "Watch for the interrogative particle"));
    watch.appendChild(el("p", "", "The definite article and the interrogative particle can look very similar, and sometimes identical. Always check the context before deciding which one you are looking at."));
    body.appendChild(watch);
  },
});

export const mount = page.mount;
export const unmount = page.unmount;
