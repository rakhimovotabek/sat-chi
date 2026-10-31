import test from "node:test";
import assert from "node:assert/strict";
import { readTheme, applyTheme, themeKey } from "../src/lib/theme.js";

test("theme preference follows the operating system only when selected and survives restricted storage", () => {
  let saved;
  const root = { dataset: {} };
  const storage = {
    getItem: () => saved,
    setItem: (key, value) => {
      assert.equal(key, themeKey);
      saved = value;
    },
  };
  assert.equal(readTheme(storage), "light");
  applyTheme("dark", root, storage, false);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(readTheme(storage), "dark");
  applyTheme("system", root, storage, true);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(readTheme(storage), "system");
  applyTheme("system", root, storage, false);
  assert.equal(root.dataset.theme, "light");
  const denied = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("denied");
    },
  };
  assert.equal(readTheme(denied), "light");
  assert.doesNotThrow(() => applyTheme("dark", root, denied));
  assert.equal(root.dataset.theme, "dark");
  applyTheme("invalid", root, storage, true);
  assert.equal(root.dataset.theme, "light");
});
