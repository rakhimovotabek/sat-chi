import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { redactedServiceLog } from "./helpers/service-log.js";

test("service logs redact split JWTs, generated secrets and fixture passwords before persistence", async () => {
  const secret = "generated-local-secret";
  const input = Readable.from([
    "GET /asset?token=eyJheader.eyJ",
    "claims.signature\nkey=generated-",
    "local-secret\npassword=disposable-test-only",
  ]);
  let output = "";
  for await (const chunk of input.pipe(redactedServiceLog(secret)))
    output += chunk;
  assert.equal(
    output,
    "GET /asset?token=[redacted JWT]\nkey=[redacted]\npassword=[redacted]",
  );
});
