import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { renderCheckboxList } from "../public/js/widgets.js";
import { clampSidebarWidth, initSidebarResize, MIN_SIDEBAR_WIDTH } from "../public/js/sidebar-resize.js";

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ======================================================================
console.log("Filter boxes: Select all / Clear all");

{
  const box = document.createElement("div");
  const calls = [];
  const draw = (selected) =>
    renderCheckboxList(box, { label: "Lesson", options: ["1A", "1B", "1C"], selected, onChange: (v) => calls.push(v) });
  const buttons = () => [...box.querySelectorAll(".select-all-row button")];

  draw([]);
  assert(
    buttons().map((b) => b.textContent).join("|") === "Select all|Clear all",
    "each filter box has a 'Select all' button and then a 'Clear all' button"
  );
  assert(box.querySelector(".select-all-row").nextElementSibling.classList.contains("checkbox-list"), "the buttons sit directly above the box");
  assert(buttons()[1].disabled && !buttons()[0].disabled, "with nothing chosen, 'Clear all' is disabled and 'Select all' is available");

  click(buttons()[0]);
  assert(JSON.stringify(calls.at(-1)) === '["1A","1B","1C"]', "'Select all' chooses every option");

  draw(["1B"]);
  assert(!buttons()[1].disabled, "once something is chosen, 'Clear all' is enabled");
  click(buttons()[1]);
  assert(JSON.stringify(calls.at(-1)) === "[]", "'Clear all' empties just this filter");

  draw(["1A", "1B", "1C"]);
  assert(buttons()[0].disabled && !buttons()[1].disabled, "with everything chosen, 'Select all' is disabled and 'Clear all' stays available");
  assert(
    buttons()[0].getAttribute("aria-label") === "Select all: Lesson" && buttons()[1].getAttribute("aria-label") === "Clear all: Lesson",
    "the buttons say which filter they belong to for screen readers"
  );
}

// Through a real page: clearing one filter leaves the others alone.
{
  navigateTo(document, "vocabulary");
  await wait(30);
  const sidebarExtra = document.getElementById("sidebar-extra");
  const lists = () => [...sidebarExtra.querySelectorAll(".checkbox-list")];
  const checkedIn = (i) => lists()[i].querySelectorAll("input:checked").length;
  // element.click() toggles a checkbox and fires 'change', as in a browser
  // (the shared click() helper sends a bare event, which doesn't toggle it).
  const tick = (list, n) => lists()[list].querySelectorAll("input")[n].click();
  tick(0, 0);
  tick(0, 1);
  tick(1, 0);
  assert(checkedIn(0) === 2 && checkedIn(1) === 1, "chose 2 lessons and 1 part of speech");
  click(lists()[0].previousElementSibling.querySelectorAll("button")[1]); // Lesson's 'Clear all'
  assert(checkedIn(0) === 0, "'Clear all' on Lesson empties the Lesson filter");
  assert(checkedIn(1) === 1, "...and leaves the Part-of-speech filter as it was");
  const reset = [...sidebarExtra.querySelectorAll("button")].find((b) => b.textContent === "Reset Filters");
  click(reset);
  assert(checkedIn(1) === 0, "'Reset Filters' still resets every filter at once");
}

// ======================================================================
console.log("\nSidebar resizing");

assert(clampSidebarWidth(100, 1400, false) === MIN_SIDEBAR_WIDTH, "never narrower than the minimum");
assert(clampSidebarWidth(900, 1400, false) === 600, "never wider than 600px on a large screen");
assert(clampSidebarWidth(900, 800, false) === 440, "never so wide that the page content gets under 360px");
assert(clampSidebarWidth(900, 390, true) === 334, "on a phone, always leaves a strip free to tap outside it");
assert(clampSidebarWidth(Infinity, 1400, false) === 600, "'as wide as allowed' resolves to the maximum");
assert(clampSidebarWidth("abc", 1400, false) === null, "garbage is rejected");

{
  const makeStorage = (initial = {}) => {
    const data = { ...initial };
    return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), removeItem: (k) => delete data[k], data };
  };
  const makeHandle = () => {
    const el = document.createElement("div");
    el.id = "test-resizer";
    document.body.appendChild(el);
    return el;
  };
  const key = (el, k, extra = {}) => {
    const e = new window.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(e, { key: k }, extra);
    el.dispatchEvent(e);
    return e;
  };
  const pointer = (el, type, clientX, extra = {}) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX, button: 0, pointerId: 1 }, extra);
    el.dispatchEvent(e);
  };
  const widthVar = (appEl) => appEl.style.getPropertyValue("--sidebar-width");

  // Keyboard, persistence, reset
  {
    const appEl = document.createElement("div");
    const handle = makeHandle();
    const storage = makeStorage();
    const ctl = initSidebarResize({ appEl, handleEl: handle, storage, viewportWidth: () => 1400, isOverlay: () => false });
    assert(ctl.getWidth() === 250 && widthVar(appEl) === "", "starts at the default width with nothing overridden");
    assert(handle.getAttribute("aria-valuemin") === "200" && handle.getAttribute("aria-valuemax") === "600", "handle reports its range to screen readers");

    const arrow = key(handle, "ArrowRight");
    assert(widthVar(appEl) === "266px" && arrow.defaultPrevented, "ArrowRight widens by 16px");
    key(handle, "ArrowRight", { shiftKey: true });
    assert(widthVar(appEl) === "314px", "Shift+ArrowRight widens by 48px");
    key(handle, "ArrowLeft");
    assert(widthVar(appEl) === "298px", "ArrowLeft narrows by 16px");
    key(handle, "Home");
    assert(widthVar(appEl) === "200px", "Home goes to the minimum");
    key(handle, "End");
    assert(widthVar(appEl) === "600px", "End goes to the maximum");
    assert(handle.getAttribute("aria-valuenow") === "600", "aria-valuenow follows");
    assert(storage.data.sidebarWidth === "600", "the choice is remembered");
    assert(key(handle, "a").defaultPrevented === false, "unrelated keys are left alone");

    const enter = key(handle, "Enter");
    assert(widthVar(appEl) === "" && !("sidebarWidth" in storage.data) && enter.defaultPrevented, "Enter resets to the default and forgets the saved width");

    // restoring a remembered width on the next visit
    const appEl2 = document.createElement("div");
    initSidebarResize({ appEl: appEl2, handleEl: makeHandle(), storage: makeStorage({ sidebarWidth: "333" }), viewportWidth: () => 1400, isOverlay: () => false });
    assert(widthVar(appEl2) === "333px", "a remembered width is restored on the next visit");
    const appEl3 = document.createElement("div");
    initSidebarResize({ appEl: appEl3, handleEl: makeHandle(), storage: makeStorage({ sidebarWidth: "oops" }), viewportWidth: () => 1400, isOverlay: () => false });
    assert(widthVar(appEl3) === "", "a corrupt remembered value is ignored");
  }

  // Dragging
  {
    const appEl = document.createElement("div");
    const handle = makeHandle();
    const storage = makeStorage();
    initSidebarResize({ appEl, handleEl: handle, storage, viewportWidth: () => 1400, isOverlay: () => false });
    pointer(handle, "pointerdown", 250);
    assert(appEl.classList.contains("sidebar-resizing"), "dragging marks the app as resizing (turns the easing off)");
    pointer(handle, "pointermove", 350);
    assert(widthVar(appEl) === "350px", "dragging 100px right widens by 100px");
    pointer(handle, "pointermove", 20);
    assert(widthVar(appEl) === "200px", "dragging far left stops at the minimum");
    pointer(handle, "pointermove", 999);
    assert(widthVar(appEl) === "600px", "dragging far right stops at the maximum");
    assert(!("sidebarWidth" in storage.data), "nothing is saved mid-drag");
    pointer(handle, "pointerup", 999);
    assert(!appEl.classList.contains("sidebar-resizing") && storage.data.sidebarWidth === "600", "letting go ends the drag and saves the width");
    pointer(handle, "pointermove", 100);
    assert(widthVar(appEl) === "600px", "moving after letting go does nothing");
    pointer(handle, "pointerdown", 10, { button: 2 });
    assert(!appEl.classList.contains("sidebar-resizing"), "only the primary button starts a drag (not right-click)");
    const dbl = new window.Event("dblclick", { bubbles: true });
    handle.dispatchEvent(dbl);
    assert(widthVar(appEl) === "", "double-click resets to the default");
  }

  // The window shrinking must not strand an oversized sidebar, and growing it again restores the pick.
  {
    let vw = 1400;
    const appEl = document.createElement("div");
    const handle = makeHandle();
    initSidebarResize({ appEl, handleEl: handle, storage: makeStorage(), viewportWidth: () => vw, isOverlay: () => false });
    key(handle, "End");
    assert(widthVar(appEl) === "600px", "set to 600px on a big window");
    vw = 800;
    window.dispatchEvent(new window.Event("resize"));
    assert(widthVar(appEl) === "440px", "a smaller window squeezes it so the content keeps room");
    vw = 1400;
    window.dispatchEvent(new window.Event("resize"));
    assert(widthVar(appEl) === "600px", "a bigger window brings back the width that was chosen");
  }
}

// ======================================================================
console.log("\nVerb flashcards: swipe on a touch screen");

{
  navigateTo(document, "verb-flashcards");
  await wait(30);
  const card = () => content.querySelector(".flashcard-interactive");
  const caption = () => [...content.querySelectorAll(".caption")].map((c) => c.textContent).find((t) => t.startsWith("Card ")) || "";

  // Fire a touch gesture on the card: down at x0, move to x1 (and y1), up.
  const touch = (el, [x0, y0], [x1, y1]) => {
    const fire = (type, x, y, list) => {
      const e = new window.Event(type, { bubbles: true, cancelable: true });
      const point = { clientX: x, clientY: y };
      Object.defineProperty(e, "touches", { value: list ? [point] : [] });
      Object.defineProperty(e, "changedTouches", { value: [point] });
      el.dispatchEvent(e);
    };
    fire("touchstart", x0, y0, true);
    fire("touchmove", (x0 + x1) / 2, (y0 + y1) / 2, true);
    fire("touchmove", x1, y1, true);
    fire("touchend", x1, y1, false);
  };
  const flip = () => click(card());

  assert(caption().startsWith("Card 1 of") && caption().includes("0 known · 0 to review"), "starts on the first card");

  touch(card(), [100, 100], [260, 100]);
  await wait(320);
  assert(caption().startsWith("Card 1 of"), "swiping a card that hasn't been flipped does nothing");

  flip();
  assert(!!content.querySelector(".flashcard-swipe-hint"), "once flipped, the card shows the swipe hint");

  touch(card(), [100, 100], [125, 100]);
  await wait(320);
  assert(caption().startsWith("Card 1 of"), "a short drag is not a swipe");

  touch(card(), [100, 100], [100, 260]);
  await wait(320);
  assert(caption().startsWith("Card 1 of"), "a vertical drag (scrolling) is not a swipe");

  touch(card(), [100, 100], [260, 100]);
  await wait(320);
  assert(caption().startsWith("Card 2 of") && caption().includes("1 known · 0 to review"), "swiping right marks 'I Know It' and moves on");

  assert(!content.querySelector(".flashcard-swipe-hint"), "the next card starts unflipped, without the hint");
  flip();
  touch(card(), [260, 100], [100, 100]);
  await wait(320);
  assert(caption().startsWith("Card 3 of") && caption().includes("1 known · 1 to review"), "swiping left marks 'Review Later' and moves on");

  flip();
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "I Know It"));
  assert(caption().startsWith("Card 4 of") && caption().includes("2 known · 1 to review"), "the 'I Know It' button still works");
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Review Later"));
  assert(caption().startsWith("Card 5 of") && caption().includes("2 known · 2 to review"), "the 'Review Later' button still works");
}

summary();
