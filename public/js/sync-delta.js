// The rules for change-only syncing, kept apart from the browser code in cloud-sync.js so they can be tested.
//
// Each device keeps three things (all in browser storage):
//   the saved items themselves          (every key that starts with "hebrewVerbApp:")
//   meta   - when each item last changed on any device (a time, per item; a deleted item keeps its time)
//   shadow - a copy of what the server last agreed to hold
// Comparing the items with the shadow shows what changed since the last successful sync. Only those items
// are sent. The server answers with only the items this device is missing or has older.

/** How long to wait, and how often to look. */
export const TIMING = {
  CHECK_MS: 5000, // how often the app looks for changes on this device (nothing is sent by looking)
  QUIET_MS: 20000, // send once nothing has changed for this long...
  MAX_WAIT_MS: 90000, // ...or after this long of constant changes
  PULL_MS: 5 * 60 * 1000, // while the tab is open and nothing changed here, check for changes from other devices this often
  RETURN_MS: 60 * 1000, // coming back to the tab refreshes if the last contact was longer ago than this
  BACKOFF_START_MS: 15000,
  BACKOFF_MAX_MS: 5 * 60 * 1000,
};

/** Items whose text differs from the shadow: { changed: [keys], removed: [keys] }. */
export function findChanges(shadow, current) {
  const changed = [];
  const removed = [];
  for (const k of Object.keys(current)) if (shadow[k] !== current[k]) changed.push(k);
  for (const k of Object.keys(shadow)) if (!(k in current)) removed.push(k);
  return { changed, removed };
}

export function hasChanges(shadow, current) {
  const { changed, removed } = findChanges(shadow, current);
  return changed.length + removed.length > 0;
}

/** True when two whole snapshots hold the same text for the same keys. */
export function sameSnapshot(a, b) {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Builds what to send. Items that changed get a new time (always later than their old one). `extraKeys` are
 * items the server asked for (it lacked them or had them older): they are sent with the time they already have.
 *
 * Returns { request, meta, sent }:
 *   request - the body to POST
 *   meta    - the times, updated (save these)
 *   sent    - { key: text, or null for a deleted item } for everything in this request
 */
export function buildRequest({ shadow, current, meta, now, extraKeys = [] }) {
  const newMeta = { ...meta };
  const snapshot = {};
  const changeMeta = {};
  const sent = {};
  const { changed, removed } = findChanges(shadow, current);

  for (const k of changed) {
    newMeta[k] = Math.max(now, (newMeta[k] || 0) + 1);
    snapshot[k] = current[k];
    changeMeta[k] = newMeta[k];
    sent[k] = current[k];
  }
  for (const k of removed) {
    newMeta[k] = Math.max(now, (newMeta[k] || 0) + 1);
    changeMeta[k] = newMeta[k];
    sent[k] = null;
  }
  for (const k of extraKeys) {
    if (k in changeMeta) continue;
    if (!(k in newMeta)) newMeta[k] = now;
    changeMeta[k] = newMeta[k];
    if (k in current) {
      snapshot[k] = current[k];
      sent[k] = current[k];
    } else {
      sent[k] = null;
    }
  }

  return { request: { v: 2, snapshot, meta: changeMeta, known: { ...newMeta } }, meta: newMeta, sent };
}

/**
 * Applies the server's answer. `io` is { get(key), set(key, text), remove(key) } for the device's storage.
 * `atSend` is what the device held when the request went out: an item the person changed since then is left
 * alone (the newer local change will be sent next time and win).
 *
 * Returns { shadow, meta, applied, need }.
 */
export function applyDeltaResponse(resp, { shadow, meta, sent, atSend }, io, now = Date.now()) {
  const newShadow = { ...shadow };
  const newMeta = { ...meta };
  let applied = 0;

  // What was sent is now what the server holds.
  for (const k of Object.keys(sent)) {
    if (sent[k] === null) delete newShadow[k];
    else newShadow[k] = sent[k];
  }

  const changedSinceSend = (k) => {
    const before = k in atSend ? atSend[k] : null;
    const nowText = io.get(k);
    return (nowText === undefined ? null : nowText) !== before;
  };

  const respSnap = resp.snapshot || {};
  const respMeta = resp.meta || {};
  for (const k of Object.keys(respSnap)) {
    if (typeof respSnap[k] !== "string" || changedSinceSend(k)) continue;
    io.set(k, respSnap[k]);
    newShadow[k] = respSnap[k];
    newMeta[k] = Number(respMeta[k]) || now;
    applied++;
  }
  for (const k of resp.deleted || []) {
    if (changedSinceSend(k)) continue;
    if (io.get(k) !== null && io.get(k) !== undefined) {
      io.remove(k);
      applied++;
    }
    delete newShadow[k];
    newMeta[k] = Number(respMeta[k]) || now;
  }

  return { shadow: newShadow, meta: newMeta, applied, need: Array.isArray(resp.need) ? resp.need : [] };
}

/**
 * One sync: send what changed, apply the answer, and if the server says it is missing items this device has,
 * send those too (at most one extra round). This is the loop the app runs; cloud-sync.js supplies the browser
 * pieces and the tests supply pretend ones.
 *
 *   storage - { readSnapshot(), getJSON(key, fallback), setJSON(key, value), io: { get, set, remove } }
 *   post    - async (request) => the server's answer (throws on a failure)
 *   keys    - { shadow, meta }: the names the bookkeeping is stored under
 *
 * Returns { legacy, applied }. `legacy` is set only when the server answered with a whole notebook (an older
 * server); the caller then applies it the old way.
 */
export async function runSyncRounds({ storage, post, keys, now = Date.now }) {
  let extraKeys = [];
  let applied = 0;
  for (let round = 0; round < 2; round++) {
    const shadow = storage.getJSON(keys.shadow, {});
    const current = storage.readSnapshot();
    const built = buildRequest({ shadow, current, meta: storage.getJSON(keys.meta, {}), now: now(), extraKeys });
    // The new times are kept even if this send fails; the shadow only advances once the server has answered.
    storage.setJSON(keys.meta, built.meta);

    const data = await post(built.request);
    if (!data.delta) return { legacy: data, applied };

    const result = applyDeltaResponse(data, { shadow, meta: built.meta, sent: built.sent, atSend: current }, storage.io, now());
    storage.setJSON(keys.shadow, result.shadow);
    storage.setJSON(keys.meta, result.meta);
    applied += result.applied;
    if (!result.need.length) return { legacy: null, applied };
    extraKeys = result.need; // the server lacks some items this device has: send them now
  }
  return { legacy: null, applied };
}

/**
 * When to contact the server. Returns "sync" or "wait".
 *   pending       - this device has changes the server has not seen
 *   firstChangeAt - when the current run of changes began (0 if none)
 *   lastChangeAt  - when something last changed here
 *   lastContactAt - when the server was last reached successfully
 */
export function decideSync({ pending, firstChangeAt, lastChangeAt, lastContactAt, now }) {
  if (pending) {
    if (now - lastChangeAt >= TIMING.QUIET_MS) return "sync";
    if (firstChangeAt && now - firstChangeAt >= TIMING.MAX_WAIT_MS) return "sync";
    return "wait";
  }
  return now - lastContactAt >= TIMING.PULL_MS ? "sync" : "wait";
}

/** How long to hold off after a failed attempt (doubles each time, up to a cap). */
export function backoffDelay(failures) {
  if (failures <= 0) return 0;
  return Math.min(TIMING.BACKOFF_MAX_MS, TIMING.BACKOFF_START_MS * 2 ** (failures - 1));
}

/** How much space the saved items take: { bytes, count, largest: [{ key, bytes }] } (largest first, at most `top`). */
export function storageUsage(snapshot, top = 3) {
  const size = (text) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text).length : text.length);
  const rows = Object.keys(snapshot).map((key) => ({ key, bytes: size(key) + size(snapshot[key]) }));
  rows.sort((a, b) => b.bytes - a.bytes);
  return { bytes: rows.reduce((n, r) => n + r.bytes, 0), count: rows.length, largest: rows.slice(0, top) };
}

/** "312 KB", "1.4 MB" */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Browsers hold about 5 MB per site. Warn well before that. */
export const STORAGE_WARN_BYTES = 3 * 1024 * 1024;
