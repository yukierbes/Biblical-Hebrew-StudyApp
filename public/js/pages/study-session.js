// Study Session: one long, interleaved round (10, 15 or 20 minutes) of vocabulary, verb forms and Bible in
// Context questions, chosen by what is due for review and what is weak. It runs on the Daily Challenge's own
// page code (same questions, same feedback), in "study" mode: it does not count as the day's challenge.

import * as daily from "./daily-challenge.js";

export function mount(ctx) {
  return daily.mount(ctx, { study: true });
}

export function unmount() {
  return daily.unmount();
}
