// Timed legacy fixtures retain scoring_version=1; battles-competition covers new v2 rooms.
import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other, admin } from "./helpers/database.js";

test("host lobby changes preserve balance, reset readiness and enforce removals without changing saved games", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const fourth = "f1000000-0000-0000-0000-000000000004",
    fifth = "f1000000-0000-0000-0000-000000000005";
  await db.exec(
    `reset role;insert into auth.users(id)values('${fourth}'),('${fifth}')`,
  );
  const action = (action, data) =>
    call("battle_action", [action, JSON.stringify(data)], ["text", "jsonb"]);
  const control = (action, data) =>
    call(
      "battle_lobby_control",
      [action, JSON.stringify(data)],
      ["text", "jsonb"],
    );
  await role(student);
  let room = await action("create", {
    category: "Math",
    capacity: 4,
    teamSize: 2,
    questionCount: 2,
    seconds: 60,
    public: false,
  });
  const id = room.id,
    code = room.code;
  for (const user of [other, admin, fourth]) {
    await role(user);
    await action("join", { code });
    await action("ready", { id });
  }
  await assert.rejects(
    () => control("kick", { id, userId: student }),
    /Only the host/,
  );
  await role(student);
  await action("ready", { id });
  room = await control("swap", { id, first: student, second: other });
  assert.equal(
    room.members.find((member) => member.user_id === student).team,
    2,
  );
  assert.equal(room.members.find((member) => member.user_id === other).team, 1);
  assert.ok(room.members.every((member) => !member.ready));
  await assert.rejects(
    () => control("swap", { id, first: student, second: fourth }),
    /different teams/,
  );
  room = await control("settings", {
    id,
    questionCount: 3,
    seconds: 30,
    public: true,
  });
  assert.equal(room.question_count, 3);
  assert.equal(room.seconds, 30);
  assert.equal(room.public, true);
  await assert.rejects(
    () => control("settings", { id, questionCount: 13 }),
    /Only 12 eligible/,
  );
  assert.equal((await action("state", { id })).question_count, 3);
  await assert.rejects(
    () => control("settings", { id, category: "Vocabulary" }),
    /Unsupported/,
  );
  await assert.rejects(
    () => control("kick", { id, userId: student }),
    /another lobby member/,
  );
  room = await control("kick", { id, userId: other });
  assert.equal(room.members.length, 3);
  await role(other);
  await assert.rejects(() => action("join", { code }), /host removed/);
  await assert.rejects(
    () => db.query("select * from battle_exclusions"),
    /permission denied/,
  );
  await role(fifth);
  room = await action("join", { code });
  assert.equal(
    room.members.find((member) => member.user_id === fifth).team,
    1,
    "new players fill the smaller team after a custom swap and kick",
  );
  for (const user of [student, admin, fourth, fifth]) {
    await role(user);
    await action("ready", { id });
  }
  await role(student);
  room = await action("start", { id });
  assert.equal(room.state, "COUNTDOWN");
  await assert.rejects(
    () => control("settings", { id, seconds: 60 }),
    /Lobby is closed/,
  );
  await db.exec(
    `reset role;update battles set scoring_version=1,deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(student);
  await action("state", { id });
  for (let round = 1; round <= 3; round++) {
    for (const user of [student, admin, fourth, fifth]) {
      await role(user);
      await action("answer", { id, round, response: "1" });
    }
    await db.exec(
      `reset role;update battles set scoring_version=1,deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
    );
    await role(student);
    room = await action("state", { id });
  }
  assert.equal(room.state, "FINISHED");
  assert.equal(room.history.length, 3);
  assert.ok(room.members.every((member) => member.score === 300));
  const score = room.members.reduce((total, member) => total + member.score, 0);
  await assert.rejects(
    () => control("swap", { id, first: student, second: admin }),
    /Lobby is closed/,
  );
  assert.equal(
    (await action("state", { id })).members.reduce(
      (total, member) => total + member.score,
      0,
    ),
    score,
  );
});

test("presence-only heartbeats leave the Realtime revision unchanged", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const room = await call(
    "battle_action",
    [
      "create",
      JSON.stringify({
        category: "Math",
        capacity: 2,
        questionCount: 1,
        seconds: 30,
      }),
    ],
    ["text", "jsonb"],
  );
  await db.exec("reset role");
  const revision = async () =>
    (
      await db.query("select revision from battle_signals where battle_id=$1", [
        room.id,
      ])
    ).rows[0].revision;
  const initial = await revision();
  await db.query(
    "update battle_members set last_seen=clock_timestamp()-interval '30 seconds'where battle_id=$1",
    [room.id],
  );
  assert.equal(await revision(), initial);
  await role(student);
  await call(
    "battle_action",
    ["state", JSON.stringify({ id: room.id })],
    ["text", "jsonb"],
  );
  await db.exec("reset role");
  assert.equal(await revision(), initial);
  await role(student);
  await call(
    "battle_action",
    ["ready", JSON.stringify({ id: room.id })],
    ["text", "jsonb"],
  );
  await db.exec("reset role");
  assert.ok((await revision()) > initial);
});
