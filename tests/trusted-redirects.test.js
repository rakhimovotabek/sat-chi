import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTION_ORIGINS,
  trustedAuthRedirect,
} from "../src/auth/trusted-redirects.js";

test("every verified deployment returns each auth flow to its originating host", () => {
  for (const origin of PRODUCTION_ORIGINS) {
    assert.equal(
      trustedAuthRedirect("google", origin),
      `${origin}/auth/callback`,
    );
    assert.equal(
      trustedAuthRedirect("recovery", origin),
      `${origin}/reset-password`,
    );
    assert.equal(
      trustedAuthRedirect("confirmation", origin),
      `${origin}/login`,
    );
  }
});

test("redirects reject arbitrary destinations, lookalike hosts and insecure production origins", () => {
  for (const origin of [
    "https://attacker.example",
    "https://satchi.vercel.app.attacker.example",
    "https://satchi.vercel.app/path",
    "https://satchi.vercel.app?redirect_to=https://attacker.example",
    "https://user:password@satchi.vercel.app",
    "http://satchi.vercel.app",
    "//satchi.vercel.app",
    "https://satchi.vercel.app/",
    "javascript:alert(1)",
    "http://localhost:5173",
    "https://unreviewed-preview.vercel.app",
  ])
    assert.throws(() => trustedAuthRedirect("google", origin));
  assert.throws(() =>
    trustedAuthRedirect("https://attacker.example", PRODUCTION_ORIGINS[0]),
  );
});

test("loopback origins are available only to development builds", () => {
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5199",
    "http://127.0.0.1:41235",
  ])
    assert.equal(
      trustedAuthRedirect("google", origin, { development: true }),
      `${origin}/auth/callback`,
    );
  for (const origin of [
    "http://localhost.attacker.example:5173",
    "http://192.168.1.20:5173",
    "https://attacker.example",
  ])
    assert.throws(() =>
      trustedAuthRedirect("google", origin, { development: true }),
    );
});
