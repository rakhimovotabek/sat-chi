import test from "node:test";
import assert from "node:assert/strict";
import { countdownParts } from "../src/features/learning/countdown-model.js";
import { learningDatabase, student, other } from "./helpers/database.js";
test("countdown isolates units, clamps past dates and rejects invalid instants", () => {
  assert.deepEqual(
    countdownParts("2026-12-05T00:00:00Z", Date.parse("2026-12-03T20:57:56Z")),
    { days: 1, hours: 3, minutes: 2, seconds: 4, past: false },
  );
  assert.equal(countdownParts("2020-01-01T00:00:00Z").past, true);
  assert.equal(countdownParts("invalid"), null);
});
test("exam settings persist canonical date and IANA timezone with timezone-aware midnight", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    const saved = await call(
      "save_exam_countdown",
      ["2099-03-14", "America/New_York"],
      ["date", "text"],
    );
    assert.equal(saved.date, "2099-03-14");
    assert.equal(saved.timezone, "America/New_York");
    assert.equal(Date.parse(saved.target), Date.parse("2099-03-14T04:00:00Z"));
    assert.equal(
      (
        await db.query(
          "select target_test_date::text from profiles where id=$1",
          [student],
        )
      ).rows[0].target_test_date,
      "2099-03-14",
    );
    await assert.rejects(
      call(
        "save_exam_countdown",
        ["2099-03-14", "Invented/Timezone"],
        ["date", "text"],
      ),
      /timezone/,
    );
    await assert.rejects(
      call("save_exam_countdown", ["2020-01-01", "UTC"], ["date", "text"]),
      /upcoming/,
    );
    const days = await call("dashboard_study_activity");
    assert.equal(days.days.length, 7);
    assert.ok(days.days.every((d) => d.questions === 0));
    await role(other);
    assert.equal((await call("exam_countdown_settings")).date, null);
    await role(student);
    assert.equal((await call("exam_countdown_settings")).date, "2099-03-14");
  } finally {
    await db.close();
  }
});
