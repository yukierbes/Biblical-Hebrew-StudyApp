const SWIPE_THRESHOLD = 70; // px of horizontal drag before it counts as a swipe
const SWIPE_MAX_ROTATE = 12; // deg, at full-width drag

/**
 * Attaches touch-swipe handling to a flashcard button: drag right to
 * mark "I Know It", drag left to mark "Review Later", with the card
 * following the finger and flying off-screen on release past the
 * threshold. Only active once `isEnabled()` returns true (typically:
 * only once the card is flipped and showing the answer — swiping the
 * question side would be ambiguous, since tapping it just flips).
 *
 * Purely additive: doesn't touch the element's click handler, so tap-
 * to-flip keeps working exactly as before. Safe to call every render
 * (each call only affects the element instance passed in).
 */
export function attachSwipeToMark(cardEl, { isEnabled, onSwipeRight, onSwipeLeft }) {
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let horizontal = false;

  function reset() {
    cardEl.style.transition = "transform 0.2s ease, opacity 0.2s ease";
    cardEl.style.transform = "";
    cardEl.style.opacity = "";
    dragging = false;
    horizontal = false;
  }

  cardEl.addEventListener(
    "touchstart",
    (e) => {
      if (!isEnabled() || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = true;
      horizontal = false;
      cardEl.style.transition = "none";
    },
    { passive: true }
  );

  cardEl.addEventListener(
    "touchmove",
    (e) => {
      if (!dragging || !isEnabled()) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (!horizontal) {
        // Decide once, early, whether this gesture is a horizontal swipe
        // (ours to handle) or a vertical scroll (let the page handle it).
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        horizontal = Math.abs(dx) > Math.abs(dy);
        if (!horizontal) {
          dragging = false;
          return;
        }
      }

      e.preventDefault();
      const rotate = Math.max(-SWIPE_MAX_ROTATE, Math.min(SWIPE_MAX_ROTATE, dx / 12));
      cardEl.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
      cardEl.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 400));
    },
    { passive: false }
  );

  cardEl.addEventListener("touchend", (e) => {
    if (!dragging || !horizontal) {
      reset();
      return;
    }
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    dragging = false;
    horizontal = false;

    if (dx > SWIPE_THRESHOLD) {
      flyOff(cardEl, 1, onSwipeRight);
    } else if (dx < -SWIPE_THRESHOLD) {
      flyOff(cardEl, -1, onSwipeLeft);
    } else {
      reset();
    }
  });

  cardEl.addEventListener("touchcancel", reset);
}

function flyOff(cardEl, direction, callback) {
  cardEl.style.transition = "transform 0.25s ease, opacity 0.25s ease";
  cardEl.style.transform = `translateX(${direction * 500}px) rotate(${direction * SWIPE_MAX_ROTATE}deg)`;
  cardEl.style.opacity = "0";
  setTimeout(() => callback && callback(), 180);
}
