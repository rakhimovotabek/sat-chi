import test from "node:test";
import assert from "node:assert/strict";
import {
  numericResponseError,
  normalizeNumericResponse,
} from "../src/features/player/numeric-response.js";
import { learningDatabase, admin, student } from "./helpers/database.js";
test("SAT numeric syntax accepts equivalent representations and only leading Unicode minus signs", () => {
  for (const v of [
    "0",
    "-1",
    "12345",
    "-12345",
    ".5",
    "-.5",
    "1/2",
    "-1/2",
    "−1/2",
    "–.25",
    "—2",
    "\u00a0−2\u00a0",
  ])
    assert.equal(numericResponseError(v), "", v);
  for (const v of [
    "123456",
    "-123456",
    "NaN",
    "Infinity",
    "1e2",
    "+1",
    "1 2",
    "1\u00a02",
    "2−1",
    "1/0",
    "1/00",
    "1//2",
    "1/-2",
    "2+2",
    "1.2.3",
    "eval(1)",
    "",
  ])
    assert.ok(numericResponseError(v), v);
  assert.equal(normalizeNumericResponse(" −1 "), "-1");
  assert.equal(normalizeNumericResponse("1−2"), "1−2");
});
test("database grades equivalent fractions, decimals and Unicode minus and preserves first wrong checks", async (t) => {
  const { db, role, call, book } = await learningDatabase();
  t.after(() => db.close());
  await db.exec("reset role");
  const topic = (
    await db.query("select id from book_topics where book_id=$1 limit 1", [
      book,
    ])
  ).rows[0].id;
  const q = (
    await db.query(
      `insert into questions(topic_id,question_text,options,question_type,import_metadata)values($1,'Original numeric fixture','[]','open','{}')returning id`,
      [topic],
    )
  ).rows[0].id;
  await db.query("insert into question_answers values($1,null,$2)", [
    q,
    "One negative half.",
  ]);
  await db.query(
    `insert into book_open_answers(question_id,accepted_answers,correct_answer,answer_format)values($1,'["-0.5","-1/2"]','-0.5','numeric')`,
    [q],
  );
  const sid = crypto.randomUUID(),
    iid = crypto.randomUUID();
  await db.query(
    `insert into book_practice_sessions(id,student_id,title,kind)values($1,$2,'Numeric fixture','book')`,
    [sid, student],
  );
  await db.query(
    `insert into book_practice_items(id,session_id,position,question)values($1,$2,0,jsonb_build_object('id',$3::text,'question_type','open'))`,
    [iid, sid, q],
  );
  await db.query(
    `insert into book_practice_keys values($1,null,'One negative half.')`,
    [iid],
  );
  await db.query(
    `insert into book_practice_open_keys(item_id,accepted_answers)values($1,'["-0.5","-1/2"]')`,
    [iid],
  );
  const grade = async (v) =>
    (await db.query("select package_open_response_correct($1,$2) ok", [iid, v]))
      .rows[0].ok;
  for (const v of ["-1/2", "-.5", "-0.500", "−.5", "–.5", "—.5"])
    assert.equal(await grade(v), true, v);
  for (const v of ["-0.5000", "-1 /2", "1e2", "1/0", "wrong"])
    assert.equal(await grade(v), false, v);
  await role(student);
  await assert.rejects(
    () => call("book_practice_explanation", [sid, iid], ["uuid", "uuid"]),
    /Check your answer/,
  );
  let attempt = await call(
    "check_book_practice_response",
    [sid, iid, "1/2", crypto.randomUUID()],
    ["uuid", "uuid", "text", "uuid"],
  );
  assert.equal(attempt.correct, false);
  assert.ok(
    await call("book_practice_explanation", [sid, iid], ["uuid", "uuid"]),
  );
  attempt = await call(
    "check_book_practice_response",
    [sid, iid, "−.5", crypto.randomUUID()],
    ["uuid", "uuid", "text", "uuid"],
  );
  assert.equal(attempt.correct, true);
  const attempts = (
    await db.query(
      "select correct from question_check_attempts where item_id=$1 order by attempt_order",
      [iid],
    )
  ).rows;
  assert.deepEqual(
    attempts.map((a) => a.correct),
    [false, true],
  );
  await role(admin);
});
