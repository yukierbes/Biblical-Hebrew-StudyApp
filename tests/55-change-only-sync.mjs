import { assert, summary } from "./helpers.mjs";
import { mergeBundles, applyDelta, processSyncPost, sameBundle, isSyncKey } from "../netlify/functions/merge-logic.js";
import {
  TIMING, findChanges, hasChanges, sameSnapshot, buildRequest, applyDeltaResponse, runSyncRounds,
  decideSync, backoffDelay, storageUsage, formatBytes,
} from "../public/js/sync-delta.js";

// Change-only syncing: what the server does with a device's changes, what a device does with the answer, and
// whole conversations between two devices and the server (run with the same loop the app uses).

const P = "hebrewVerbApp:";
const META = P + "cloudSync:meta";
const SHADOW = P + "cloudSync:shadow";

console.log("Server: applying a device's changes");
{
  let r = processSyncPost({ v: 2, snapshot: { [P + "a"]: "1", [P + "b"]: "2" }, meta: { [P + "a"]: 10, [P + "b"]: 11 }, known: { [P + "a"]: 10, [P + "b"]: 11 } }, null, 500);
  assert(r.status === 200 && r.toStore && r.toStore.snapshot[P + "a"] === "1" && r.toStore.meta[P + "b"] === 11, "a first sync saves what the device sent");
  assert(r.response.delta === true && Object.keys(r.response.snapshot).length === 0 && r.response.need.length === 0, "...and sends nothing back (the device already has it all)");
  assert(r.toStore.updatedAt === 500, "...stamped with the time");
  const stored = r.toStore;

  r = processSyncPost({ v: 2, snapshot: {}, meta: {}, known: { [P + "a"]: 10, [P + "b"]: 11 } }, stored, 900);
  assert(r.toStore === null, "a device with nothing new causes no save at all");
  assert(r.response.updatedAt === 500, "...and the saved time does not move");
  assert(Object.keys(r.response.snapshot).length === 0 && r.response.deleted.length === 0, "...and gets nothing back");

  r = processSyncPost({ v: 2, snapshot: { [P + "a"]: "1" }, meta: { [P + "a"]: 10 }, known: { [P + "a"]: 10, [P + "b"]: 11 } }, stored, 900);
  assert(r.toStore === null, "sending an item the server already holds identically is not a change");

  r = processSyncPost({ v: 2, snapshot: { [P + "a"]: "new" }, meta: { [P + "a"]: 20 }, known: { [P + "a"]: 20, [P + "b"]: 11 } }, stored, 900);
  assert(r.toStore.snapshot[P + "a"] === "new" && r.toStore.snapshot[P + "b"] === "2" && r.toStore.meta[P + "a"] === 20, "a newer change replaces that one item and leaves the rest");

  r = processSyncPost({ v: 2, snapshot: { [P + "a"]: "stale" }, meta: { [P + "a"]: 5 }, known: { [P + "a"]: 5, [P + "b"]: 11 } }, stored, 900);
  assert(r.toStore === null && r.response.snapshot[P + "a"] === "1" && r.response.meta[P + "a"] === 10, "an older change never overwrites a newer stored one: the newer one is sent back");

  r = processSyncPost({ v: 2, snapshot: {}, meta: {}, known: {} }, stored, 900);
  assert(r.response.snapshot[P + "a"] === "1" && r.response.snapshot[P + "b"] === "2", "a device that knows nothing is sent everything");

  r = processSyncPost({ v: 2, snapshot: {}, meta: { [P + "a"]: 30 }, known: { [P + "a"]: 30, [P + "b"]: 11 } }, stored, 900);
  assert(r.toStore && !(P + "a" in r.toStore.snapshot) && r.toStore.meta[P + "a"] === 30, "a deleted item (a time and no text) is removed but remembered");
  const afterDelete = r.toStore;
  r = processSyncPost({ v: 2, snapshot: {}, meta: {}, known: { [P + "a"]: 10, [P + "b"]: 11 } }, afterDelete, 950);
  assert(r.response.deleted.includes(P + "a") && r.response.meta[P + "a"] === 30, "another device is told to delete it");
  r = processSyncPost({ v: 2, snapshot: {}, meta: {}, known: { [P + "a"]: 30, [P + "b"]: 11 } }, afterDelete, 950);
  assert(r.response.deleted.length === 0, "...and only once");

  r = processSyncPost({ v: 2, snapshot: {}, meta: {}, known: { [P + "a"]: 10, [P + "b"]: 11, [P + "c"]: 40 } }, stored, 900);
  assert(r.response.need.length === 1 && r.response.need[0] === P + "c", "an item the device has that the server lacks is asked for (this repairs a lost copy)");
  r = processSyncPost({ v: 2, snapshot: {}, meta: {}, known: { [P + "a"]: 99, [P + "b"]: 11 } }, stored, 900);
  assert(r.response.need.includes(P + "a"), "...and so is one the device has newer");
}

console.log("\nServer: only the app's own items, only text");
{
  const bad = processSyncPost({ v: 2, snapshot: { "other:thing": "x", [META]: "x", [SHADOW]: "x", [P + "ok"]: "y" }, meta: { "other:thing": 5, [META]: 5, [SHADOW]: 5, [P + "ok"]: 5 }, known: {} }, null, 1);
  assert(Object.keys(bad.toStore.snapshot).join() === P + "ok", "keys that are not the app's own (or are sync's own bookkeeping) are ignored");
  assert(processSyncPost({ v: 2, snapshot: { [P + "n"]: 5 }, meta: { [P + "n"]: 5 }, known: {} }, null, 1).toStore === null, "a value that is not text is ignored");
  assert(processSyncPost({ v: 2, snapshot: { [P + "n"]: "x" }, meta: { [P + "n"]: "soon" }, known: {} }, null, 1).toStore === null, "a time that is not a number is ignored");
  assert(processSyncPost({ v: 2, snapshot: [], meta: {}, known: {} }, null, 1).status === 400, "a malformed body is refused");
  assert(processSyncPost(null, null, 1).status === 400, "an empty body is refused");
  assert(isSyncKey(P + "x") && !isSyncKey("x") && !isSyncKey(META), "isSyncKey");
}

console.log("\nServer: an older copy of the app still works");
{
  const first = processSyncPost({ snapshot: { [P + "a"]: "1" }, meta: { [P + "a"]: 10 } }, null, 700);
  assert(first.response.snapshot[P + "a"] === "1" && !first.response.delta && first.toStore, "a whole-notebook request is answered with the whole merged notebook");
  const again = processSyncPost({ snapshot: { [P + "a"]: "1" }, meta: { [P + "a"]: 10 } }, first.toStore, 800);
  assert(again.toStore === null && again.response.updatedAt === 700, "...and an unchanged one is not saved again");
  const m = mergeBundles({ snapshot: { x: "new" }, meta: { x: 5 } }, { snapshot: { x: "old", y: "keep" }, meta: { x: 1, y: 2 } });
  assert(m.snapshot.x === "new" && m.snapshot.y === "keep", "mergeBundles still merges per item");
  assert(sameBundle(m, { snapshot: { ...m.snapshot }, meta: { ...m.meta } }) && !sameBundle(m, { snapshot: {}, meta: {} }), "sameBundle");
  const empty = processSyncPost({ snapshot: {}, meta: {} }, null, 1);
  assert(empty.toStore === null, "a brand-new person with nothing to save creates nothing");
}

console.log("\nDevice: working out what to send");
{
  assert(findChanges({ a: "1", b: "2" }, { a: "1", b: "3", c: "4" }).changed.join() === "b,c", "changed and new items are found");
  assert(findChanges({ a: "1", b: "2" }, { a: "1" }).removed.join() === "b", "removed items are found");
  assert(!hasChanges({ a: "1" }, { a: "1" }) && hasChanges({}, { a: "1" }) && sameSnapshot({ a: "1" }, { a: "1" }) && !sameSnapshot({ a: "1" }, { a: "2" }), "hasChanges / sameSnapshot");

  const b = buildRequest({ shadow: { [P + "a"]: "1", [P + "gone"]: "x" }, current: { [P + "a"]: "2", [P + "new"]: "n" }, meta: { [P + "a"]: 100, [P + "gone"]: 50, [P + "same"]: 7 }, now: 1000 });
  assert(b.request.v === 2 && Object.keys(b.request.snapshot).sort().join() === [P + "a", P + "new"].join(), "only changed items are sent as text");
  assert(b.request.meta[P + "gone"] === 1000 && !(P + "gone" in b.request.snapshot), "a removed item is sent as a time only");
  assert(!(P + "same" in b.request.meta) && b.request.known[P + "same"] === 7, "an unchanged item is not sent, but is listed as known");
  assert(b.meta[P + "a"] === 1000, "a changed item gets the new time");
  const slow = buildRequest({ shadow: { [P + "a"]: "1" }, current: { [P + "a"]: "2" }, meta: { [P + "a"]: 5000 }, now: 1000 });
  assert(slow.meta[P + "a"] === 5001, "a new time is always later than the old one, even if this device's clock is behind");
  const extra = buildRequest({ shadow: { [P + "q"]: "v" }, current: { [P + "q"]: "v" }, meta: { [P + "q"]: 77 }, now: 1000, extraKeys: [P + "q", P + "zz"] });
  assert(extra.request.snapshot[P + "q"] === "v" && extra.request.meta[P + "q"] === 77, "an item the server asked for is sent with the time it already had");
  assert(extra.request.meta[P + "zz"] === 1000 && !(P + "zz" in extra.request.snapshot), "...and one this device no longer has is sent as a deletion");
}

console.log("\nDevice: applying the server's answer");
{
  const store = { [P + "a"]: "mine", [P + "typed"]: "during", [P + "del"]: "x" };
  const io = { get: (k) => (k in store ? store[k] : null), set: (k, v) => (store[k] = v), remove: (k) => delete store[k] };
  const out = applyDeltaResponse(
    { snapshot: { [P + "new"]: "from server", [P + "typed"]: "server's" }, meta: { [P + "new"]: 50, [P + "typed"]: 60, [P + "del"]: 70 }, deleted: [P + "del"], need: [] },
    { shadow: { [P + "del"]: "x" }, meta: { [P + "a"]: 10 }, sent: { [P + "a"]: "mine" }, atSend: { [P + "a"]: "mine", [P + "typed"]: "before", [P + "del"]: "x" } }, io, 999);
  assert(store[P + "new"] === "from server" && out.shadow[P + "new"] === "from server" && out.meta[P + "new"] === 50, "a new item from the server is saved, with its time");
  assert(store[P + "typed"] === "during" && !(P + "typed" in out.shadow), "an item the person changed while the request was out is left alone (their change is sent next)");
  assert(out.shadow[P + "a"] === "mine", "what was sent is now what the server holds");
  assert(!(P + "del" in out.shadow) && out.meta[P + "del"] === 70, "a deleted item leaves the shadow and keeps its time");
  assert(out.applied === 2 && !(P + "del" in store), "...and is removed from storage; only items actually changed are counted");
}

console.log("\nTwo devices and the server (the app's own loop)");
function makeDevice(name) {
  const data = {};
  return {
    name, data,
    storage: {
      readSnapshot: () => { const o = {}; for (const k of Object.keys(data)) if (k.startsWith(P) && k !== META && k !== SHADOW) o[k] = data[k]; return o; },
      getJSON: (k, fb) => (k in data ? JSON.parse(data[k]) : fb),
      setJSON: (k, v) => { data[k] = JSON.stringify(v); },
      io: { get: (k) => (k in data ? data[k] : null), set: (k, v) => { data[k] = v; }, remove: (k) => { delete data[k]; } },
    },
    get items() { return this.storage.readSnapshot(); },
  };
}
const server = { stored: null, saves: 0, calls: 0, bytesIn: 0 };
let clock = 1000;
const syncDevice = (d) => runSyncRounds({
  storage: d.storage, keys: { shadow: SHADOW, meta: META }, now: () => ++clock,
  post: async (request) => {
    const text = JSON.stringify(request);
    server.calls++; server.bytesIn += text.length;
    const r = processSyncPost(JSON.parse(text), server.stored, clock);
    if (r.toStore) { server.stored = r.toStore; server.saves++; }
    return JSON.parse(JSON.stringify(r.response));
  },
});
{
  const phone = makeDevice("phone"), laptop = makeDevice("laptop");
  phone.data[P + "srs:vocab"] = "phone-1"; phone.data[P + "streak"] = "3";
  await syncDevice(phone);
  assert(server.stored.snapshot[P + "streak"] === "3", "the phone's first sync saves its progress");
  await syncDevice(laptop);
  assert(laptop.items[P + "srs:vocab"] === "phone-1" && laptop.items[P + "streak"] === "3", "a new device receives everything");

  const savesBefore = server.saves;
  await syncDevice(phone); await syncDevice(laptop); await syncDevice(phone);
  assert(server.saves === savesBefore, "syncing with nothing changed saves nothing on the server, however often");

  laptop.data[P + "srs:vocab"] = "laptop-2";
  await syncDevice(laptop);
  assert(server.saves === savesBefore + 1, "one change is one save");
  const sizeBefore = server.bytesIn;
  await syncDevice(phone);
  assert(phone.items[P + "srs:vocab"] === "laptop-2" && phone.items[P + "streak"] === "3", "the other device picks up just that change");
  assert(server.bytesIn - sizeBefore < 400, "...and an idle pull sends only a short list of times");

  phone.data[P + "streak"] = "4"; laptop.data[P + "reading"] = "r1";
  await syncDevice(phone); await syncDevice(laptop); await syncDevice(phone);
  assert(phone.items[P + "reading"] === "r1" && laptop.items[P + "streak"] === "4", "changes to different items on two devices both survive");

  phone.data[P + "note"] = "phone says A"; await syncDevice(phone);
  await syncDevice(laptop);
  laptop.data[P + "note"] = "laptop says B"; await syncDevice(laptop);
  await syncDevice(phone);
  assert(phone.items[P + "note"] === "laptop says B", "when two devices change the same item, the later change wins");

  delete phone.data[P + "reading"]; await syncDevice(phone); await syncDevice(laptop);
  assert(!(P + "reading" in laptop.items) && !(P + "reading" in server.stored.snapshot), "deleting an item on one device deletes it everywhere");
  const calls = server.calls; await syncDevice(laptop); await syncDevice(phone);
  assert(server.calls === calls + 2 && !(P + "reading" in phone.items), "...and it does not come back");

  // the server loses its copy: the devices repair it
  server.stored = null;
  const r = await syncDevice(phone);
  assert(server.stored && server.stored.snapshot[P + "note"] === "laptop says B" && Object.keys(server.stored.snapshot).length === Object.keys(phone.items).length, "if the server loses its copy, the next sync puts everything back");
  await syncDevice(laptop);
  assert(Object.keys(laptop.items).length === Object.keys(phone.items).length, "...without disturbing the other device");

  // an offline device catches up
  laptop.data[P + "offline-1"] = "a"; laptop.data[P + "offline-2"] = "b";
  const failing = runSyncRounds({ storage: laptop.storage, keys: { shadow: SHADOW, meta: META }, now: () => ++clock, post: async () => { throw new Error("offline"); } });
  let failed = false; try { await failing; } catch (e) { failed = true; }
  assert(failed && hasChanges(laptop.storage.getJSON(SHADOW, {}), laptop.items), "a failed sync leaves the changes waiting");
  await syncDevice(laptop); await syncDevice(phone);
  assert(phone.items[P + "offline-1"] === "a" && phone.items[P + "offline-2"] === "b", "...and the next one delivers them");

  // an older server (answers with a whole notebook)
  const legacyDevice = makeDevice("old-server");
  legacyDevice.data[P + "x"] = "1";
  const res = await runSyncRounds({ storage: legacyDevice.storage, keys: { shadow: SHADOW, meta: META }, now: () => ++clock, post: async () => ({ snapshot: { [P + "x"]: "1", [P + "y"]: "2" }, meta: { [P + "x"]: 5, [P + "y"]: 6 }, updatedAt: 1 }) });
  assert(res.legacy && res.legacy.snapshot[P + "y"] === "2", "a whole-notebook answer is handed back for the old way of applying it");
}

console.log("\nWhen to contact the server");
{
  const base = { pending: false, firstChangeAt: 0, lastChangeAt: 0, lastContactAt: 1000, now: 1000 };
  assert(decideSync(base) === "wait", "nothing changed and recently in touch: wait");
  assert(decideSync({ ...base, now: 1000 + TIMING.PULL_MS - 1 }) === "wait" && decideSync({ ...base, now: 1000 + TIMING.PULL_MS }) === "sync", "nothing changed: look for changes from other devices only every few minutes");
  assert(decideSync({ ...base, pending: true, firstChangeAt: 1000, lastChangeAt: 1000, now: 1000 + TIMING.QUIET_MS - 1 }) === "wait", "changes still coming in: wait");
  assert(decideSync({ ...base, pending: true, firstChangeAt: 1000, lastChangeAt: 1000, now: 1000 + TIMING.QUIET_MS }) === "sync", "changes then quiet: send");
  assert(decideSync({ ...base, pending: true, firstChangeAt: 1000, lastChangeAt: 1000 + TIMING.MAX_WAIT_MS - 1000, now: 1000 + TIMING.MAX_WAIT_MS }) === "sync", "constant changes: send at most every 90 seconds");
  assert(TIMING.QUIET_MS >= 20000 && TIMING.PULL_MS >= 300000, "the timings are no tighter than the old 20-second send-everything loop");
  assert(backoffDelay(0) === 0 && backoffDelay(1) === 15000 && backoffDelay(2) === 30000 && backoffDelay(20) === TIMING.BACKOFF_MAX_MS, "after failures the app holds off longer each time, up to a cap");
}

console.log("\nStorage readout");
{
  const u = storageUsage({ [P + "big"]: "x".repeat(5000), [P + "small"]: "y", [P + "mid"]: "z".repeat(100) });
  assert(u.count === 3 && u.bytes > 5100 && u.largest[0].key === P + "big" && u.largest.length === 3, "total size, count and the largest items");
  assert(storageUsage({ a: "é" }).bytes === 3, "sizes count real bytes, not letters");
  assert(formatBytes(512) === "512 B" && formatBytes(2048) === "2 KB" && formatBytes(1.5 * 1024 * 1024) === "1.5 MB", "formatBytes");
}

summary();
