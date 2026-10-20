// Syllables & Stress (Genesis). Same format as the other Bible pages, with two differences the owner asked for:
//  * every question about a syllable has THREE answer boxes (open or closed; where it is in relation to the tone
//    syllable; short, long or vocal sheva), and
//  * the third tab is an interactive: the learner adds dividing lines to a word to separate its syllables.
// The shared engine is ../bible-practice.js; the syllable analysis is scripts/lib/syllables.mjs.

import { createPractice } from "../bible-practice.js";
import { hebrewHtml, wordHtml, prettyRef, syllablesHtml, buildVerse, stripAccents } from "../bible-text.js";

const TONE_LABELS = { tonic: "Tonic", pretonic: "Pretonic", propretonic: "Propretonic", posttonic: "Post-tonic", proposttonic: "Propost-tonic" };
const TONE_PHRASE = { tonic: "the tonic (accented) syllable", pretonic: "the pretonic syllable", propretonic: "the propretonic syllable", posttonic: "a post-tonic syllable", proposttonic: "a propost-tonic syllable" };
const VOWEL_LABELS = { short: "Short", long: "Long", sheva: "Vocal sheva" };

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.innerHTML = hebrewHtml(text);
  return e;
};

const page = createPractice({
  dataset: "bible-syllable",
  historyMode: "bible-syllable",
  title: "Syllables & Stress",
  intro: "Real examples from the Hebrew text of Genesis.",
  noun: "syllable",
  promptText: "Describe the highlighted syllable.",
  answerParts: () => [
    { title: "Open or closed", choices: [{ id: "open", label: "Open" }, { id: "closed", label: "Closed" }], answerOf: (ex) => (ex.closed ? "closed" : "open") },
    { title: "Position", choices: Object.entries(TONE_LABELS).map(([id, label]) => ({ id, label })), answerOf: (ex) => ex.tone },
    { title: "Vowel", choices: Object.entries(VOWEL_LABELS).map(([id, label]) => ({ id, label })), answerOf: (ex) => ex.vowel },
  ],
  markWord: () => ({ markLetter: [0, 999] }), // the whole word is highlighted in the verse; the syllable is highlighted in the question
  questionDisplay: ({ ex, target, showAccents }) => {
    const box = el("div", "bible-verse bible-one-word");
    box.setAttribute("lang", "he");
    box.setAttribute("dir", "rtl");
    box.innerHTML = `<span class="bible-word">${syllablesHtml(target.y[0], target.y[1], { markSyllable: ex.k, showAccents })}</span>`;
    return box;
  },
  steps: (data, passage) => {
    const steps = [];
    for (const ref of passage.verses) {
      (data.verses[ref] || []).forEach((w, wi) => {
        if (!w.y) return;
        w.y[1].forEach((s, k) => {
          if (s[3] !== "other") steps.push({ ref, wi, k, pattern: s[5], closed: s[2], tone: s[3], vowel: s[4] });
        });
      });
    }
    return steps;
  },
  describe: (w, ex) => {
    const sy = w.y[1][ex.k];
    const text = w.t.split("/").join("");
    return hebrewHtml(`This is syllable ${ex.k + 1} of ${w.y[1].length} in the word ${text}: ${sy[2] ? "closed" : "open"}, ${TONE_PHRASE[sy[3]]}, with ${sy[4] === "sheva" ? "a vocal sheva" : "a " + sy[4] + " vowel"}.`);
  },
  thirdTab: {
    label: "Divide the word",
    render: (body, api) => renderDivide(body, api),
  },
  renderGuide: (body, { data, el: mk, showAccents }) => {
    body.appendChild(mk("p", "", "Syllable patterns with real word examples from Genesis."));
    const defs = mk("div", "bible-guide-card");
    defs.appendChild(mk("h3", "", "Open and closed syllables"));
    defs.appendChild(mk("p", "", "Syllables are either open or closed. An open syllable, Cv (consonant + vowel), ends with a vowel or a quiescent consonant (a mater lectionis). A closed syllable, CvC (consonant + vowel + consonant), ends with a consonant. A silent sheva may close a syllable."));
    body.appendChild(defs);
    const tone = mk("div", "bible-guide-card");
    tone.appendChild(mk("h3", "", "The tone syllable"));
    tone.appendChild(mk("p", "", "If the word is unmarked, the final syllable is the tonic syllable, which receives the stress (the tone, or primary accent). The tone syllable can be a different syllable if it is marked by a strong accent mark."));
    tone.appendChild(mk("p", "", "The syllable before the tonic is the pretonic syllable, and the one before that is the propretonic syllable. In the same way, the syllables after the tonic are the post-tonic and the propost-tonic."));
    tone.appendChild(mk("p", "", "A vocal sheva and a compound sheva (ḥāṭef) each count as a syllable of their own."));
    body.appendChild(tone);

    const rules = mk("div", "bible-guide-card");
    rules.appendChild(mk("h3", "", "Patterns for syllables and vowel length"));
    const NOTES = {
      CAPL: "CAPL: a closed accented syllable prefers a long vowel.",
      OPRL: "OPRL: an open pretonic syllable requires a long vowel.",
      CURS: "CURS: a closed unaccented syllable requires a short vowel.",
      OAPS: "OAPS: an open accented syllable prefers a short vowel.",
      OOPPS: "OOPPS: an originally open propretonic syllable gets a sheva.",
    };
    for (const id of ["CAPL", "OPRL", "CURS", "OAPS", "OOPPS"]) {
      rules.appendChild(mk("p", "bible-rule", `• ${NOTES[id]}`));
      const ex = data.examples.filter((e) => e.pattern === id);
      const picks = [];
      const step = Math.max(1, Math.floor(ex.length / 4));
      for (let i = 0; i < ex.length && picks.length < 4; i += step) picks.push(ex[i]);
      const list = mk("div", "bible-guide-examples");
      for (const e of picks) {
        const w = data.verses[e.ref][e.wi];
        const item = mk("span", "bible-guide-example");
        item.innerHTML = `<span lang="he" dir="rtl" class="bible-word">${syllablesHtml(w.y[0], w.y[1], { markSyllable: e.k, showAccents })}</span> <span class="caption">${prettyRef(e.ref)}</span>`;
        list.appendChild(item);
      }
      rules.appendChild(list);
    }
    body.appendChild(rules);

    const meteg = mk("div", "bible-guide-card bible-watch");
    meteg.appendChild(mk("h3", "", "Meteg and silluq"));
    meteg.appendChild(mk("p", "", "A meteg is a secondary accent marker, so it does not mark the primary accent. It looks identical to the silluq, which does mark the primary accent, but a silluq is always paired with a sof pasuq (the mark at the end of a verse)."));
    body.appendChild(meteg);
  },
});

// ---------------------------------------------------------------- the interactive

function renderDivide(body, api) {
  const { data, state, rerender, showAccents } = api;
  if (!state.divide) state.divide = { pick: null, cuts: new Set(), checked: false, seen: 0 };
  const d = state.divide;
  if (!d.pick) {
    const pool = [];
    for (const [ref, words] of Object.entries(data.verses)) {
      words.forEach((w, wi) => {
        if (w.y && w.y[1].length >= 2 && w.y[1].length <= 5 && w.y[0].length <= 14 && w.y[1].every((s) => s[3] !== "other")) pool.push({ ref, wi });
      });
    }
    d.pick = pool[Math.floor(Math.random() * pool.length)];
    d.cuts = new Set();
    d.checked = false;
  }
  const w = data.verses[d.pick.ref][d.pick.wi];
  const slots = w.y[0];
  const sylls = w.y[1];
  const expected = new Set(sylls.slice(1).map((s) => s[0] - 1)); // a cut after slot i separates it from slot i+1

  body.appendChild(el("p", "", "Add dividing lines to separate the word into its syllables: click between two letters to add or remove a line, then check. A vocal sheva or compound sheva is its own syllable. A letter with a dagesh forte is shown twice: the first copy closes one syllable and the second starts the next, so the line can go between the two copies."));
  body.appendChild(el("div", "caption", prettyRef(d.pick.ref)));

  const word = el("div", "bible-divide");
  word.setAttribute("lang", "he");
  word.setAttribute("dir", "rtl");
  slots.forEach((text, i) => {
    const slot = el("span", "bible-slot");
    slot.textContent = showAccents ? text : stripAccents(text);
    word.appendChild(slot);
    if (i < slots.length - 1) {
      const gap = el("button", "bible-gap");
      gap.type = "button";
      gap.setAttribute("aria-label", "Divide here");
      if (d.cuts.has(i)) gap.classList.add("is-cut");
      if (d.checked) {
        const cut = d.cuts.has(i);
        const should = expected.has(i);
        if (cut && should) gap.classList.add("is-correct");
        else if (cut && !should) gap.classList.add("is-wrong");
        else if (!cut && should) gap.classList.add("is-missed");
      }
      gap.addEventListener("click", () => {
        if (d.checked) return;
        if (d.cuts.has(i)) d.cuts.delete(i);
        else d.cuts.add(i);
        gap.classList.toggle("is-cut", d.cuts.has(i));
      });
      word.appendChild(gap);
    }
  });
  body.appendChild(word);

  const row = el("div", "button-row");
  if (!d.checked) {
    const check = el("button", "btn", "Check");
    check.type = "button";
    check.addEventListener("click", () => {
      d.checked = true;
      api.recordStreakActivity();
      rerender();
    });
    row.appendChild(check);
  } else {
    const right = [...expected].filter((i) => d.cuts.has(i)).length;
    const extra = [...d.cuts].filter((i) => !expected.has(i)).length;
    const ok = right === expected.size && !extra;
    const msg = el("div", "bible-feedback " + (ok ? "is-correct" : "is-wrong"));
    msg.textContent = `${ok ? "Correct. " : ""}You placed ${right} of ${expected.size} lines${extra ? `, and ${extra} line${extra > 1 ? "s" : ""} that ${extra > 1 ? "do" : "does"} not belong` : ""}. Green = correct, dotted green = missed, red = a line that does not belong.`;
    body.appendChild(msg);
    const answer = el("div", "bible-feedback");
    answer.innerHTML = `<strong>The syllables:</strong> <span lang="he" dir="rtl" class="bible-inline">${syllablesHtml(slots, sylls, { showAccents })}</span><br>${sylls
      .map((s, k) => `${k + 1}. ${s[2] ? "closed" : "open"}, ${TONE_LABELS[s[3]] ? TONE_LABELS[s[3]].toLowerCase() : s[3]}, ${s[4] === "sheva" ? "vocal sheva" : s[4] + " vowel"}`)
      .join("<br>")}`;
    body.appendChild(answer);
    const next = el("button", "btn", "Next word");
    next.type = "button";
    next.addEventListener("click", () => {
      d.pick = null;
      rerender();
    });
    row.appendChild(next);
  }
  body.appendChild(row);
}

export const mount = page.mount;
export const unmount = page.unmount;
