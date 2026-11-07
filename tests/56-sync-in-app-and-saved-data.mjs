import fs from "node:fs";
import vm from "node:vm";
import { setupApp, assert, summary } from "./helpers.mjs";

// The app's sync module in a pretend browser (it should stay quiet when nothing changes), the Account section's
// storage readout, and the service worker reusing a dataset saved by the current release.

const P = "hebrewVerbApp:";
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const { document, window, localStorage } = await setupApp();
const sync = await import("../public/js/cloud-sync.js");
const { TIMING } = await import("../public/js/sync-delta.js");
const server = global.fakeSyncServer;

// a clock the test controls
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;
const advance = (ms) => { clock += ms; };
const setVisibility = (state) => { Object.defineProperty(document, "visibilityState", { value: state, configurable: true }); document.dispatchEvent(new window.Event("visibilitychange")); };

// capture what the app sends
const sent = [];
const baseFetch = global.fetch;
global.fetch = async (url, opts) => { if (String(url).includes("/functions/sync")) sent.push({ body: JSON.parse(opts.body), keepalive: !!opts.keepalive }); return baseFetch(url, opts); };

console.log("Syncing stays quiet when nothing changes");
await sync.syncNow();
await wait();
sent.length = 0;
const callsBefore = server.calls;
for (let i = 0; i < 40; i++) { advance(TIMING.CHECK_MS); sync.checkForChanges(); }   // 200 seconds of an open, idle tab
await wait();
assert(server.calls === callsBefore, "an idle open tab sends nothing for more than three minutes (it used to send every 20 seconds)");
advance(TIMING.PULL_MS); sync.checkForChanges(); await wait();
assert(server.calls === callsBefore + 1 && Object.keys(sent[0].body.snapshot).length === 0, "after a few minutes it checks once for changes from other devices, sending no progress");

console.log("\nA change is sent once, and only that change");
sent.length = 0;
localStorage.setItem(P + "test:answer", JSON.stringify({ right: 1 }));
sync.checkForChanges(); await wait();
assert(sent.length === 0, "right after a change, it waits (more answers may follow)");
advance(TIMING.CHECK_MS); localStorage.setItem(P + "test:answer", JSON.stringify({ right: 2 })); sync.checkForChanges(); await wait();
advance(TIMING.QUIET_MS - 1000); sync.checkForChanges(); await wait();
assert(sent.length === 0, "...and keeps waiting while changes keep coming");
advance(TIMING.QUIET_MS); sync.checkForChanges(); await wait();
assert(sent.length === 1, "once things go quiet it sends, one request");
assert(Object.keys(sent[0].body.snapshot).join() === P + "test:answer" && JSON.parse(sent[0].body.snapshot[P + "test:answer"]).right === 2, "...containing only the item that changed, with its latest value");
assert(server.stored.snapshot[P + "test:answer"] === JSON.stringify({ right: 2 }), "the server now holds it");
sent.length = 0;
advance(TIMING.CHECK_MS); sync.checkForChanges(); await wait();
assert(sent.length === 0, "and nothing more is sent afterwards");

console.log("\nConstant changes are still sent regularly");
sent.length = 0;
for (let i = 0; i < 30; i++) { advance(5000); localStorage.setItem(P + "test:busy", String(i)); sync.checkForChanges(); await wait(5); }
assert(sent.length >= 1 && sent.length <= 3, `a busy 2.5 minutes sends a handful of requests, not one every few seconds (${sent.length})`);

console.log("\nHidden and closing");
sent.length = 0;
localStorage.setItem(P + "test:leaving", "yes");
setVisibility("hidden"); await wait();
assert(sent.length === 1 && sent[0].keepalive === true && P + "test:leaving" in sent[0].body.snapshot, "hiding the tab sends what is waiting, marked to finish even if the page closes");
sent.length = 0;
for (let i = 0; i < 80; i++) { advance(TIMING.CHECK_MS); sync.checkForChanges(); }
await wait();
assert(sent.length === 0, "a hidden tab never contacts the server on its own");
localStorage.setItem(P + "test:while-hidden", "x");
for (let i = 0; i < 40; i++) { advance(TIMING.CHECK_MS); sync.checkForChanges(); }
await wait();
assert(sent.length === 0, "...not even for changes made while it is hidden");
setVisibility("visible"); await wait();
assert(sent.length === 1 && P + "test:while-hidden" in sent[0].body.snapshot, "coming back to the tab sends them");
sent.length = 0;
advance(1000); setVisibility("hidden"); setVisibility("visible"); await wait();
assert(sent.length === 0, "flicking away and back quickly with nothing changed costs nothing");
window.dispatchEvent(new window.Event("pagehide")); await wait();
assert(sent.length === 0, "closing with nothing waiting sends nothing");
localStorage.setItem(P + "test:closing", "1");
window.dispatchEvent(new window.Event("pagehide")); await wait();
assert(sent.length === 1 && sent[0].keepalive, "closing with something waiting sends it");

console.log("\nFailures");
sent.length = 0;
const failing = global.fetch;
let failSync = true;
global.fetch = async (url, opts) => { if (failSync && String(url).includes("/functions/sync")) { sent.push({}); return { ok: false, status: 500 }; } return failing(url, opts); };
localStorage.setItem(P + "test:fail", "1");
await sync.syncNow(); await wait();
assert(sync.getSyncStatus().error && sent.length === 1, "a failed sync is reported");
for (let i = 0; i < 2; i++) { advance(TIMING.CHECK_MS); sync.checkForChanges(); }
await wait();
assert(sent.length === 1, "...and the app holds off rather than retrying at once");
advance(TIMING.BACKOFF_START_MS); sync.checkForChanges(); await wait();
assert(sent.length === 2, "...then tries again");
for (let i = 0; i < 4; i++) { advance(TIMING.CHECK_MS); sync.checkForChanges(); }
await wait();
assert(sent.length === 2, "...and waits longer after the second failure (the wait doubles each time)");
failSync = false;
await sync.syncNow(); await wait();
assert(!sync.getSyncStatus().error && P + "test:fail" in server.stored.snapshot, "Sync Now always tries, and the change goes through once the server is back");
global.fetch = failing;

console.log("\nAccount section");
sync.initCloudSyncUI();
const acct = document.getElementById("account-section");
assert(acct && /Saved progress: \d+(\.\d)? (B|KB|MB)/.test(acct.textContent), "the Account section shows how much progress is saved on this device");
localStorage.setItem(P + "test:huge", "x".repeat(3.2 * 1024 * 1024));
sync.getSyncStatus(); sync.cloudSyncSignedIn("test@example.com"); await wait();
const line = document.getElementById("account-storage-line");
assert(line && /storage limit/.test(line.textContent), "...and warns when it gets close to the browser's limit");
localStorage.removeItem(P + "test:huge");

Date.now = realNow;

console.log("\nService worker: reuse a saved dataset until the next release");
const swSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function makeSw({ release = "rel-1", online = true } = {}) {
  const store = new Map();
  const listeners = {};
  let netCalls = 0;
  class H { constructor(init) { this.m = new Map(init instanceof H ? init.m : Object.entries(init || {})); } get(k) { return this.m.has(k) ? this.m.get(k) : null; } set(k, v) { this.m.set(k, v); } }
  class Resp { constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.statusText = ""; this.headers = new H(init.headers); this.ok = this.status < 400; } clone() { return new Resp(this.body, { status: this.status, headers: this.headers }); } }
  const cache = (name) => ({
    put: async (k, v) => store.set(name + "|" + (typeof k === "string" ? k : k.url), v),
    match: async (k) => store.get(name + "|" + (typeof k === "string" ? k : k.url)),
    addAll: async () => {},
  });
  const sandbox = {
    self: { addEventListener: (t, f) => (listeners[t] = f), location: { origin: "https://app.test" }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async (n) => cache(n), keys: async () => [], delete: async () => true },
    Response: Resp, Headers: H, URL, Promise, console,
    fetch: async (req) => { netCalls++; if (!sandbox.__online) throw new Error("offline"); return new Resp("DATA:" + req.url + "#" + netCalls, { status: sandbox.__status }); },
    __online: online, __status: 200,
  };
  vm.runInNewContext(swSource.replace(/const CACHE_VERSION = "[^"]*";/, `const CACHE_VERSION = "${release}";`), sandbox);
  const run = (url) => new Promise((resolve) => { let p; listeners.fetch({ request: { method: "GET", url }, respondWith: (x) => (p = x) }); resolve(p); });
  return { sandbox, store, run, listeners, get netCalls() { return netCalls; } };
}
const url = "https://app.test/.netlify/functions/get-data?dataset=vocabulary";
const sw1 = makeSw({ release: "rel-1" });
let r = await sw1.run(url);
assert(r.body.endsWith("#1") && sw1.netCalls === 1, "the first time, a dataset comes from the network");
await wait(10);
r = await sw1.run(url);
assert(r.body.endsWith("#1") && sw1.netCalls === 1, "the second time it comes from the saved copy, with no request at all");
await sw1.run(url); await sw1.run(url);
assert(sw1.netCalls === 1, "...however often it is opened in this release");
await sw1.run(url.replace("vocabulary", "verbs"));
assert(sw1.netCalls === 2, "a different dataset is fetched separately");

// a new release: same saved copies, new version number
const sw2 = makeSw({ release: "rel-2" });
for (const [k, v] of sw1.store) sw2.store.set(k, v);
r = await sw2.run(url);
assert(sw2.netCalls === 1 && r.body.endsWith("#1") && /DATA:/.test(r.body), "after a new release the copy is fetched again (it may have changed)");
await wait(10);
await sw2.run(url);
assert(sw2.netCalls === 1, "...and then reused for the rest of that release");
const sw3 = makeSw({ release: "rel-3", online: false });
for (const [k, v] of sw2.store) sw3.store.set(k, v);
r = await sw3.run(url);
assert(r.body.startsWith("DATA:") && sw3.netCalls === 1, "offline after a new release, the older saved copy is still served");
const never = await sw3.run(url.replace("vocabulary", "accents"));
assert(never.status === 503, "offline and never saved: a clear 503");
const sw4 = makeSw({ release: "rel-4" });
sw4.store.set("hebrew-app-data-v1|/.netlify/functions/get-data?dataset=vocabulary", new sw4.sandbox.Response("OLD-FORMAT-COPY"));
r = await sw4.run(url);
assert(r.body.startsWith("DATA:") && sw4.netCalls === 1, "a copy saved before this change (no release mark) is fetched again once");
const bad = makeSw({ release: "rel-5" }); bad.sandbox.__status = 401;
await bad.run(url); await wait(10);
assert(bad.store.size === 0, "an error answer (not signed in) is never saved");

console.log("\nService worker: saving progress does not pass through it");
{
  const routes = [];
  const sw = makeSw();
  let installed;
  sw.listeners.install({ addRoutes: (r) => routes.push(r), waitUntil: (p) => (installed = p) });
  await installed;
  assert(routes.length === 1 && routes[0].source === "network" && routes[0].condition.urlPattern === "/.netlify/functions/sync", "where the browser supports it, the sync request goes straight to the network (a send as a tab closes can be dropped if it has to pass through the worker)");
  let ok = true;
  try { let p2; sw.listeners.install({ waitUntil: (p) => (p2 = p) }); await p2; } catch (e) { ok = false; }
  assert(ok, "...and a browser without that feature installs the worker as before");
  let threw = false;
  try { let p3; sw.listeners.install({ addRoutes: () => { throw new Error("nope"); }, waitUntil: (p) => (p3 = p) }); await p3; } catch (e) { threw = true; }
  assert(!threw, "...and one where it fails does not break installing");
}

summary();
