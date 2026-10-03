import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { emailConfirmationNotice } from "../src/auth/email-confirmation.js";

test("signup uses the browser origin and login path in both environments", () => {
  const source = readFileSync(new URL("../src/pages/auth/Signup.jsx", import.meta.url), "utf8");
  const expression = source.match(/emailRedirectTo:\s*(`[^`]+`)/)?.[1];
  assert.ok(expression, "signup must explicitly set emailRedirectTo");
  const resolve = new Function("window", `return ${expression}`);
  for (const origin of ["https://sat-chi.netlify.app", "http://localhost:5173"])
    assert.equal(resolve({ location: { origin } }), `${origin}/login`);
});

test("confirmation notices distinguish successful redirects and expired links", () => {
  assert.equal(emailConfirmationNotice("?code=confirmation-code", ""), "success");
  assert.equal(emailConfirmationNotice("", "#type=signup&access_token=example"), "success");
  assert.equal(emailConfirmationNotice("?code=code&error=denied", ""), "error");
  assert.equal(emailConfirmationNotice("", "#error_code=otp_expired"), "error");
  assert.equal(emailConfirmationNotice("", ""), null);
  assert.equal(emailConfirmationNotice("?code=", "#type=recovery"), null);
});

test("tracked application and configuration contain no obsolete development origin", () => {
  const obsolete = ["localhost", "3000"].join(":");
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0").filter(Boolean);
  for (const file of files.filter((f) => /\.(jsx?|json|md|toml|html|ya?ml)$/.test(f)))
    assert.ok(!readFileSync(file, "utf8").includes(obsolete), file);
});
