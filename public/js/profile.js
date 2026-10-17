// Profile: the student's display name and chosen celebration style.
//
// Stored under one "hebrewVerbApp:" key, so cloud-sync.js carries it to every device the
// student signs in on (like the rest of their progress). Nothing here is required: with no
// name the Home page simply says "Shalom." and with no choice the celebration style is
// "sparkle", the gentlest one.

const PROFILE_KEY = "hebrewVerbApp:profile";

export const CELEBRATION_STYLES = [
  { id: "sparkle", label: "Soft sparkle", desc: "A gentle glow with a few twinkling stars." },
  { id: "confetti", label: "Confetti", desc: "A quick burst of colored confetti." },
  { id: "chime", label: "Sound chime", desc: "A short rising chime (no animation)." },
  { id: "off", label: "Quiet", desc: "No celebrations; encouraging words only." },
];

export const DEFAULT_CELEBRATION = "sparkle";
export const MAX_NAME_LENGTH = 30;

function load() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function save(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    /* storage unavailable — the choice lasts until the page is closed */
  }
}

/** Trims, collapses spaces, and caps the length. Returns "" for anything unusable. */
export function cleanName(name) {
  return String(name ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export function getDisplayName() {
  return cleanName(load().name);
}

export function setDisplayName(name) {
  const profile = load();
  const cleaned = cleanName(name);
  if (cleaned) profile.name = cleaned;
  else delete profile.name;
  save(profile);
  return cleaned;
}

/** True once the student has dismissed the "What should we call you?" prompt on Home. */
export function isNamePromptDismissed() {
  return !!load().namePromptDismissed;
}

export function dismissNamePrompt() {
  const profile = load();
  profile.namePromptDismissed = true;
  save(profile);
}

export function getCelebrationStyle() {
  const id = load().celebration;
  return CELEBRATION_STYLES.some((s) => s.id === id) ? id : DEFAULT_CELEBRATION;
}

export function setCelebrationStyle(id) {
  const profile = load();
  profile.celebration = CELEBRATION_STYLES.some((s) => s.id === id) ? id : DEFAULT_CELEBRATION;
  save(profile);
  return profile.celebration;
}
