import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other } from "./helpers/database.js";
test("Battle 2 scoring, private identities and persisted competitive standings", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const action = (a, d = {}) =>
    call("battle_action", [a, JSON.stringify(d)], ["text", "jsonb"]);
  await db.exec(
    `reset role;update profiles set display_name='Alex' where id='${student}';update profiles set display_name='Franz' where id='${other}';`,
  );
  const score = async (correct, seconds, remaining) =>
    (
      await db.query(
        `select public.battle_points($1,$2,'2026-11-01T00:01:00Z'::timestamptz,'2026-11-01T00:01:00Z'::timestamptz-make_interval(secs=>$3))n`,
        [correct, seconds, remaining],
      )
    ).rows[0].n;
  assert.equal(await score(true, 60, 60), 150);
  assert.equal(await score(true, 60, 30), 125);
  assert.equal(await score(true, 60, 0), 100);
  assert.equal(await score(true, 60, -5), 100);
  assert.equal(await score(true, 0, 30), 100);
  assert.equal(await score(false, 60, 60), 0);
  await role(student);
  await assert.rejects(
    () =>
      call(
        "battle_points",
        [true, 60, null, null],
        ["boolean", "integer", "timestamptz", "timestamptz"],
      ),
    /permission denied/,
  );
  let room = await action("create", {
    category: "Math",
    capacity: 2,
    teamSize: 0,
    questionCount: 1,
    seconds: 60,
  });
  const id = room.id;
  assert.equal(room.scoring_version, 2);
  assert.equal(room.members[0].display_name, "Alex");
  assert.ok(!JSON.stringify(room).includes("@"));
  await role(other);
  room = await action("join", { code: room.code });
  assert.deepEqual(
    new Set(room.members.map((m) => m.display_name)),
    new Set(["Alex", "Franz"]),
  );
  await action("ready", { id });
  await role(student);
  await action("ready", { id });
  await action("start", { id });
  await db.exec(
    `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(student);
  await action("state", { id });
  let answer = await action("answer", { id, round: 1, response: "1" });
  assert.equal(answer.review, null);
  assert.ok(answer.members.every((m) => m.score === 0));
  await db.exec(
    `reset role;update battles set deadline=clock_timestamp()+interval '15 seconds'where id='${id}'`,
  );
  await role(other);
  answer = await action("answer", { id, round: 1, response: "1" });
  assert.equal(answer.state, "ROUND_RESULTS");
  const fast = answer.members.find((m) => m.user_id === student).score,
    slow = answer.members.find((m) => m.user_id === other).score;
  assert.ok(fast >= 148 && fast <= 150, JSON.stringify({ fast, slow, answer }));
  assert.ok(slow >= 110 && slow <= 112);
  assert.ok(fast > slow);
  assert.equal(answer.review.points, slow);
  answer = await action("answer", { id, round: 1, response: "0" });
  assert.equal(answer.members.find((m) => m.user_id === other).score, slow);
  await db.exec(
    `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(student);
  answer = await action("state", { id });
  assert.equal(answer.state, "FINISHED");
  let board = await call("battle_leaderboard", ["all"], ["text"]);
  assert.equal(board.rows.length, 2);
  assert.equal(board.rows[0].user_id, student);
  assert.equal(board.rows[0].wins, 1);
  assert.equal(board.rows[1].losses, 1);
  assert.equal(board.rows[0].points, fast);
  await action("join", { code: answer.code });
  assert.equal(
    (await call("battle_leaderboard", ["week"], ["text"])).rows[0].points,
    fast,
  );
  await assert.rejects(
    () => call("battle_leaderboard", ["invalid"], ["text"]),
    /Invalid/,
  );
  await db.exec(
    `reset role;update profiles set display_name='private@example.com',username=null where id='${other}'`,
  );
  await role(student);
  board = await call("battle_leaderboard", ["month"], ["text"]);
  assert.ok(!JSON.stringify(board).includes("@"));
  assert.match(board.rows[1].display_name, /^Player /);
  await db.exec(
    `reset role;update battles set state='CANCELLED'where id='${id}'`,
  );
  await role(student);
  assert.equal(
    (await call("battle_leaderboard", ["all"], ["text"])).rows.length,
    0,
  );
  await db.exec(`reset role;set role anon;`);
  await assert.rejects(
    () => call("battle_leaderboard", ["all"], ["text"]),
    /permission denied/,
  );
});

test("untimed team standings use team totals, ties remain draws and abandoned games do not rank", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const extra = "f1000000-0000-0000-0000-000000000004",
    fourth = "f1000000-0000-0000-0000-000000000005";
  await db.exec(
    `reset role;insert into auth.users(id)values('${extra}'),('${fourth}');`,
  );
  const action = (a, d = {}) =>
    call("battle_action", [a, JSON.stringify(d)], ["text", "jsonb"]);
  const play = async (teamSize, responses) => {
    await role(student);
    let room = await action("create", {
      category: "Math",
      capacity: responses.length,
      teamSize,
      questionCount: 1,
      seconds: 0,
    });
    const id = room.id;
    for (const [user] of responses) {
      await role(user);
      if (user !== student) await action("join", { code: room.code });
      await action("ready", { id });
    }
    await role(student);
    await action("start", { id });
    await db.exec(
      `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
    );
    await role(student);
    await action("state", { id });
    for (const [user, response] of responses) {
      await role(user);
      await action("answer", { id, round: 1, response });
    }
    await db.exec(
      `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
    );
    await role(student);
    room = await action("state", { id });
    return room;
  };
  let room = await play(0, [
    [student, "1"],
    [other, "1"],
  ]);
  assert.equal(room.state, "FINISHED");
  assert.ok(
    room.members.every(
      (m) => m.score === 100 && m.speed_bonus === 0 && m.correct === 1,
    ),
  );
  let board = await call("battle_leaderboard", ["all"], ["text"]);
  assert.ok(
    board.rows.every((r) => r.wins === 0 && r.draws === 1 && r.rank === 1),
  );
  await db.exec(
    `reset role;update battles set state='CANCELLED'where id='${room.id}'`,
  );
  room = await play(2, [
    [student, "1"],
    [other, "0"],
    [extra, "1"],
    [fourth, "1"],
  ]);
  board = await call("battle_leaderboard", ["all"], ["text"]);
  assert.equal(board.rows.find((r) => r.user_id === student).wins, 1);
  assert.equal(board.rows.find((r) => r.user_id === extra).wins, 1);
  assert.equal(board.rows.find((r) => r.user_id === fourth).losses, 1);
  await db.exec(
    `reset role;delete from battle_answers where battle_id='${room.id}'and user_id='${fourth}'`,
  );
  await role(student);
  assert.equal(
    (await call("battle_leaderboard", ["all"], ["text"])).rows.length,
    0,
  );
});
