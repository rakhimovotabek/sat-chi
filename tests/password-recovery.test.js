import test from "node:test";
import assert from "node:assert/strict";
import {
  passwordError,
  recoveryCallback,
  restoreRecovery,
} from "../src/auth/password-recovery.js";
test("password validation and recovery callbacks fail closed", async () => {
  assert.match(passwordError("short", "short"), /10/);
  assert.match(passwordError("long-enough-password", "mismatch"), /match/);
  assert.equal(
    passwordError("long-enough-password", "long-enough-password"),
    null,
  );
  assert.equal(
    recoveryCallback({ search: "?error=access_denied", hash: "" }).invalid,
    true,
  );
  const storage = new Map();
  storage.getItem = storage.get.bind(storage);
  storage.setItem = storage.set.bind(storage);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "one" } } }) },
  };
  await assert.rejects(restoreRecovery(client, {}, storage));
  storage.set(
    "satchi.password-recovery",
    JSON.stringify({ user: "other", expires: Date.now() + 10000 }),
  );
  await assert.rejects(restoreRecovery(client, {}, storage));
  storage.set(
    "satchi.password-recovery",
    JSON.stringify({ user: "one", expires: Date.now() - 1 }),
  );
  await assert.rejects(restoreRecovery(client, {}, storage));
});
