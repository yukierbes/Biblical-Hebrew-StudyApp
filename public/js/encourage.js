// Encouragement: short messages that match how the student is actually doing.
//
// Pure functions with no imports, so every page can use them and each rule can be tested
// on its own. Wording rules: warm, specific, never scolding; a struggling student hears
// that mistakes are part of how memory forms and gets a concrete next step; a strong one
// hears what is working. Where several lines fit, one is picked by `seed` (the Home page
// passes the date so the message is steady all day and fresh tomorrow).

function pick(options, seed = 0) {
  const n = Math.abs(Math.floor(Number(seed) || 0));
  return options[n % options.length];
}

/** A small number from a YYYY-MM-DD string, so a message stays the same all day. */
export function seedFromDate(dateStr) {
  let h = 0;
  for (const ch of String(dateStr || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * The line shown under the greeting on Home.
 *   facts: {
 *     isNew,            // nothing practised yet, ever
 *     streak,           // current streak in days (0 if broken)
 *     practisedToday,
 *     atRisk,           // streak alive but nothing done yet today
 *     count, goal,      // today's practice answers vs. the daily goal
 *     due,              // items due for review right now
 *     daysAway,         // whole days since the last practice (null if never)
 *     recentAvg,        // average of the latest quiz scores in percent (null if no quizzes)
 *     trend,            // "up" | "down" | "flat" | null — from the quiz history
 *   }
 * Returns { tone: "welcome" | "cheer" | "gentle" | "steady", text }.
 */
export function homeMessage(facts, seed = 0) {
  const f = { streak: 0, count: 0, goal: 1, due: 0, daysAway: null, recentAvg: null, trend: null, ...facts };
  const remaining = Math.max(0, f.goal - f.count);

  if (f.isNew) {
    return {
      tone: "welcome",
      text: pick(
        [
          "Welcome! A good first step: open Consonants and try a few flashcards.",
          "Welcome! Start small. Ten flashcards today is a real beginning.",
        ],
        seed
      ),
    };
  }

  if (f.daysAway !== null && f.daysAway >= 3) {
    return {
      tone: "gentle",
      text: pick(
        [
          `Welcome back! Five minutes today will bring a lot of it back.`,
          `Good to see you again. Start with whatever is due and let it come back.`,
        ],
        seed
      ),
    };
  }

  if (f.practisedToday && remaining === 0) {
    const streakLine = f.streak >= 2 ? ` That makes ${f.streak} days in a row.` : "";
    return {
      tone: "cheer",
      text: pick(
        [
          `Daily goal reached. Well done!${streakLine}`,
          `You hit today's goal. Anything more is a bonus.${streakLine}`,
        ],
        seed
      ),
    };
  }

  if (f.recentAvg !== null && f.recentAvg < 60) {
    return {
      tone: "gentle",
      text: pick(
        [
          "Some of this is hard, and that is normal. Mistakes are part of how memory forms. Try a short Weak spots drill.",
          "Recent quizzes have been tough. Slow down and use the flashcards, then try again; it does get easier.",
        ],
        seed
      ),
    };
  }

  if (f.atRisk && f.streak >= 3) {
    return {
      tone: "steady",
      text: `Your ${f.streak}-day streak is waiting for you. A few minutes today keeps it going.`,
    };
  }

  if (f.practisedToday && remaining > 0) {
    return {
      tone: "steady",
      text: `Good start. ${remaining} more ${remaining === 1 ? "answer" : "answers"} reaches today's goal.`,
    };
  }

  if (f.recentAvg !== null && f.recentAvg >= 85) {
    return {
      tone: "cheer",
      text: f.trend === "up"
        ? `Your quiz scores are climbing (around ${Math.round(f.recentAvg)}% lately). That is what steady practice looks like.`
        : `Your recent quizzes are strong (around ${Math.round(f.recentAvg)}%). Ready for something a little harder?`,
    };
  }

  if (f.due > 0) {
    return {
      tone: "steady",
      text: `${f.due} ${f.due === 1 ? "item is" : "items are"} ready for review. A short session keeps them fresh.`,
    };
  }

  return {
    tone: "steady",
    text: pick(["Ready when you are.", "A little each day adds up. Pick up where you left off."], seed),
  };
}

/**
 * The line shown on a results screen.
 *   percent: 0–100.  Returns { tone, text }.
 */
export function resultMessage(percent, seed = 0) {
  const p = Number.isFinite(percent) ? percent : 0;
  if (p >= 100) {
    return { tone: "cheer", text: pick(["Perfect! יִישַׁר כֹּחַ!", "Flawless. Yasher koach!"], seed) };
  }
  if (p >= 90) return { tone: "cheer", text: pick(["Excellent work!", "Very strong. Nearly perfect."], seed) };
  if (p >= 75) return { tone: "cheer", text: pick(["Nice work! You clearly know this.", "Solid. A little more and it is locked in."], seed) };
  if (p >= 50) {
    return {
      tone: "steady",
      text: pick(["Good effort. Review the ones you missed and try again.", "You are getting there. The misses show what to look at next."], seed),
    };
  }
  return {
    tone: "gentle",
    text: pick(
      [
        "Hard round, and that is okay. Every miss is how you learn. Try the flashcards, then come back.",
        "Don't be discouraged. Mistakes build memory. A short review first will help.",
      ],
      seed
    ),
  };
}

/** True when a result is worth a celebration (and which kind). */
export function celebrationForPercent(percent) {
  if (!Number.isFinite(percent)) return null;
  if (percent >= 100) return "perfect";
  if (percent >= 80) return "quiz";
  return null;
}

/** Streak lengths that get a celebration and a message of their own. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export function streakMilestoneMessage(days) {
  if (days >= 365) return `${days} days in a row. A full year of Hebrew. Incredible.`;
  if (days >= 100) return `${days} days in a row. That is real dedication.`;
  if (days >= 30) return `${days} days in a row. A whole month of showing up.`;
  if (days >= 7) return `${days} days in a row. A full week and more.`;
  return `${days} days in a row. A habit is forming.`;
}
