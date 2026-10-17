// Celebrations: a short, optional flourish when the student reaches something worth
// marking. The student picks one style (Settings card on My Progress):
//
//   sparkle  — a soft glow around the screen edge and a few twinkling stars (default)
//   confetti — a quick burst of colored confetti
//   chime    — a short rising chime, no animation
//   off      — nothing (the encouraging words still appear)
//
// celebrate(kind) is called from the places that matter: reaching the daily goal, a streak
// milestone, an unlocked achievement, a good quiz or Daily Challenge result, and finishing
// a flashcard deck. "big" kinds get the full flourish, "small" kinds a lighter one. It never
// interrupts: the layer ignores clicks, vanishes by itself, and a second celebration within
// a few seconds is skipped so back-to-back results don't pile up.
//
// If the device asks for reduced motion, sparkle and confetti become a brief, still glow.

import { getCelebrationStyle } from "./profile.js";
import { playFinish, playCorrect } from "./daily-sound.js";

export const CELEBRATION_KINDS = {
  goal: { size: "big" },
  streak: { size: "big" },
  achievement: { size: "big" },
  perfect: { size: "big" },
  quiz: { size: "small" },
  daily: { size: "small" },
  round: { size: "small" },
};

const COOLDOWN_MS = 4000;
const CONFETTI_COLORS = ["#f4b942", "#4aa3df", "#e5604d", "#6bbf59", "#a77bd9", "#f08cb0"];
let lastAt = 0;

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return false;
  }
}

function layer() {
  let el = document.getElementById("celebrate-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "celebrate-layer";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
}

function clearLater(el, ms) {
  setTimeout(() => el.remove(), ms);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function glow(calm) {
  const el = document.createElement("div");
  el.className = "celebrate-glow" + (calm ? " celebrate-calm" : "");
  layer().appendChild(el);
  clearLater(el, 2400);
}

function sparkle(size, calm) {
  glow(calm);
  if (calm) return;
  const count = size === "big" ? 14 : 7;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "celebrate-star";
    s.textContent = "✦";
    s.style.left = rand(15, 85) + "%";
    s.style.top = rand(12, 55) + "%";
    s.style.fontSize = rand(14, size === "big" ? 34 : 24) + "px";
    s.style.animationDelay = rand(0, 0.9) + "s";
    layer().appendChild(s);
    clearLater(s, 2600);
  }
}

function confetti(size, calm) {
  if (calm) return glow(true);
  const count = size === "big" ? 70 : 32;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "celebrate-confetti";
    p.style.left = rand(2, 98) + "%";
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.setProperty("--drift", rand(-90, 90) + "px");
    p.style.setProperty("--spin", rand(-540, 540) + "deg");
    p.style.animationDuration = rand(1.6, 2.8) + "s";
    p.style.animationDelay = rand(0, 0.5) + "s";
    layer().appendChild(p);
    clearLater(p, 3600);
  }
}

/**
 * Celebrates `kind` (see CELEBRATION_KINDS) in the student's chosen style.
 * Returns the style that ran, or null when nothing was shown (Quiet, too soon after the
 * last one, or no page to draw on). `opts.force` skips the cooldown (used by Preview);
 * `opts.style` overrides the saved style (also Preview); `opts.size` overrides the size.
 */
export function celebrate(kind, opts = {}) {
  if (typeof document === "undefined" || !document.body) return null;
  const style = opts.style || getCelebrationStyle();
  if (style === "off") return null;

  const now = Date.now();
  if (!opts.force && now - lastAt < COOLDOWN_MS) return null;
  lastAt = now;

  const size = opts.size || (CELEBRATION_KINDS[kind] || CELEBRATION_KINDS.round).size;
  const calm = prefersReducedMotion();

  if (style === "confetti") confetti(size, calm);
  else if (style === "chime") (size === "big" ? playFinish : playCorrect)();
  else sparkle(size, calm);
  return style;
}

/** For tests: forget the last celebration so the next one is not skipped. */
export function resetCelebrationCooldown() {
  lastAt = 0;
}
