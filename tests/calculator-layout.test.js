import test from "node:test";
import assert from "node:assert/strict";
import {
  canDock,
  dockWidth,
  fitFloating,
  moveFloating,
  resizeFloating,
  readCalculatorLayout,
  writeCalculatorLayout,
} from "../src/features/player/calculator-layout.js";
test("docking reserves usable space for both calculator and question", () => {
  assert.equal(canDock(899, 1440), false);
  assert.equal(canDock(1000, 1440), true);
  assert.equal(canDock(1000, 700), false);
  assert.equal(dockWidth(1000, 0.01), 420);
  assert.equal(dockWidth(1000, 0.99), 548);
  assert.equal(dockWidth(1600, 0.99), 960);
});
test("floating movement, every corner and viewport changes keep the entire window reachable", () => {
  const view = { width: 1400, height: 900 },
    box = { x: 100, y: 100, width: 620, height: 560 };
  assert.deepEqual(moveFloating(box, -1000, -1000, view), {
    ...box,
    x: 8,
    y: 8,
  });
  assert.deepEqual(moveFloating(box, 3000, 3000, view), {
    ...box,
    x: 772,
    y: 332,
  });
  for (const corner of [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]) {
    const resized = resizeFloating(
      box,
      corner,
      corner.endsWith("left") ? -50 : 50,
      corner.startsWith("top") ? -50 : 50,
      view,
    );
    assert.equal(resized.width, 670);
    assert.equal(resized.height, 610);
    const limited = resizeFloating(box, corner, 3000, -3000, view);
    assert.ok(limited.width >= 420 && limited.height >= 360);
    assert.ok(limited.x >= 8 && limited.y >= 8);
    assert.ok(limited.x + limited.width <= 1392);
    assert.ok(limited.y + limited.height <= 892);
  }
  assert.deepEqual(fitFloating(box, { width: 390, height: 320 }), {
    width: 374,
    height: 304,
    x: 8,
    y: 8,
  });
});
test("calculator geometry persists per session with safe defaults for denied or malformed storage", () => {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const layout = {
    mode: "floating",
    ratio: 0.5,
    floating: { x: 150, y: 110, width: 500, height: 400 },
  };
  writeCalculatorLayout(storage, "one", layout);
  assert.deepEqual(readCalculatorLayout(storage, "one"), layout);
  assert.equal(readCalculatorLayout(storage, "two").mode, "docked");
  map.set("satchi:calculator:one", '{"mode":"floating","ratio":-10}');
  assert.equal(readCalculatorLayout(storage, "one").mode, "docked");
  assert.equal(
    readCalculatorLayout(
      {
        getItem() {
          throw Error("blocked");
        },
      },
      "one",
    ).mode,
    "docked",
  );
  assert.doesNotThrow(() =>
    writeCalculatorLayout(
      {
        setItem() {
          throw Error("blocked");
        },
      },
      "one",
      layout,
    ),
  );
});
