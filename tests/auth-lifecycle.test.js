import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as tick } from "node:timers/promises";
import { createAuthLifecycle } from "../src/auth/auth-lifecycle.js";

const session = (id = "student", token = "initial") => ({
  user: { id },
  access_token: token,
});
const profile = (id = "student", changes = {}) => ({
  id,
  role: "student",
  active: true,
  ...changes,
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(initialSession = session()) {
  const listeners = new Set(),
    states = [],
    reads = [];
  let unsubscribes = 0;
  let query = async (id) => ({ data: profile(id), error: null });
  let restore = async () => ({
    data: { session: initialSession },
    error: null,
  });
  const client = {
    auth: {
      onAuthStateChange(callback) {
        listeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                unsubscribes++;
                listeners.delete(callback);
              },
            },
          },
        };
      },
      getSession: () => restore(),
    },
    from(table) {
      assert.equal(table, "profiles");
      return {
        select: () => ({
          eq: (_column, id) => ({
            maybeSingle: () => {
              reads.push(id);
              return query(id);
            },
          }),
        }),
      };
    },
  };
  return {
    client,
    states,
    reads,
    listeners,
    get unsubscribes() {
      return unsubscribes;
    },
    setQuery(fn) {
      query = fn;
    },
    setRestore(fn) {
      restore = fn;
    },
    emit(event, value) {
      for (const listener of listeners) listener(event, value);
    },
    start() {
      return createAuthLifecycle(client, (state) => states.push(state));
    },
    state() {
      return states.at(-1);
    },
  };
}

test("same-user confirmations and token refresh preserve the profile without new queries or loading", async () => {
  const f = fixture(),
    controller = f.start();
  await tick(15);
  assert.equal(f.state().profile.id, "student");
  const before = f.states.length,
    savedProfile = f.state().profile;
  for (const event of [
    "SIGNED_IN",
    "INITIAL_SESSION",
    "TOKEN_REFRESHED",
    "USER_UPDATED",
    "SIGNED_IN",
  ])
    f.emit(event, session("student", event));
  assert.equal(f.state().session.access_token, "SIGNED_IN");
  assert.equal(f.state().profile, savedProfile);
  assert.ok(
    f.states
      .slice(before)
      .every((s) => !s.loading && s.profile === savedProfile),
  );
  assert.deepEqual(f.reads, ["student"]);
  controller.dispose();
});

test("refresh during the first profile query neither duplicates it nor restores the old token", async () => {
  const f = fixture(),
    pending = deferred();
  f.setQuery(() => pending.promise);
  const controller = f.start();
  await tick(15);
  f.emit("SIGNED_IN", session());
  f.emit("TOKEN_REFRESHED", session("student", "new-token"));
  pending.resolve({ data: profile(), error: null });
  await tick();
  assert.deepEqual(f.reads, ["student"]);
  assert.equal(f.state().session.access_token, "new-token");
  assert.equal(f.state().loading, false);
  controller.dispose();
});

test("logout cancels in-flight profiles and repeated confirmations cannot resurrect them", async () => {
  const f = fixture(),
    pending = deferred();
  f.setQuery(() => pending.promise);
  const controller = f.start();
  await tick(15);
  f.emit("SIGNED_OUT", null);
  pending.resolve({ data: profile(), error: null });
  await tick();
  assert.equal(f.state().session, null);
  assert.equal(f.state().profile, null);
  assert.equal(f.state().loading, false);
  controller.dispose();
});

test("switching accounts loads a new profile and ignores the previous account's delayed response", async () => {
  const f = fixture(),
    pending = deferred();
  f.setQuery((id) =>
    id === "student"
      ? pending.promise
      : Promise.resolve({ data: profile(id, { role: "admin" }), error: null }),
  );
  const controller = f.start();
  await tick(15);
  f.emit("SIGNED_IN", session("owner"));
  assert.equal(f.state().loading, true);
  assert.equal(f.state().profile, null);
  await tick(15);
  pending.resolve({ data: profile(), error: null });
  await tick();
  assert.equal(f.state().profile.id, "owner");
  assert.equal(f.state().profile.role, "admin");
  controller.dispose();
});

test("explicit profile refresh supports onboarding and still rejects inactive accounts", async () => {
  const f = fixture(),
    controller = f.start();
  await tick(15);
  f.setQuery(async () => ({
    data: profile("student", { onboarding_completed: true }),
    error: null,
  }));
  await controller.refreshProfile();
  assert.equal(f.state().profile.onboarding_completed, true);
  f.setQuery(async () => ({
    data: profile("student", { active: false }),
    error: null,
  }));
  await assert.rejects(controller.refreshProfile(), /inactive/);
  assert.equal(f.state().profile, null);
  assert.equal(f.state().loading, false);
  controller.dispose();
});

test("missing/unsupported profiles and failed profile queries fail closed", async () => {
  for (const result of [
    { data: null, error: null },
    { data: profile("student", { role: "owner" }), error: null },
    { data: null, error: new Error("network") },
  ]) {
    const f = fixture();
    f.setQuery(async () => result);
    const controller = f.start();
    await tick(15);
    assert.equal(f.state().profile, null);
    assert.ok(f.state().error);
    assert.equal(f.state().loading, false);
    f.emit("SIGNED_IN", session());
    await tick();
    assert.equal(f.reads.length, 1);
    assert.equal(f.state().profile, null);
    controller.dispose();
  }
});

test("initial restore cannot overwrite a newer sign-in or sign-out", async () => {
  const f = fixture(),
    pending = deferred();
  f.setRestore(() => pending.promise);
  const controller = f.start();
  f.emit("SIGNED_IN", session());
  await tick(15);
  f.emit("SIGNED_OUT", null);
  pending.resolve({ data: { session: session("old-user") }, error: null });
  await tick();
  assert.equal(f.state().session, null);
  controller.dispose();
});

test("invalid session restoration fails safely", async () => {
  const f = fixture();
  f.setRestore(async () => ({
    data: { session: null },
    error: new Error("expired refresh token"),
  }));
  const controller = f.start();
  await tick();
  assert.equal(f.state().session, null);
  assert.equal(f.state().profile, null);
  assert.equal(f.state().loading, false);
  assert.match(f.state().error, /sign in again/);
  controller.dispose();
});

test("cleanup unsubscribes and ignores queued work across StrictMode mount/cleanup/remount", async () => {
  const f = fixture();
  const first = f.start();
  first.dispose();
  const count = f.states.length;
  await tick(15);
  assert.equal(f.states.length, count);
  assert.equal(f.listeners.size, 0);
  const second = f.start();
  await tick(15);
  assert.equal(f.listeners.size, 1);
  assert.deepEqual(f.reads, ["student"]);
  second.dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.unsubscribes, 2);
});
