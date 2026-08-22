import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "netlify/functions/data");

let failures = 0;
let passes = 0;

export function assert(condition, message) {
  if (condition) {
    passes++;
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

export function summary() {
  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures > 0) process.exit(1);
}

/**
 * Sets up a fresh jsdom window + document + mocked browser APIs, and
 * loads the real public/index.html + app CSS + main.js — as close to
 * the real browser environment as we can get without an actual
 * browser. Datasets and progress sync now go through Identity-gated
 * Netlify Functions rather than plain static files, so this also mocks
 * `window.netlifyIdentity` as an already-signed-in user (auto-firing
 * "init" synchronously) so the auth gate in main.js doesn't block
 * every test — and mocks `fetch` to serve the bundled JSON for
 * get-data calls and a no-op merge response for sync calls.
 */
export async function setupApp({ mobile = false } = {}) {
  const html = readFileSync(path.join(PUBLIC, "index.html"), "utf-8");
  const css = readFileSync(path.join(PUBLIC, "css/style.css"), "utf-8");
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  global.Event = dom.window.Event;

  const storageData = {};
  const localStorageMock = {
    getItem: (k) => (k in storageData ? storageData[k] : null),
    setItem: (k, v) => {
      storageData[k] = String(v);
    },
    removeItem: (k) => {
      delete storageData[k];
    },
  };
  global.localStorage = localStorageMock;

  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("/.netlify/functions/get-data")) {
      const dataset = new URL(u, "http://localhost/").searchParams.get("dataset");
      const filenames = { verbs: "verbs.json", vocabulary: "vocabulary.json", accents: "accents.json" };
      const filename = filenames[dataset];
      if (!filename) return { ok: false, status: 400 };
      const content = readFileSync(path.join(DATA_DIR, filename), "utf-8");
      return { ok: true, json: async () => JSON.parse(content) };
    }
    if (u.includes("/.netlify/functions/sync")) {
      // No real backend in tests — just echo back whatever was pushed,
      // as if the server had nothing else stored yet.
      const body = opts && opts.body ? JSON.parse(opts.body) : { snapshot: {}, meta: {} };
      return { ok: true, json: async () => ({ ...body, updatedAt: Date.now() }) };
    }
    return { ok: false, status: 404 };
  };

  // A minimal stand-in for the Netlify Identity widget: already signed
  // in, so tests exercise the app itself rather than the sign-in gate.
  const identityListeners = {};
  const fakeUser = { email: "test@example.com", sub: "test-user", jwt: async () => "fake-test-jwt" };
  dom.window.netlifyIdentity = {
    on(event, cb) {
      identityListeners[event] = cb;
    },
    init() {
      if (identityListeners.init) identityListeners.init(fakeUser);
    },
    open() {},
    close() {},
    logout() {
      if (identityListeners.logout) identityListeners.logout();
    },
    currentUser: () => fakeUser,
  };
  global.netlifyIdentity = dom.window.netlifyIdentity;

  global.XLSX = {
    utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} },
    writeFile: () => {},
  };
  dom.window.URL.createObjectURL = () => "blob:fake";
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.print = () => {};
  dom.window.matchMedia = (query) => ({
    matches: mobile,
    media: query,
    addListener() {},
    removeListener() {},
  });
  if (!dom.window.navigator.serviceWorker) {
    Object.defineProperty(dom.window.navigator, "serviceWorker", { value: undefined, configurable: true });
  }

  // Inject the real stylesheet so getComputedStyle reflects our actual CSS.
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  await import(path.join(PUBLIC, "js/main.js"));
  await new Promise((r) => setTimeout(r, 200));

  return { dom, document, window: dom.window, localStorage: localStorageMock };
}

export function click(el) {
  el.dispatchEvent(new Event("click", { bubbles: true }));
}

export function pressKey(target, key) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

export function findButtonByText(root, text) {
  return [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
}

export function findButtonStartingWith(root, text) {
  return [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(text));
}

export function countButtonsByText(root, text) {
  return [...root.querySelectorAll("button")].filter((b) => b.textContent.trim() === text).length;
}

export function navigateTo(document, page) {
  document.querySelector(`.nav-btn[data-page="${page}"]`).dispatchEvent(new Event("click", { bubbles: true }));
}
