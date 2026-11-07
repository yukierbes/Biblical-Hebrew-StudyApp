/** Merges two { snapshot, meta } bundles key-by-key: for each key present
 * in either side, whichever side has the newer `meta` timestamp for that
 * key wins. This lets two devices sync without one wholesale clobbering
 * the other's more recent changes to a different part of the data.
 *
 * This is the original "send everything" merge. It is still used for
 * older copies of the app that send a whole snapshot (see processSyncPost). */
export function mergeBundles(a, b) {
  const snapshot = {};
  const meta = {};
  const aSnap = a.snapshot || {};
  const bSnap = b.snapshot || {};
  const aMeta = a.meta || {};
  const bMeta = b.meta || {};
  const keys = new Set([...Object.keys(aSnap), ...Object.keys(bSnap)]);

  for (const key of keys) {
    const aTime = aMeta[key] || 0;
    const bTime = bMeta[key] || 0;
    if (aTime >= bTime) {
      if (key in aSnap) snapshot[key] = aSnap[key];
      meta[key] = aTime || bTime;
    } else {
      if (key in bSnap) snapshot[key] = bSnap[key];
      meta[key] = bTime;
    }
  }
  return { snapshot, meta };
}

// ---------------------------------------------------------------------------
// Change-only sync ("version 2")
//
// Instead of mailing the whole notebook every time, the app now sends only
//   snapshot - the saved items that changed since the last sync
//   meta     - when each of those items (and any deleted item) last changed
//   known    - the last-changed time of every item this device has ever seen
// and the server answers with only what this device is missing or has older.
// The per-item rule is the same as before: the newer change wins.
// ---------------------------------------------------------------------------

const PREFIX = "hebrewVerbApp:";
const BOOKKEEPING = new Set(["hebrewVerbApp:cloudSync:meta", "hebrewVerbApp:cloudSync:shadow"]);

const isPlainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Only the app's own saved items are ever accepted (never a stray key). */
export function isSyncKey(k) {
  return typeof k === "string" && k.startsWith(PREFIX) && !BOOKKEEPING.has(k);
}

/** True when two bundles hold exactly the same items and times. Lets the
 * server skip rewriting an unchanged copy. */
export function sameBundle(a, b) {
  const as = (a && a.snapshot) || {};
  const bs = (b && b.snapshot) || {};
  const am = (a && a.meta) || {};
  const bm = (b && b.meta) || {};
  const sk = Object.keys(as);
  if (sk.length !== Object.keys(bs).length) return false;
  for (const k of sk) if (!has(bs, k) || bs[k] !== as[k]) return false;
  const mk = Object.keys(am);
  if (mk.length !== Object.keys(bm).length) return false;
  for (const k of mk) if (!has(bm, k) || bm[k] !== am[k]) return false;
  return true;
}

/** Applies a device's changes to the stored copy, then works out what that
 * device still needs. Pure: touches nothing outside its arguments.
 *
 * Returns { snapshot, meta, changed, send, need }:
 *   snapshot, meta - the stored copy after the changes
 *   changed        - false when nothing differs (so nothing needs saving)
 *   send           - { snapshot, meta, deleted } the device should apply
 *   need           - items the device has that the server lacks or has older
 *                    (the device then sends them: this repairs a lost copy)
 */
export function applyDelta(stored, incoming) {
  const snapshot = { ...((stored && stored.snapshot) || {}) };
  const meta = { ...((stored && stored.meta) || {}) };
  const inSnap = incoming.snapshot || {};
  const inMeta = incoming.meta || {};
  const known = incoming.known || {};
  let changed = false;

  for (const key of Object.keys(inMeta)) {
    if (!isSyncKey(key)) continue;
    const t = Number(inMeta[key]);
    if (!Number.isFinite(t)) continue;
    if (t < (meta[key] || 0)) continue; // the stored copy is newer: it will be sent back below
    const carries = has(inSnap, key);
    if (carries && typeof inSnap[key] !== "string") continue;
    if (carries) {
      if (snapshot[key] !== inSnap[key] || meta[key] !== t) changed = true;
      snapshot[key] = inSnap[key];
    } else {
      if (has(snapshot, key) || meta[key] !== t) changed = true;
      delete snapshot[key];
    }
    meta[key] = t;
  }

  const send = { snapshot: {}, meta: {}, deleted: [] };
  for (const key of Object.keys(meta)) {
    const deviceTime = Number(known[key]) || 0;
    if (meta[key] > deviceTime) {
      send.meta[key] = meta[key];
      if (has(snapshot, key)) send.snapshot[key] = snapshot[key];
      else send.deleted.push(key);
    }
  }

  const need = [];
  for (const key of Object.keys(known)) {
    if (!isSyncKey(key)) continue;
    const deviceTime = Number(known[key]);
    if (Number.isFinite(deviceTime) && deviceTime > (meta[key] || 0)) need.push(key);
  }

  return { snapshot, meta, changed, send, need };
}

/** Handles one POST to the sync function. `existing` is what is stored (or
 * null). Returns { status, response, toStore } where toStore is null when
 * nothing needs saving. Pure, so it can be tested without Netlify. */
export function processSyncPost(incoming, existing, now = Date.now()) {
  if (!isPlainObject(incoming)) return { status: 400, response: { error: "Invalid body." }, toStore: null };
  const stored = existing || { snapshot: {}, meta: {}, updatedAt: 0 };

  if (incoming.v === 2) {
    for (const field of ["snapshot", "meta", "known"]) {
      if (incoming[field] !== undefined && !isPlainObject(incoming[field])) {
        return { status: 400, response: { error: `Invalid "${field}".` }, toStore: null };
      }
    }
    const r = applyDelta(stored, incoming);
    const updatedAt = r.changed ? now : stored.updatedAt || 0;
    return {
      status: 200,
      response: { delta: true, snapshot: r.send.snapshot, meta: r.send.meta, deleted: r.send.deleted, need: r.need, updatedAt },
      toStore: r.changed ? { snapshot: r.snapshot, meta: r.meta, updatedAt } : null,
    };
  }

  // An older copy of the app: it sends and expects the whole notebook.
  const merged = mergeBundles(incoming, stored);
  const unchanged = existing && sameBundle(merged, existing);
  const updatedAt = unchanged ? stored.updatedAt || now : now;
  const result = { ...merged, updatedAt };
  return { status: 200, response: result, toStore: unchanged || (!existing && !Object.keys(merged.snapshot).length) ? null : result };
}
