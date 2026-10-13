import { createReviewPage } from "./letter-review.js";

// Vowels Review — all the logic lives in letter-review.js; this file just
// says which study set it is for.
export const { mount, unmount } = createReviewPage("vowels");
