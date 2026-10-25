// "How sure were you?" — an optional rating after a right answer.
//
// A right answer the learner was unsure about is worth less than a confident one: it is not promoted as far
// (see markItemUnsure in srs.js), so it comes back sooner. The question only appears after a CORRECT answer
// (a wrong answer already comes back soon), and ignoring it counts as "sure". It can be turned off in
// My Progress → Backup & settings.

import { markItemUnsure } from "./srs.js";

const KEY = "hebrewVerbApp:confidencePrompt";

/** Whether the "sure / unsure" question is shown. On unless the person turned it off. */
export function isConfidencePromptOn() {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch (e) {
    return true;
  }
}

export function setConfidencePromptOn(on) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch (e) {
    /* not critical */
  }
}

/**
 * The small "How sure were you?" row to put under a right answer's feedback, or null when the question is
 * switched off. `mode` and `key` say which spaced-repetition item it is; `onRated(unsure)` is called after a tap.
 */
export function createConfidenceAsk(mode, key, onRated) {
  if (!isConfidencePromptOn() || !mode || key === undefined || key === null) return null;
  const wrap = document.createElement("div");
  wrap.className = "confidence-ask";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "How sure were you of that answer?");
  const label = document.createElement("span");
  label.className = "caption confidence-label";
  label.textContent = "How sure were you?";
  wrap.appendChild(label);
  const mk = (text, unsure) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm btn-outline confidence-btn";
    b.dataset.confidence = unsure ? "unsure" : "sure";
    b.textContent = text;
    b.addEventListener("click", () => {
      if (unsure) markItemUnsure(mode, key);
      wrap.innerHTML = "";
      const thanks = document.createElement("span");
      thanks.className = "caption confidence-thanks";
      thanks.setAttribute("role", "status");
      thanks.textContent = unsure ? "Noted — this one will come back sooner." : "Noted.";
      wrap.appendChild(thanks);
      if (onRated) onRated(unsure);
    });
    return b;
  };
  wrap.appendChild(mk("Sure", false));
  wrap.appendChild(mk("Unsure", true));
  return wrap;
}
