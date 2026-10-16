// Optional little sounds for the Daily Challenge (a soft tone for a right
// answer, a lower one for a miss, a rising chime at the end). Off unless the
// person turns Sound on; made with the browser's audio API, so no files.

let ctx = null;

function context() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

function tones(list) {
  const c = context();
  if (!c) return;
  try {
    if (c.state === "suspended") c.resume();
    let t = c.currentTime;
    for (const [freq, dur] of list) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * 0.8;
    }
  } catch (e) {
    /* sound is a nicety — never get in the way */
  }
}

export const playCorrect = () => tones([[660, 0.12], [880, 0.16]]);
export const playWrong = () => tones([[220, 0.22]]);
export const playFinish = () => tones([[523, 0.14], [659, 0.14], [784, 0.14], [1047, 0.3]]);
