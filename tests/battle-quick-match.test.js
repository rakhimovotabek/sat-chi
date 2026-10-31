import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other, admin } from "./helpers/database.js";

test("Quick Match reuses compatible public 1v1s, normalizes filters and protects private/kicked/settings boundaries", async (t) => {
  const { db, role, call, book } = await learningDatabase();
  t.after(() => db.close());
  const fourth = "f1000000-0000-0000-0000-000000000004";
  await db.exec(`reset role;insert into auth.users(id)values('${fourth}')`);
  const action = (action, data) =>
    call("battle_action", [action, JSON.stringify(data)], ["text", "jsonb"]);
  const quick = (data) =>
    call("battle_quick_match", [JSON.stringify(data)], ["jsonb"]);
  const settings = {
    category: "Math",
    questionCount: 1,
    seconds: 60,
    filters: { book, domains: ["Algebra", "Algebra"], skill: "", skills: [] },
  };
  await role(student);
  const privateRoom = await action("create", {
    ...settings,
    capacity: 2,
    public: false,
  });
  const first = await quick(settings);
  assert.notEqual(first.id, privateRoom.id);
  assert.equal(first.public, true);
  assert.equal(first.capacity, 2);
  assert.equal((await quick(settings)).id, first.id);
  await role(other);
  const joined = await quick({
    ...settings,
    filters: { domains: ["Algebra"], book },
  });
  assert.equal(joined.id, first.id);
  assert.equal(joined.members.length, 2);
  assert.equal((await quick(settings)).members.length, 2);
  await role(admin);
  const second = await quick(settings);
  assert.notEqual(second.id, first.id);
  await role(fourth);
  const secondJoined = await quick(settings);
  assert.equal(secondJoined.id, second.id);
  await role(admin);
  await call(
    "battle_lobby_control",
    ["kick", JSON.stringify({ id: second.id, userId: fourth })],
    ["text", "jsonb"],
  );
  await role(fourth);
  const afterKick = await quick(settings);
  assert.notEqual(afterKick.id, second.id);
  assert.equal(afterKick.members.length, 1);
  await role(student);
  const changedTimer = await quick({ ...settings, totalSeconds: 120 });
  assert.notEqual(changedTimer.id, first.id);
  assert.equal(changedTimer.total_seconds, 120);
  await assert.rejects(
    () => quick({ ...settings, capacity: 4, teamSize: 2 }),
    /supports 1 vs 1/,
  );
  await assert.rejects(
    () => quick({ ...settings, questionCount: 50 }),
    /Only 12 eligible/,
  );
  await assert.rejects(
    () => quick({ ...settings, filters: [] }),
    /Invalid Quick Match filters/,
  );
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*) n from battle_members where battle_id=$1",
        [first.id],
      )
    ).rows[0].n,
    2,
  );
});
