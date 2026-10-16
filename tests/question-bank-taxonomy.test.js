import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student } from "./helpers/database.js";
test("conservative domains preserve strategies, metadata and contextual eligible counts", async () => {
  const { db, call, role, book } = await learningDatabase();
  try {
    const questions = (
      await db.query(
        "select q.id from questions q join book_topics t on t.id=q.topic_id where t.book_id=$1 order by q.position",
        [book],
      )
    ).rows;
    await db.exec("reset role");
    for (const [index, domain, skill] of [
      [0, "Problem Solving and Data Analysis", "Statistics"],
      [1, "Desmos Hacks", "Graph shortcuts"],
      [2, "Functions", "Function notation"],
      [3, "", ""],
      [4, "Geometry", "Circles"],
    ])
      await db.query("update questions set domain=$2,skill=$3 where id=$1", [
        questions[index].id,
        domain,
        skill,
      ]);
    await db.exec(
      "update content_review_items set status='approved' where item_type='question'",
    );
    const fingerprint = (
      await db.query(
        "select md5(string_agg(to_jsonb(q)::text,',' order by id)) value from questions q",
      )
    ).rows[0].value;
    await role(student);
    const query = (filter = {}) =>
      call(
        "question_bank",
        [JSON.stringify({ book, ...filter }), 0],
        ["jsonb", "integer"],
      );
    assert.equal((await query()).count, 12);
    const other = await query({ domain: "Other Math Topics & Strategies" });
    assert.equal(other.count, 3);
    assert.ok(
      other.rows.some(
        (q) =>
          q.source_domain === "Desmos Hacks" && q.skill === "Graph shortcuts",
      ),
    );
    assert.equal(
      (await query({ domain: "Advanced Math" })).count,
      0,
      "Functions is ambiguous and must not imply Advanced Math",
    );
    assert.equal(
      (await query({ domain: "Problem-Solving and Data Analysis" })).count,
      1,
    );
    assert.equal(
      (
        await query({
          domains: [
            "Other Math Topics & Strategies",
            "Geometry and Trigonometry",
          ],
        })
      ).count,
      4,
    );
    assert.equal(
      (
        await query({
          skills: [
            {
              domain: "Other Math Topics & Strategies",
              skill: "Graph shortcuts",
            },
          ],
        })
      ).count,
      1,
    );
    const facets = await call(
      "question_bank_facets",
      [JSON.stringify({ book })],
      ["jsonb"],
    );
    assert.equal(
      facets.reduce((sum, r) => sum + r.count, 0),
      12,
    );
    assert.equal((await query({ difficulties: ["hard"] })).count, 0);
    assert.equal((await query({ status: "unanswered" })).count, 12);
    assert.equal(
      (
        await db.query(
          "select md5(string_agg(to_jsonb(q)::text,',' order by id)) value from questions q",
        )
      ).rows[0].value,
      fingerprint,
    );
    await assert.rejects(query({ skills: [{}] }), /Invalid skills/);
  } finally {
    await db.close();
  }
});
