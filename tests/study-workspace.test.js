import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  toggleDomain,
  toggleSkill,
  shortSetTitle,
} from "../src/features/learning/bank-selection.js";
test("domain and skill selections form a union and deselecting a skill narrows a whole domain", () => {
  const initial = { section: "Math", difficulty: "hard", domains: ["Algebra"] };
  const narrow = toggleSkill(initial, "Algebra", "Linear", [
    "Linear",
    "Systems",
  ]);
  assert.deepEqual(narrow.skills, [{ domain: "Algebra", skill: "Systems" }]);
  assert.deepEqual(narrow.domains, []);
  const combined = toggleDomain(narrow, "Advanced Math");
  assert.deepEqual(combined.domains, ["Advanced Math"]);
  assert.equal(combined.skills.length, 1);
  const whole = toggleDomain(combined, "Algebra");
  assert.deepEqual(whole.skills, []);
  assert.equal(whole.difficulty, "hard");
  assert.equal(
    shortSetTitle("College Panda 400 Words · Set 1", "College Panda 400 Words"),
    "Set 1",
  );
  assert.equal(
    shortSetTitle("Unrelated · Set 2", "College Panda"),
    "Unrelated · Set 2",
  );
  assert.equal(shortSetTitle("A (B) · Set 3", "A (B)"), "Set 3");
});
test("database bank facets, union filters and vocabulary lifecycle enforce visibility and publication readiness", async () => {
  const db = new PGlite(),
    admin = "a1000000-0000-0000-0000-000000000001",
    student = "a1000000-0000-0000-0000-000000000002";
  const role = (id) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
    );
  const call = async (name, args = [], casts = []) =>
    (
      await db.query(
        `select public.${name}(${args.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) result`,
        args,
      )
    ).rows[0].result;
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;",
    );
    for (const f of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
    await db.exec(
      `insert into auth.users(id)values('${admin}'),('${student}');update public.profiles set role='admin' where id='${admin}'`,
    );
    await role(admin);
    const question = (domain, skill, difficulty) => ({
      question: `Which expression describes ${domain} ${skill}?`,
      options: ["one", "two", "three", "four"],
      correctAnswer: 1,
      domain,
      skill,
      difficulty,
    });
    await call(
      "import_book_content",
      [
        JSON.stringify({
          book: { title: "Published", category: "Math", published: true },
          topics: [
            {
              title: "Math",
              questions: [
                question("Algebra", "Linear", "easy"),
                question("Algebra", "Systems", "hard"),
                question("Advanced Math", "Quadratics", "hard"),
              ],
            },
          ],
        }),
      ],
      ["jsonb"],
    );
    await call(
      "import_book_content",
      [
        JSON.stringify({
          book: { title: "Draft", category: "Math" },
          topics: [
            {
              title: "Math",
              questions: [
                question("Geometry and Trigonometry", "Circles", "easy"),
              ],
            },
          ],
        }),
      ],
      ["jsonb"],
    );
    const vb = (
      await db.query(
        "insert into public.vocabulary_books(title)values('Draft vocabulary') returning id",
      )
    ).rows[0].id;
    await assert.rejects(
      call("set_vocabulary_publication", [vb, "published"], ["uuid", "text"]),
      /needs sets/,
    );
    const set = (
      await db.query(
        "insert into public.vocabulary_sets(book_id,title)values($1,'Set 1') returning id",
        [vb],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        "update public.vocabulary_books set published=true where id=$1",
        [vb],
      ),
      /needs sets/,
    );
    await db.query(
      "insert into public.vocabulary_words(set_id,word,definition)values($1,'abate','become less intense')",
      [set],
    );
    assert.equal(
      (await call("vocabulary_book_detail", [vb], ["uuid"])).eligible,
      true,
    );
    await role(student);
    assert.equal((await call("question_bank", ["{}"], ["jsonb"])).count, 3);
    const facets = await call("question_bank_facets", ["{}"], ["jsonb"]);
    assert.equal(
      facets.reduce((n, r) => n + r.count, 0),
      3,
    );
    assert.equal(
      facets.some((r) => r.skill === "Circles"),
      false,
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [
            JSON.stringify({
              domains: ["Advanced Math"],
              skills: [{ domain: "Algebra", skill: "Linear" }],
            }),
          ],
          ["jsonb"],
        )
      ).count,
      2,
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [
            JSON.stringify({
              domains: ["Advanced Math"],
              skills: [{ domain: "Algebra", skill: "Linear" }],
              difficulty: "hard",
            }),
          ],
          ["jsonb"],
        )
      ).count,
      1,
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ domains: ["Missing"] })],
          ["jsonb"],
        )
      ).count,
      0,
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ marked: "yes" })],
          ["jsonb"],
        )
      ).count,
      0,
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ marked: "no" })],
          ["jsonb"],
        )
      ).count,
      3,
    );
    await assert.rejects(
      call("question_bank", [JSON.stringify({ skills: "garbage" })], ["jsonb"]),
    );
    await assert.rejects(
      call("set_vocabulary_publication", [vb, "published"], ["uuid", "text"]),
      /Admin required/,
    );
    await assert.rejects(
      call("vocabulary_book_detail", [vb], ["uuid"]),
      /unavailable/,
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.vocabulary_words"))
        .rows[0].n,
      0,
    );
    await role(admin);
    await call(
      "set_vocabulary_publication",
      [vb, "published"],
      ["uuid", "text"],
    );
    await role(student);
    const visible = await call("vocabulary_book_detail", [vb], ["uuid"]);
    assert.equal(visible.sets[0].words, 1);
    assert.equal("pending" in visible, false);
    assert.equal(
      (await db.query("select count(*)::int n from public.vocabulary_words"))
        .rows[0].n,
      1,
    );
    await role(admin);
    await call(
      "set_vocabulary_publication",
      [vb, "archived"],
      ["uuid", "text"],
    );
    assert.equal(
      (await call("vocabulary_book_detail", [vb], ["uuid"])).state,
      "archived",
    );
    const audit = (
      await db.query(
        "select actor,after_data from public.content_review_audit where action='vocabulary_publication' order by id desc",
      )
    ).rows;
    assert.equal(audit.length, 2);
    assert.equal(audit[0].actor, admin);
    assert.equal(audit[0].after_data.published, false);
    await role(student);
    assert.equal(
      (await db.query("select count(*)::int n from public.vocabulary_books"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
