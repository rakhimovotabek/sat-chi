import test from "node:test";
import assert from "node:assert/strict";
import { backendError, isConnectionError } from "../src/lib/backend-error.js";
test("schema, permission and query timeout failures never masquerade as disconnects", () => {
  for (const [code, kind] of [
    ["PGRST202", "schema"],
    ["PGRST203", "schema"],
    ["42501", "permission"],
    ["57014", "timeout"],
  ]) {
    const error = backendError(
      { code, message: "Original server error" },
      "Books",
    );
    assert.equal(error.kind, kind);
    assert.equal(error.code, code);
    assert.equal(isConnectionError(error), false);
    if (kind === "schema")
      assert.match(error.message, /Books requires a database update/);
  }
  assert.equal(
    isConnectionError(backendError({ message: "TypeError: Failed to fetch" })),
    true,
  );
  assert.equal(isConnectionError(backendError({ code: "PGRST003" })), true);
  assert.equal(
    backendError({ code: "P0001", message: "Choose a published book" }).message,
    "Choose a published book",
  );
});
