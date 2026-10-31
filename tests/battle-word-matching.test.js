import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other } from "./helpers/database.js";

test("matching rounds freeze distinct approved source pairs, grade private complete mappings and save exact history", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  await db.exec("reset role");
  const book = (
    await db.query(
      "insert into vocabulary_books(title,published)values('Original matching words',false)returning id",
    )
  ).rows[0].id;
  const sets = [];
  for (const title of ["Original set one", "Original set two"])
    sets.push(
      (
        await db.query(
          "insert into vocabulary_sets(book_id,title)values($1,$2)returning id",
          [book, title],
        )
      ).rows[0].id,
    );
  const pairs = [
    ["bright", "giving much light"],
    ["gentle", "using little force"],
    ["rapid", "moving very quickly"],
    ["scarce", "available in small amounts"],
    ["silent", "making no sound"],
    ["roomy", "having plenty of space"],
    ["steady", "remaining even and consistent"],
    ["brief", "lasting a short time"],
  ];
  for (const [index, [word, definition]] of pairs.entries())
    await db.query(
      "insert into vocabulary_words(set_id,word,definition)values($1,$2,$3)",
      [sets[index < 4 ? 0 : 1], word, definition],
    );
  await db.query("update vocabulary_books set published=true where id=$1", [
    book,
  ]);
  const action = (action, data) =>
    call("battle_action", [action, JSON.stringify(data)], ["text", "jsonb"]);
  await role(student);
  await assert.rejects(
    () =>
      action("create", {
        category: "Vocabulary",
        capacity: 2,
        questionCount: 2,
        seconds: 60,
        filters: { book, sets: [sets[0]], mode: "word-matching" },
      }),
    /Only 1 eligible vocabulary/,
  );
  await assert.rejects(
    () =>
      call(
        "battle_matching_rounds",
        [JSON.stringify({ book, mode: "word-matching" }), 1],
        ["jsonb", "integer"],
      ),
    /permission denied/,
  );
  let room = await action("create", {
    category: "Vocabulary",
    capacity: 2,
    questionCount: 2,
    seconds: 60,
    filters: { book, sets, mode: "word-matching" },
  });
  const id = room.id;
  await action("ready", { id });
  await role(other);
  await action("join", { code: room.code });
  await action("ready", { id });
  await role(student);
  await action("start", { id });
  await db.exec(
    `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  const sourceIds = new Set();
  for (let round = 1; round <= 2; round++) {
    await role(student);
    room = await action("state", { id });
    assert.equal(room.state, "PLAYING");
    assert.equal(room.question.question_type, "vocabulary-matching");
    assert.equal(room.question.matching_definitions.length, 4);
    assert.equal(new Set(room.question.matching_definitions).size, 4);
    assert.equal(room.question.accepted_answers, undefined);
    assert.equal(room.review, null);
    for (const word of room.question.matching_words) {
      assert.equal(word.definition, undefined);
      sourceIds.add(word.id);
    }
    for (const response of [
      "[0,0,1,2]",
      "[0,1,2]",
      '["0","1","2","3"]',
      "{}",
      "null",
      "not JSON",
    ])
      await assert.rejects(() => action("answer", { id, round, response }));
    await db.exec("reset role");
    const key = (
      await db.query(
        "select accepted_answers from battle_rounds where battle_id=$1 and round=$2",
        [id, round],
      )
    ).rows[0].accepted_answers;
    assert.equal(new Set(key).size, 4);
    await role(student);
    await action("answer", { id, round, response: JSON.stringify(key) });
    await role(other);
    const hidden = await action("state", { id });
    assert.equal(hidden.review, null);
    assert.equal(
      hidden.members.find((member) => member.user_id === student).score,
      (round - 1) * 100,
    );
    const wrong = [...key];
    [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
    room = await action("answer", {
      id,
      round,
      response: JSON.stringify(round === 1 ? wrong : key),
    });
    assert.equal(room.state, "ROUND_RESULTS");
    assert.deepEqual(room.review.acceptedAnswers, key);
    await db.exec(
      `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
    );
    await role(student);
    room = await action("state", { id });
  }
  assert.equal(
    sourceIds.size,
    8,
    "no source word repeats across matching rounds",
  );
  assert.equal(room.state, "FINISHED");
  assert.equal(room.history.length, 2);
  assert.equal(
    room.members.find((member) => member.user_id === student).score,
    200,
  );
  assert.equal(
    room.members.find((member) => member.user_id === other).score,
    100,
  );
  const frozenHistory = structuredClone(room.history);
  await db.exec("reset role");
  await db.query("update vocabulary_words set definition='Changed after the saved match'where id=$1", [[...sourceIds][0]]);
  await role(student);
  assert.deepEqual((await action("state", { id })).history, frozenHistory);
});
