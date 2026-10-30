import test from "node:test";
import assert from "node:assert/strict";
import { createImportHandler } from "../supabase/functions/import-book/handler.js";
import { assertIsolatedTarget } from "../scripts/testing/isolated-target.js";
import { learningDatabase, admin, other } from "./helpers/database.js";

function transport(profile, owner = "admin") {
  let writes = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) },
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        async single() {
          return {
            data:
              table === "profiles"
                ? profile
                : { id: "job", created_by: owner, status: "draft" },
          };
        },
      };
      return query;
    },
    rpc() {
      writes++;
      throw new Error("Unexpected write");
    },
    storage: {
      from() {
        writes++;
        throw new Error("Unexpected storage access");
      },
    },
  };
  return {
    handler: createImportHandler({
      createClient: () => client,
      env: () => "unused",
    }),
    writes: () => writes,
  };
}
function request(token = "Bearer test") {
  return new Request("http://127.0.0.1:54321/functions/v1/import-book", {
    method: "POST",
    headers: token
      ? { Authorization: token, "Content-Type": "application/json" }
      : {},
    body: JSON.stringify({ jobId: "job" }),
  });
}
test("write preflight rejects hosted targets, credential URLs and missing local ports", () => {
  for (const target of [
    undefined,
    "https://example.supabase.co",
    "http://localhost",
    "http://admin:secret@localhost:54321",
    "http://localhost:54321/?token=x",
    "http://localhost.evil.test:54321",
  ]) {
    assert.throws(() => assertIsolatedTarget(target));
  }
  assert.equal(
    assertIsolatedTarget("http://127.0.0.1:54321"),
    "http://127.0.0.1:54321",
  );
});
test("Edge handler rejects missing tokens, students, inactive admins and foreign jobs before writes", async () => {
  for (const [profile, owner, token, status] of [
    [{ role: "admin", active: true }, "admin", null, 401],
    [{ role: "student", active: true }, "admin", "Bearer test", 403],
    [{ role: "admin", active: false }, "admin", "Bearer test", 403],
    [{ role: "admin", active: true }, "another-admin", "Bearer test", 403],
    [{ role: "admin", active: true }, "admin", "Bearer test", 200],
  ]) {
    const { handler, writes } = transport(profile, owner);
    const response = await handler(request(token));
    assert.equal(response.status, status);
    assert.equal(writes(), 0);
  }
});
test("database begin prevents inactive actors and cross-admin fingerprint takeover", async (t) => {
  const { db, call } = await learningDatabase();
  t.after(() => db.close());
  await db.exec("reset role");
  await db.query("update profiles set role='admin' where id=$1", [other]);
  const manifest = {
    format: "satchi-book-v1",
    book: {
      id: "ownership-fixture",
      title: "Ownership fixture",
      section: "Math",
    },
    rights: { authorized: true },
    topics: [{ id: "one", title: "One" }],
    questionCount: 1,
  };
  const begin = (actor, fingerprint = "c".repeat(64)) =>
    call(
      "universal_begin",
      [fingerprint, JSON.stringify(manifest), actor],
      ["text", "jsonb", "uuid"],
    );
  const id = await begin(admin);
  assert.equal(await begin(admin), id);
  await assert.rejects(() => begin(other), /belongs to another/);
  await db.query("update profiles set active=false where id=$1", [other]);
  await assert.rejects(
    () => begin(other, "d".repeat(64)),
    /Active admin required/,
  );
  await db.exec("set role service_role");
  await assert.rejects(
    () =>
      call(
        "universal_begin_before_ownership",
        ["c".repeat(64), JSON.stringify(manifest), other],
        ["text", "jsonb", "uuid"],
      ),
    /permission denied/,
  );
});
