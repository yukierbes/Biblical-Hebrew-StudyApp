import { createGamesPage } from "./letter-games.js";

// Consonants Games — logic lives in letter-games.js. getAllHighScores is
// exported too, because the Achievements page reads the high scores.
export const { mount, unmount, getAllHighScores } = createGamesPage("consonants");
