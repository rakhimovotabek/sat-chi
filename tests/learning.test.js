import { buildImportSql } from "../scripts/imports/import-sql.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  homeworkStatus,
  sectionResults,
} from "../src/features/learning/homework-model.js";
import { validateVocabulary } from "../src/features/learning/vocabulary-validation.js";
import { parseGrammar } from "../scripts/imports/parsers.js";
test("homework statuses and section results reflect saved data", () => {
  const now = new Date("2026-10-03T10:00:00Z");
  assert.equal(
    homeworkStatus({ due_at: "2026-10-03T08:00:00Z" }, now),
    "Overdue",
  );
  assert.equal(
    homeworkStatus({ due_at: "2026-10-04", session_id: "saved" }, now),
    "In Progress",
  );
  assert.equal(homeworkStatus({ submitted_at: "done" }, now), "Completed");
  assert.deepEqual(
    sectionResults([
      {
        question: { homework_section: "Math" },
        selected_answer: 1,
        correct: true,
      },
      {
        question: { homework_section: "Math" },
        selected_answer: null,
        correct: false,
      },
    ]),
    [{ name: "Math", total: 2, correct: 1, incorrect: 0, unanswered: 1 }],
  );
});
test("vocabulary validation rejects malformed and duplicate words", () => {
  assert.ok(
    validateVocabulary({
      title: "Book",
      sets: [
        {
          title: "Set",
          words: [
            { word: "one", definition: "first" },
            { word: "one", definition: "duplicate" },
          ],
        },
      ],
    }).length,
  );
  assert.deepEqual(
    validateVocabulary({
      title: "Book",
      sets: [{ title: "Set", words: [{ word: "one", definition: "first" }] }],
    }),
    [],
  );
  assert.throws(
    () => parseGrammar("ambiguous raw PDF text", "book.pdf"),
    /boundaries/,
  );
});
test("real PostgreSQL learning workflows preserve ownership, private keys, frozen sessions and calculated results", async () => {
  const db = new PGlite(),
    admin = "e0000000-0000-0000-0000-000000000001",
    student = "e0000000-0000-0000-0000-000000000002",
    other = "e0000000-0000-0000-0000-000000000003";
  const role = (id) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  const call = async (name, values = [], casts = []) =>
    (
      await db.query(
        `select public.${name}(${values.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) result`,
        values,
      )
    ).rows[0].result;
  const q = {
    question: "Which number is four?",
    options: ["2", "4", "6", "8"],
    correctAnswer: 1,
    domain: "Algebra",
    skill: "Linear equations",
  };
  try {
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;`,
    );
    for (const f of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
    await db.exec(
      `insert into auth.users(id)values('${admin}'),('${student}'),('${other}');update public.profiles set role='admin' where id='${admin}';`,
    );
    const localPayload = {
      book: {
        title: "Local draft",
        category: "Other",
        description: "Quoted source ' $import$; drop table public.profiles; --",
      },
      topics: [{ title: "Topic", questions: [q] }],
    };
    const report = {
      fingerprint: "a".repeat(64),
      source_file: "Local.json",
      title: "Local draft",
      status: "validated",
      detected_topics: 1,
      detected_questions: 1,
      imported_count: 0,
      skipped_count: 0,
      warnings: [],
      errors: [],
    };
    await db.exec(buildImportSql(report, localPayload));
    await db.exec(buildImportSql(report, localPayload));
    assert.equal(
      (await db.query("select imported_count from public.import_jobs")).rows[0]
        .imported_count,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.books where title='Local draft'",
        )
      ).rows[0].n,
      1,
    );
    const duplicateReport = { ...report, fingerprint: "b".repeat(64) };
    await db.exec(
      buildImportSql(duplicateReport, {
        ...localPayload,
        book: { ...localPayload.book, title: "Second local draft" },
      }),
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.questions")).rows[0]
        .n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select skipped_count from public.import_jobs where fingerprint=$1",
          [duplicateReport.fingerprint],
        )
      ).rows[0].skipped_count,
      1,
    );
    await assert.rejects(
      db.exec(
        buildImportSql(
          { ...report, fingerprint: "c".repeat(64) },
          {
            ...localPayload,
            book: { ...localPayload.book, title: "Conflict draft" },
            topics: [
              { title: "Topic", questions: [{ ...q, correctAnswer: 0 }] },
            ],
          },
        ),
      ),
      /conflicting answer keys/,
    );
    await db.exec("rollback");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.books where title='Conflict draft'",
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      db.exec("set role anon;select * from public.local_question_imports"),
    );
    await db.exec("reset role");
    const vocabularyPayload = {
      title: "Local vocabulary",
      published: false,
      sets: [
        {
          title: "Set 1",
          words: [
            { word: "Supplied", definition: "Provided in the local file" },
          ],
        },
      ],
    };
    const vocabularyReport = {
      ...report,
      fingerprint: "d".repeat(64),
      source_type: "vocabulary",
      detected_questions: 0,
      detected_vocabulary_sets: 1,
    };
    await db.exec(buildImportSql(vocabularyReport, vocabularyPayload));
    await db.exec(buildImportSql(vocabularyReport, vocabularyPayload));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.vocabulary_books where title='Local vocabulary' and not published",
        )
      ).rows[0].n,
      1,
    );
    const stimulusQuestion = { ...q, stimulus: "Distinct supplied stimulus" };
    await db.exec(
      buildImportSql(
        { ...report, fingerprint: "e".repeat(64) },
        {
          ...localPayload,
          book: { ...localPayload.book, title: "Distinct stimulus draft" },
          topics: [{ title: "Topic", questions: [stimulusQuestion] }],
        },
      ),
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.questions")).rows[0]
        .n,
      2,
    );
    await role(admin);
    const imported = await call(
      "import_book_content",
      [
        JSON.stringify({
          book: { title: "Published math", category: "Math", published: true },
          topics: [
            {
              title: "Algebra",
              questions: [
                q,
                { ...q, question: "Another question" },
                { ...q, question: "Third question" },
                { ...q, question: "Fourth question" },
              ],
            },
          ],
        }),
      ],
      ["jsonb"],
    );
    const parent = (
      await db.query(
        "select id from public.book_topics where book_id=$1 and parent_id is null",
        [imported.book_id],
      )
    ).rows[0].id;
    const child = (
      await db.query(
        "insert into public.book_topics(book_id,parent_id,title)values($1,$2,'Subtopic') returning id",
        [imported.book_id, parent],
      )
    ).rows[0].id;
    await db.query(
      "update public.questions set topic_id=$1 where id=(select id from public.questions where topic_id=$2 limit 1)",
      [child, parent],
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ topic: parent })],
          ["jsonb"],
        )
      ).count,
      4,
    );
    const group = (
      await db.query(
        "insert into public.groups(name)values('Group A') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into public.group_members(group_id,student_id)values($1,$2)",
      [group, student],
    );
    await assert.rejects(
      db.query(
        "insert into public.group_members(group_id,student_id)values($1,$2)",
        [group, student],
      ),
    );
    const homework = {
      title: "Mixed homework",
      dueAt: "2026-10-05T12:00:00Z",
      groups: [group],
      sections: [{ title: "Algebra", count: 2, filters: { section: "Math" } }],
    };
    const hid = await call(
      "create_homework",
      [JSON.stringify(homework)],
      ["jsonb"],
    );
    await assert.rejects(
      call(
        "create_homework",
        [
          JSON.stringify({
            ...homework,
            sections: [{ title: "Too many", count: 50, filters: {} }],
          }),
        ],
        ["jsonb"],
      ),
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.homeworks")).rows[0]
        .n,
      1,
    );
    await role(student);
    await assert.rejects(call("learning_metrics_internal", [], []));
    await assert.rejects(
      db.exec("insert into public.groups(name)values('attack')"),
    );
    await assert.rejects(
      call("create_homework", [JSON.stringify(homework)], ["jsonb"]),
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ section: "Math" })],
          ["jsonb"],
        )
      ).count,
      4,
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ section: "Reading & Writing" })],
          ["jsonb"],
        )
      ).count,
      0,
    );
    await assert.rejects(call("bank_candidates", ["{}"], ["jsonb"]));
    const list = await call("homework_directory"),
      aid = list[0].assignment_id;
    assert.equal(list.length, 1);
    assert.equal(list[0].sections[0].count, 2);
    assert.equal(
      (await db.query("select * from public.homework_questions")).rows.length,
      0,
    );
    const sid = await call("start_homework", [aid], ["uuid"]);
    assert.equal(await call("start_homework", [aid], ["uuid"]), sid);
    const items = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    assert.equal(items.length, 2);
    assert.ok(
      items.every(
        (i) =>
          !("correct_answer" in i.question) && !("explanation" in i.question),
      ),
    );
    await assert.rejects(call("review_book_practice", [sid], ["uuid"]));
    await call(
      "practice_heartbeat",
      [sid, 1, 99999],
      ["uuid", "integer", "integer"],
    );
    assert.equal(
      (
        await db.query(
          "select current_position from public.book_practice_sessions where id=$1",
          [sid],
        )
      ).rows[0].current_position,
      1,
    );
    await call(
      "save_book_practice",
      [
        sid,
        JSON.stringify(
          items.map((i) => ({
            id: i.id,
            selected_answer: 1,
            marked: true,
            eliminated: [],
          })),
        ),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [sid], ["uuid"]);
    const m = await call("learning_metrics");
    assert.equal(m.attempted, 2);
    assert.equal(m.correct, 2);
    assert.equal(m.homework_completed, 1);
    assert.equal(m.activity.length, 1);
    assert.ok(m.study_seconds <= 30);
    assert.equal(
      (await call("learning_standings", [true], ["boolean"])).length,
      1,
    );
    await assert.rejects(call("learning_metrics", [other], ["uuid"]));
    await assert.rejects(
      db.exec(
        "insert into public.student_activity(student_id,kind,title)values(auth.uid(),'fake','fake')",
      ),
    );
    await assert.rejects(
      call(
        "start_bank_practice",
        ["{}", null, false],
        ["jsonb", "integer", "boolean"],
      ),
    );
    const bankSession = await call(
      "start_bank_practice",
      ["{}", 3, false],
      ["jsonb", "integer", "boolean"],
    );
    const frozen = (
      await db.query(
        "select id,position,question from public.book_practice_items where session_id=$1 order by position",
        [bankSession],
      )
    ).rows;
    assert.equal(frozen.length, 3);
    assert.deepEqual(
      (
        await db.query(
          "select id,position,question from public.book_practice_items where session_id=$1 order by position",
          [bankSession],
        )
      ).rows,
      frozen,
    );
    await role(other);
    assert.equal((await call("homework_directory")).length, 0);
    await assert.rejects(call("start_homework", [aid], ["uuid"]));
    await assert.rejects(
      call("practice_heartbeat", [sid, 0, 30], ["uuid", "integer", "integer"]),
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_sessions where id=$1",
          [sid],
        )
      ).rows.length,
      0,
    );
    await role(admin);
    assert.equal(
      (await db.query("select * from public.review_book_practice($1)", [sid]))
        .rows.length,
      2,
    );
    const words = ["abate", "candid", "diligent", "prudent"].map((word, i) => ({
      word,
      definition: `Meaning ${i + 1}`,
      example: `An example of ${word}.`,
    }));
    const vocab = {
      title: "Vocabulary book",
      published: true,
      sets: [
        {
          title: "Set 1",
          words,
          passage: "Be candid and prudent.",
          questions: [q],
        },
      ],
    };
    const vbid = await call(
      "import_vocabulary",
      [JSON.stringify(vocab)],
      ["jsonb"],
    );
    await assert.rejects(
      call("import_vocabulary", [JSON.stringify(vocab)], ["jsonb"]),
    );
    const set = (
        await db.query(
          "select id from public.vocabulary_sets where book_id=$1",
          [vbid],
        )
      ).rows[0].id,
      word = (
        await db.query(
          "select id from public.vocabulary_words where set_id=$1 limit 1",
          [set],
        )
      ).rows[0].id;
    await role(student);
    assert.equal(
      (await db.query("select * from public.vocabulary_questions")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.vocabulary_progress(student_id,word_id,status)values($1,$2,'known')",
        [student, word],
      ),
    );
    const event = "e1000000-0000-0000-0000-000000000001";
    const review = (rating, id, mode = "cards", answer = null) =>
      call(
        "review_vocabulary",
        [word, rating, 30, id, mode, answer],
        ["uuid", "text", "integer", "uuid", "text", "text"],
      );
    const first = await review("good", event);
    assert.equal(first.progress.mastery_state, "learning");
    assert.equal(first.progress.review_count, 1);
    assert.equal(first.progress.interval_days, 1);
    assert.equal(
      (await review("good", event)).progress.review_count,
      1,
      "retry must not double credit",
    );
    await call("star_vocabulary", [word, true], ["uuid", "boolean"]);
    assert.equal((await call("vocabulary_summary", [], [])).starred, 1);
    assert.equal(
      (
        await call(
          "vocabulary_pool",
          [[set], "starred", "", 0],
          ["uuid[]", "text", "text", "integer"],
        )
      ).total,
      1,
    );
    const miss = await review(
      "good",
      "e1000000-0000-0000-0000-000000000002",
      "typed",
      "unrelated",
    );
    assert.equal(miss.correct, false);
    assert.equal(miss.progress.mastery_state, "review");
    assert.equal(miss.progress.interval_days, 0);
    assert.equal(miss.progress.failed_recalls, 1);
    assert.equal(miss.progress.study_seconds, 60);
    const actual = (
      await db.query("select word from public.vocabulary_words where id=$1", [
        word,
      ])
    ).rows[0].word;
    const typed = await review(
      "again",
      "e1000000-0000-0000-0000-000000000003",
      "typed",
      actual.toUpperCase(),
    );
    assert.equal(typed.correct, true);
    assert.equal(typed.progress.mastery_state, "learning");
    await assert.rejects(
      review("mastered", "e1000000-0000-0000-0000-000000000004"),
    );
    const repeated = await review(
      "easy",
      "e1000000-0000-0000-0000-000000000005",
    );
    assert.equal(
      repeated.progress.mastery_state,
      "learning",
      "same-day clicks must not master a word",
    );
    assert.equal(
      repeated.progress.interval_days,
      typed.progress.interval_days,
      "same-day repetitions cannot postpone reviews",
    );
    await db.exec("reset role");
    await db.query(
      "update public.vocabulary_progress set successful_recalls=4,review_count=4,successful_days=2,consecutive_successes=2,first_success=now()-interval '8 days',last_success=now()-interval '1 day',next_review=now()-interval '1 minute',interval_days=4 where student_id=$1 and word_id=$2",
      [student, word],
    );
    await role(student);
    const mastered = await review(
      "good",
      "e1000000-0000-0000-0000-000000000006",
    );
    assert.equal(mastered.progress.mastery_state, "mastered");
    assert.equal(mastered.progress.interval_days, 8);
    const forgotten = await review(
      "again",
      "e1000000-0000-0000-0000-000000000007",
    );
    assert.equal(forgotten.progress.mastery_state, "review");
    assert.equal(forgotten.progress.consecutive_successes, 0);
    assert.ok(
      new Date(forgotten.progress.next_review) -
        new Date(forgotten.progress.last_reviewed) <=
        600001,
    );
    await assert.rejects(
      db.query(
        "update public.vocabulary_progress set mastery_state='mastered' where word_id=$1",
        [word],
      ),
    );
    await role(admin);
    const individual = {
      title: "Source Set 2",
      words: [{ ...words[0], source_page: 12, antonym: "Opposite supplied" }],
    };
    const secondSet = await call(
      "import_vocabulary_set",
      [vbid, JSON.stringify(individual)],
      ["uuid", "jsonb"],
    );
    await assert.rejects(
      call(
        "import_vocabulary_set",
        [vbid, JSON.stringify(individual)],
        ["uuid", "jsonb"],
      ),
    );
    await role(student);
    const combined = await call(
      "vocabulary_pool",
      [[set, secondSet], "all", "", 0],
      ["uuid[]", "text", "text", "integer"],
    );
    assert.equal(combined.total, 4);
    assert.equal(
      combined.words.find((w) => w.word === words[0].word).source_sets.length,
      2,
    );

    const multi = await call(
      "start_vocabulary_practice",
      [[set], "reverse", 10, "all"],
      ["uuid[]", "text", "integer", "text"],
    );
    const multiItems = (
      await db.query(
        "select question from public.book_practice_items where session_id=$1",
        [multi],
      )
    ).rows;
    assert.equal(multiItems.length, 4);
    assert.equal(multiItems[0].question.set_id, set);
    assert.equal(multiItems[0].question.options.length, 4);
    await assert.rejects(call("review_book_practice", [multi], ["uuid"]));
    await role(other);
    assert.equal(
      (await db.query("select * from public.vocabulary_reviews")).rows.length,
      0,
    );
    await role(student);
    await assert.rejects(
      db.query(
        "insert into public.vocabulary_progress(student_id,word_id,status)values($1,$2,'known')",
        [other, word],
      ),
    );
    const vsid = await call(
      "start_vocabulary_test",
      [set, false],
      ["uuid", "boolean"],
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1",
          [vsid],
        )
      ).rows.length,
      4,
    );
    await assert.rejects(call("review_book_practice", [vsid], ["uuid"]));
    await call("finish_book_practice", [vsid], ["uuid"]);
    assert.equal(
      (await db.query("select * from public.review_book_practice($1)", [vsid]))
        .rows.length,
      4,
    );
    const importedTest = await call(
      "start_vocabulary_test",
      [set, true],
      ["uuid", "boolean"],
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1",
          [importedTest],
        )
      ).rows.length,
      1,
    );
    // Real graded attempts provide enough evidence for domain targeting.
    for (let iteration = 0; iteration < 5; iteration++) {
      const weakSession = await call(
        "start_bank_practice",
        [JSON.stringify({ domain: "Algebra" }), 2, false],
        ["jsonb", "integer", "boolean"],
      );
      const weakItems = (
        await db.query(
          "select id from public.book_practice_items where session_id=$1",
          [weakSession],
        )
      ).rows;
      await call(
        "save_book_practice",
        [
          weakSession,
          JSON.stringify(
            weakItems.map((i) => ({
              id: i.id,
              selected_answer: 0,
              marked: false,
              eliminated: [],
            })),
          ),
        ],
        ["uuid", "jsonb"],
      );
      await call("finish_book_practice", [weakSession], ["uuid"]);
    }
    const mistakes = await call(
      "question_mistakes",
      ["{}", 0],
      ["jsonb", "integer"],
    );
    assert.ok(mistakes.total > 0 && mistakes.total <= 10);
    assert.equal(
      new Set(mistakes.items.map((i) => i.question.id)).size,
      mistakes.total,
      "repeated mistakes deduplicate by original question",
    );
    const retryMistake = await call(
      "practice_mistake",
      [mistakes.items[0].item_id],
      ["uuid"],
    );
    await assert.rejects(
      call("review_book_practice", [retryMistake], ["uuid"]),
    );
    const weakMetrics = await call("learning_metrics");
    assert.ok(
      weakMetrics.attention.some(
        (r) => r.domain === "Algebra" && r.attempted >= 10,
      ),
    );
    await call(
      "save_study_preferences",
      [45, [0, 1, 2, 3, 4, 5, 6], "UTC", null, 1200, 1450],
      ["integer", "integer[]", "text", "date", "integer", "integer"],
    );
    await assert.rejects(
      call(
        "save_study_preferences",
        [5, [1], "UTC", null, 1200, 1450],
        ["integer", "integer[]", "text", "date", "integer", "integer"],
      ),
    );
    const plan = await call("refresh_study_plan");
    assert.equal(plan.preferences.minutes_per_day, 45);
    assert.ok(plan.tasks.length > 0);
    assert.ok(
      plan.tasks.some(
        (t) => t.kind === "questions" && t.filters.domain === "Algebra",
      ),
    );
    const daily = new Map();
    for (const task of plan.tasks)
      daily.set(
        task.study_date,
        (daily.get(task.study_date) || 0) + task.minutes,
      );
    assert.ok([...daily.values()].every((minutes) => minutes <= 45));
    assert.ok(plan.tasks.some((task) => task.kind === "vocabulary_due"));
    const todayTasks = plan.tasks.filter((t) => t.study_date === plan.today),
      task = todayTasks.find(
        (t) => t.kind === "questions" || t.kind === "mistakes",
      );
    assert.ok(task);
    const started = await call("start_study_task", [task.id], ["uuid"]);
    assert.ok(started.session_id);
    assert.equal(
      (await call("start_study_task", [task.id], ["uuid"])).session_id,
      started.session_id,
      "starting twice resumes one session",
    );
    const planItems = (
      await db.query(
        "select id from public.book_practice_items where session_id=$1",
        [started.session_id],
      )
    ).rows;
    await call(
      "save_book_practice",
      [
        started.session_id,
        JSON.stringify(
          planItems.map((i) => ({
            id: i.id,
            selected_answer: 1,
            marked: false,
            eliminated: [],
          })),
        ),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [started.session_id], ["uuid"]);
    const completed = await call("refresh_study_plan");
    assert.ok(completed.tasks.find((t) => t.id === task.id)?.completed_at);
    const vocabTask = todayTasks.find((t) => t.kind === "vocabulary_due");
    assert.ok(vocabTask);
    await call("start_study_task", [vocabTask.id], ["uuid"]);
    const taskWords = await call(
      "study_task_vocabulary",
      [vocabTask.id],
      ["uuid"],
    );
    assert.equal(taskWords.total, vocabTask.target_count);
    for (const [i, w] of taskWords.words.entries())
      await call(
        "review_vocabulary",
        [
          w.id,
          "know",
          10,
          `e2000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
          "learn",
          null,
        ],
        ["uuid", "text", "integer", "uuid", "text", "text"],
      );
    assert.ok(
      (await call("refresh_study_plan")).tasks.find(
        (t) => t.id === vocabTask.id,
      )?.completed_at,
    );
    const intelligence = await call("learning_metrics");
    assert.ok(intelligence.streak >= 1);
    assert.ok(intelligence.longest_streak >= intelligence.streak);
    await role(other);
    assert.equal(
      (await db.query("select * from public.study_plan_tasks")).rows.length,
      0,
    );
    await assert.rejects(call("start_study_task", [task.id], ["uuid"]));
    await assert.rejects(
      call("study_task_vocabulary", [vocabTask.id], ["uuid"]),
    );
    assert.equal(
      (await call("question_mistakes", ["{}", 0], ["jsonb", "integer"])).total,
      0,
    );
    await role(student);
    await db.exec("reset role");
    await db.query(
      "update public.study_plan_tasks set study_date=study_date-interval '1 day' where id=$1",
      [task.id],
    );
    await role(student);
    const preserved = await call("refresh_study_plan");
    assert.ok(
      preserved.tasks.some((t) => t.id === task.id && t.completed_at),
      "past completed days survive replanning",
    );
    await role(other);
    assert.equal(
      (await db.query("select * from public.vocabulary_progress")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(call("question_bank", ["{}"], ["jsonb"]));
    await assert.rejects(db.exec("select * from public.vocabulary_words"));
  } finally {
    await db.close();
  }
});

test("local grammar extraction requires complete numbering and agreement between key and worked solutions", () => {
  const questions = Array.from(
    { length: 41 },
    (_, i) =>
      `${i + 1} GRAMMAR\nA supplied sentence.\nWhich choice completes the text?\nA. first\nB. second\nC. third\nD. fourth`,
  ).join("\n\n");
  const keys = Array.from({ length: 41 }, (_, i) => `${i + 1}. B`).join(" "),
    solutions = Array.from(
      { length: 41 },
      (_, i) => `Q${i + 1} Answer: B. The supplied explanation.`,
    ).join("\n\n");
  const text = `\nPractice Section\n${questions}\nAnswer Key\n${keys}\nWorked Solutions\n${solutions}`;
  const result = parseGrammar(text, "Fixture.pdf");
  assert.deepEqual(result.errors, []);
  assert.equal(result.payload.topics[0].questions.length, 41);
  assert.equal(
    result.payload.topics[0].questions[0].difficulty,
    "unclassified",
  );
  assert.ok(
    parseGrammar(
      text.replace("Q11 Answer: B.", "Q11 Answer: C."),
      "Fixture.pdf",
    ).errors.some((e) => e.includes("Question 11")),
  );
});
