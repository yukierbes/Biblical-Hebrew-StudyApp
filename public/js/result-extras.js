// Small shared pieces for results screens: the encouraging line, and a celebration that
// fires once per finished round (results screens redraw often, e.g. when a sidebar filter
// is clicked, so each helper remembers what it has already celebrated).

import { resultMessage, celebrationForPercent } from "./encourage.js";
import { celebrate } from "./celebrate.js";

/** A line of encouragement matched to `percent` (0-100). */
export function encouragementEl(percent) {
  const msg = resultMessage(percent, Math.round(percent));
  const el = document.createElement("p");
  el.className = `encourage-line encourage-${msg.tone}`;
  el.textContent = msg.text;
  return el;
}

const celebratedDecks = new WeakSet();

/**
 * Flashcard summary: adds the encouraging line to `container` and, the first time this
 * round's summary is drawn, celebrates a strong result. `deckRef` is the round's deck array
 * (a new array each round, so a restarted round celebrates again).
 */
export function appendRoundResult(container, deckRef, percent) {
  container.appendChild(encouragementEl(percent));
  if (deckRef && typeof deckRef === "object" && !celebratedDecks.has(deckRef)) {
    celebratedDecks.add(deckRef);
    const kind = celebrationForPercent(percent);
    if (kind) celebrate(kind);
  }
}

let lastRunSignature = "";
let lastRunAt = 0;

/** Games: celebrate a new high score once, however many times the summary is redrawn. */
export function celebrateRun(signature, isNewHigh) {
  if (!isNewHigh) return;
  const now = Date.now();
  if (signature === lastRunSignature && now - lastRunAt < 60000) return;
  lastRunSignature = signature;
  lastRunAt = now;
  celebrate("round");
}
