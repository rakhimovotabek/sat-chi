import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { learningDatabase, student } from "./helpers/database.js";

test("PDF text recovery retains labels and signs and rejects exponents, fractions, graph labels and missing labels", () => {
  const script = `import importlib.util
s=importlib.util.spec_from_file_location('choice','scripts/imports/choice-text-recovery.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def word(t,x=30,y=10):return dict(text=t,xMin=x,xMax=x+5,yMin=y,yMax=y+6)
label=word('A.',10)
assert m.scalar_choice([label,word('285.6')],'A')=='285.6'
assert m.scalar_choice([label,word('−'),word('42',40)],'A')=='-42'
assert m.scalar_choice([label,word('50%')],'A')=='50%'
assert m.scalar_choice([label,word('12'),word('3',40,5)],'A') is None
assert m.scalar_choice([label,word('500',30,4),word('7',30,20)],'A') is None
assert m.scalar_choice([label,word('20'),word('40',40)],'A') is None
assert m.scalar_choice([word('42')],'A') is None
assert m.scalar_choice([label,word('x²')],'A') is None
print('verified')`;
  assert.equal(
    execFileSync("python3", ["-c", script], { encoding: "utf8" }).trim(),
    "verified",
  );
});

test("Bank eligibility updates with choices and remains private to student queries", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    assert.equal((await call("question_bank", ["{}"], ["jsonb"])).count, 12);
    await assert.rejects(
      db.query("select * from public.question_bank_eligibility"),
      /permission denied/,
    );
    await db.exec("reset role");
    const id = (
      await db.query("select id from public.questions order by id limit 1")
    ).rows[0].id;
    await db.query(
      'update public.questions set options=\'["2","2","2","2"]\' where id=$1',
      [id],
    );
    await role(student);
    assert.equal((await call("question_bank", ["{}"], ["jsonb"])).count, 11);
    await db.exec("reset role");
    await db.query(
      'update public.questions set options=\'["2","4","6","8"]\' where id=$1',
      [id],
    );
    await role(student);
    assert.equal((await call("question_bank", ["{}"], ["jsonb"])).count, 12);
  } finally {
    await db.close();
  }
});

test("source domain mapping uses explicit SAT headings and preserves unknown strategy headings", async () => {
  const { db } = await learningDatabase();
  try {
    await db.exec("reset role");
    const domain = async (slug, chapter, sourceDomain = null) =>
      (
        await db.query("select public.package_sat_domain($1,$2,$3) domain", [
          slug,
          chapter,
          sourceDomain,
        ])
      ).rows[0].domain;
    assert.equal(
      await domain(
        "advanced-math-official-sat-question-bank",
        "Equivalent Expressions",
      ),
      "Advanced Math",
    );
    assert.equal(
      await domain(
        "problem-solving-and-data-analysis-official-sat-question-bank",
        "Percentages",
      ),
      "Problem-Solving and Data Analysis",
    );
    assert.equal(
      await domain("hardbook-2-by-satashkent", "Geometry"),
      "Geometry and Trigonometry",
    );
    assert.equal(
      await domain(
        "800-challenge-hard-math-150-part-1-sat-math-club",
        "Questions",
        "GEOMETRY & TRIGONOMETRY",
      ),
      "Geometry and Trigonometry",
    );
    assert.equal(
      await domain(
        "preppros-complete-guide-to-digital-sat-math",
        "Backsolving",
      ),
      "Backsolving",
    );
  } finally {
    await db.close();
  }
});

test("retained source repair rolls back safely and applies idempotently without changing progress or publication", async () => {
  const { contentRepairSql } = await import(
    "../scripts/imports/repair-practice-content.js"
  );
  const { db, book } = await learningDatabase();
  try {
    await db.exec("reset role");
    const fingerprint = "b".repeat(64);
    const source = { id: "recovered-source" };
    const id = "bc100000-0000-4000-8000-000000000001";
    const url =
      "https://ileffhbbaomfimwulvpw.supabase.co/storage/v1/object/authenticated/book-package-assets/recovered/option.png";
    const question = {
      id,
      text: "Recovered source stem",
      options: ["", "4", "6", "8"],
      optionImages: [url, null, null, null],
      image: null,
      table: null,
      difficulty: "easy",
      position: 12,
      metadata: { package_question_id: source.id },
      type: "mcq",
      correctAnswer: 1,
      explanation: "Supplied explanation",
      page: 1,
    };
    await db.query(
      "insert into public.book_import_packages values($1,'repair-fixture',$2,$3,'{}','[]','[]')",
      [
        book,
        fingerprint,
        JSON.stringify({
          chapters: [{ title: "Algebra", topics: [{ questions: [source] }] }],
        }),
      ],
    );
    await db.query(
      "insert into public.book_package_assets(path,book_id,kind,source_path,sha256) values('recovered/option.png',$1,'option','option.png','fixture')",
      [book],
    );
    const sid = (
      await db.query(
        "insert into public.book_practice_sessions(student_id,title,kind) values($1,'Retained progress','book') returning id",
        [student],
      )
    ).rows[0].id;
    const snapshot = {
      id,
      options: question.options,
      option_image_urls: question.optionImages,
    };
    await db.query(
      "insert into public.book_practice_items(session_id,position,question,selected_answer) values($1,0,$2,1)",
      [sid, JSON.stringify(snapshot)],
    );
    const publication = (
      await db.query("select published from public.books where id=$1", [book])
    ).rows[0].published;
    const plan = {
      restored: [
        {
          fingerprint,
          slug: "repair-fixture",
          source,
          chapterTitle: "Algebra",
          chapter: "Algebra",
          topic: "Algebra",
          sourceFile: "fixture.pdf",
          question,
          proof: "Verified source",
        },
      ],
      choices: [
        {
          fingerprint,
          sourceId: source.id,
          index: 0,
          text: "2",
          sourcePath: "option.png",
        },
      ],
    };
    await db.exec(contentRepairSql(plan));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.questions where id=$1",
          [id],
        )
      ).rows[0].n,
      0,
    );
    await db.exec(contentRepairSql(plan, true));
    assert.deepEqual(
      (await db.query("select options from public.questions where id=$1", [id]))
        .rows[0].options,
      ["2", "4", "6", "8"],
    );
    const saved = (
      await db.query(
        "select question,selected_answer from public.book_practice_items where session_id=$1",
        [sid],
      )
    ).rows[0];
    assert.equal(saved.question.options[0], "2");
    assert.equal(saved.selected_answer, 1);
    assert.equal(
      (await db.query("select published from public.books where id=$1", [book]))
        .rows[0].published,
      publication,
    );
    await db.exec(contentRepairSql(plan, true));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.questions where id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
