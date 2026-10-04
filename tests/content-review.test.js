import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { buildImportSql } from "../scripts/imports/import-sql.js";
test("content review enforces admin ownership, actual counts, persistent edits, explicit approval and audit history", async () => {
  const db = new PGlite(),
    admin = "f0000000-0000-0000-0000-000000000001",
    student = "f0000000-0000-0000-0000-000000000002";
  const role = (id) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  const call = async (name, args = [], casts = []) =>
    (
      await db.query(
        `select public.${name}(${args.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) result`,
        args,
      )
    ).rows[0].result;
  const q = {
    type: "mcq",
    question: "Which number matches the value twelve?",
    options: ["3", "6", "9", "12"],
    correctAnswer: 3,
    source: "Synthetic.pdf",
    source_page: 7,
    import_metadata: { source_number: 1, extraction_method: "embedded_bbox" },
  };
  try {
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;`,
    );
    for (const f of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    await db.exec(
      `insert into auth.users(id)values('${admin}'),('${student}');update public.profiles set role='admin' where id='${admin}';`,
    );
    const r = {
      fingerprint: "c".repeat(64),
      source_file: "Synthetic.pdf",
      title: "Synthetic source",
      source_type: "book",
      source_path: "Synthetic.pdf",
      status: "validated",
      category: "Math",
      detected_topics: 1,
      detected_questions: 2,
      imported_count: 0,
      skipped_count: 1,
      needs_review_count: 1,
      parser_version: "synthetic1",
      warnings: ["Manual visual region"],
      errors: [],
      review_items: [
        {
          number: 2,
          page: 8,
          reasons: ["OCR uncertain; source image requires review"],
          candidate: {
            ...q,
            question: "Which number is fifteen?",
            source_page: 8,
            source_number: 2,
          },
        },
      ],
    };
    await db.exec(
      buildImportSql(r, {
        book: { title: r.title, category: "Math", published: false },
        topics: [{ title: "Practice", questions: [q] }],
      }),
    );
    const firstBook = (await db.query("select book_id from public.import_jobs"))
      .rows[0].book_id;
    await db.exec(
      buildImportSql(
        { ...r, parser_version: "synthetic2" },
        {
          book: { title: r.title, category: "Math", published: false },
          topics: [
            {
              title: "Practice",
              questions: [
                {
                  ...q,
                  import_metadata: {
                    ...q.import_metadata,
                    parser_version: "synthetic2",
                  },
                },
              ],
            },
          ],
        },
      ),
    );
    assert.equal(
      (await db.query("select count(*) n from public.books")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*) n from public.book_topics")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select book_id from public.import_jobs")).rows[0]
        .book_id,
      firstBook,
    );
    await role(admin);
    let overview = await call("content_review_overview");
    assert.equal(overview.sources, 1);
    assert.equal(overview.questions, 1);
    assert.equal(overview.awaiting_review, 1);
    assert.equal(overview.ready, 1);
    assert.equal(overview.audit, 1);
    const sources = await call("content_review_sources");
    assert.equal(sources.rows[0].question_count, 1);
    assert.equal(sources.rows[0].outcome, "imported_review");
    const source = sources.rows[0].id;
    let queue = await call(
      "content_review_queue",
      [source, "question", "pending", "OCR"],
      ["uuid", "text", "text", "text"],
    );
    assert.equal(queue.total, 1);
    const excluded = queue.rows[0].id;
    queue = await call(
      "content_review_queue",
      [source, "question", "pending", ""],
      ["uuid", "text", "text", "text"],
    );
    const clean = queue.rows.find((r) => r.entity_id).id;
    let detail = await call("content_review_detail", [clean], ["uuid"]);
    assert.equal(detail.payload.source_page, 7);
    assert.equal(detail.payload.import_metadata.source_number, 1);
    await assert.rejects(
      call(
        "update_content_review",
        [clean, "edit", { ...q, correctAnswer: 5 }, "", detail.updated_at],
        ["uuid", "text", "jsonb", "text", "timestamptz"],
      ),
      /answer/,
    );
    await assert.rejects(
      call(
        "update_content_review",
        [
          clean,
          "edit",
          { ...q, question: "Which choice correctly describes the graph?" },
          "",
          detail.updated_at,
        ],
        ["uuid", "text", "jsonb", "text", "timestamptz"],
      ),
      /essential source/,
    );
    await assert.rejects(
      call(
        "update_content_review",
        [
          clean,
          "edit",
          { ...q, question: "Which choice defines the underlined word?" },
          "",
          detail.updated_at,
        ],
        ["uuid", "text", "jsonb", "text", "timestamptz"],
      ),
      /underlining/,
    );
    await call(
      "update_content_review",
      [
        clean,
        "edit",
        {
          ...q,
          question: "Which number matches twelve exactly?",
          source_page: 9,
        },
        "Corrected wording",
        detail.updated_at,
      ],
      ["uuid", "text", "jsonb", "text", "timestamptz"],
    );
    await assert.rejects(
      call(
        "update_content_review",
        [clean, "approve", null, "", detail.updated_at],
        ["uuid", "text", "jsonb", "text", "timestamptz"],
      ),
      /changed/,
    );
    detail = await call("content_review_detail", [clean], ["uuid"]);
    assert.equal(detail.payload.source_page, 9);
    assert.match(detail.payload.question, /exactly/);
    assert.equal(detail.status, "pending");
    await assert.rejects(
      db.query("update public.books set published=true where id=$1", [
        sources.rows[0].book_id,
      ]),
      /Review/,
    );
    await call(
      "update_content_review",
      [clean, "approve", null, "Verified printed key", detail.updated_at],
      ["uuid", "text", "jsonb", "text", "timestamptz"],
    );
    await db.query("update public.books set published=true where id=$1", [
      sources.rows[0].book_id,
    ]);
    detail = await call("content_review_detail", [excluded], ["uuid"]);
    await assert.rejects(
      call(
        "update_content_review",
        [excluded, "approve", null, "", detail.updated_at],
        ["uuid", "text", "jsonb", "text", "timestamptz"],
      ),
      /warnings/,
    );
    await call(
      "update_content_review",
      [
        excluded,
        "duplicate",
        null,
        "Confirmed source repeat",
        detail.updated_at,
      ],
      ["uuid", "text", "jsonb", "text", "timestamptz"],
    );
    assert.equal((await call("content_review_overview")).duplicates || 0, 0); // Unimported candidates remain audit-only.
    detail = await call("content_review_detail", [excluded], ["uuid"]);
    await call(
      "update_content_review",
      [excluded, "reject", null, "Unrecoverable image", detail.updated_at],
      ["uuid", "text", "jsonb", "text", "timestamptz"],
    );
    assert.ok(
      (await db.query("select * from public.content_review_audit")).rows.some(
        (r) => r.action === "reject" && r.actor === admin,
      ),
    );
    assert.equal(
      (await db.query("select * from public.import_runs")).rows.length,
      2,
    );
    await db.exec("reset role;");
    const vocabReport = {
      ...r,
      fingerprint: "d".repeat(64),
      source_type: "vocabulary",
      source_file: "Synthetic vocabulary.pdf",
      title: "Synthetic vocabulary",
      review_items: [],
      detected_vocabulary_sets: 1,
      detected_words: 1,
      detected_questions: 1,
      needs_review_count: 0,
    };
    const sourceExercise = {
      question: "Which word completes the supplied sentence?",
      options: ["bright", "slow", "faint", "narrow"],
      correctAnswer: 0,
      questionType: "sentence_completion",
      sourcePage: 13,
      source: "Synthetic vocabulary.pdf",
    };
    await db.exec(
      buildImportSql(vocabReport, {
        title: "Synthetic vocabulary",
        sets: [
          {
            title: "Set 1",
            source_page: 9,
            words: [
              { word: "bright", definition: "full of light", source_page: 9 },
            ],
            passage: "The lamps were bright throughout the evening.",
            questions: [sourceExercise],
          },
        ],
      }),
    );
    await role(admin);
    const vsource = (await call("content_review_sources")).rows.find(
      (s) => s.title === "Synthetic vocabulary",
    ).id;
    const exercise = (
      await call(
        "content_review_queue",
        [vsource, "exercise"],
        ["uuid", "text"],
      )
    ).rows[0];
    assert.equal(exercise.source_page, 13);
    let ed = await call("content_review_detail", [exercise.id], ["uuid"]);
    await call(
      "update_content_review",
      [
        exercise.id,
        "edit",
        {
          ...ed.payload,
          question: "Which word correctly completes this sentence?",
        },
        "Corrected prompt",
        ed.updated_at,
      ],
      ["uuid", "text", "jsonb", "text", "timestamptz"],
    );
    ed = await call("content_review_detail", [exercise.id], ["uuid"]);
    assert.equal(ed.payload.questionType, "sentence_completion");
    assert.equal(ed.payload.sourcePage, 13);
    assert.equal(
      (
        await call(
          "content_review_queue",
          [vsource, "passage"],
          ["uuid", "text"],
        )
      ).rows[0].source_page,
      null,
    );
    const triage = await call(
      "content_review_triage_queue",
      [vsource, "human"],
      ["uuid", "text"],
    );
    assert.equal(triage.total, 1);
    assert.match(triage.rows[0].reason, /passage source page/);
    let bulk = await call("content_review_bulk", [vsource], ["uuid"]);
    assert.equal(bulk.count, 2); // Word + keyed exercise; unknown passage page excluded.
    assert.equal(bulk.excluded.human, 1);
    const stale = bulk.safe;
    await call(
      "update_content_review",
      [
        exercise.id,
        "edit",
        { ...ed.payload, question: "Which word completes the final sentence?" },
        "Corrected source wording",
        ed.updated_at,
      ],
      ["uuid", "text", "jsonb", "text", "timestamptz"],
    );
    await assert.rejects(
      call(
        "content_review_bulk",
        [vsource, null, null, stale],
        ["uuid", "uuid[]", "uuid", "jsonb"],
      ),
      /inventory changed/,
    );
    bulk = await call("content_review_bulk", [vsource], ["uuid"]);
    const approved = await call(
      "content_review_bulk",
      [vsource, null, null, bulk.safe],
      ["uuid", "uuid[]", "uuid", "jsonb"],
    );
    assert.equal(approved.approved, 2);
    assert.equal(
      (await db.query("select published from public.vocabulary_books")).rows[0]
        .published,
      false,
    );
    assert.equal(
      (
        await call(
          "content_review_triage_queue",
          [vsource, "human"],
          ["uuid", "text"],
        )
      ).total,
      1,
    );
    assert.equal(
      (
        await call(
          "content_review_triage_queue",
          [source, "audit"],
          ["uuid", "text"],
        )
      ).total,
      1,
    );
    await call(
      "content_review_source_action",
      [source, "retry", "Retry with source-specific layout adapter"],
      ["uuid", "text", "text"],
    );
    assert.ok(
      (
        await db.query("select action from public.content_review_audit")
      ).rows.some((r) => r.action === "source_retry"),
    );
    await role(student);
    await call(
      "save_account_settings",
      ["Study Learner", 45, "UTC"],
      ["text", "integer", "text"],
    );
    assert.equal(
      (
        await db.query("select display_name from public.profiles where id=$1", [
          student,
        ])
      ).rows[0].display_name,
      "Study Learner",
    );
    assert.equal(
      (await db.query("select minutes_per_day from public.study_preferences"))
        .rows[0].minutes_per_day,
      45,
    );
    await assert.rejects(
      call(
        "save_account_settings",
        ["Learner", 0, "UTC"],
        ["text", "integer", "text"],
      ),
      /Invalid/,
    );
    await role(admin);
    await assert.rejects(
      call(
        "save_account_settings",
        ["Admin", 30, "UTC"],
        ["text", "integer", "text"],
      ),
      /Invalid/,
    );
    await role(student);

    for (const table of [
      "content_review_items",
      "content_review_audit",
      "import_runs",
    ])
      assert.equal(
        (await db.query("select * from public." + table)).rows.length,
        0,
      );
    for (const [name, args, casts] of [
      ["content_review_overview", [], []],
      ["content_review_sources", [], []],
      ["content_review_triage_queue", [], []],
      ["content_review_bulk", [], []],
      [
        "content_review_source_action",
        [source, "retry", "Please retry this source"],
        ["uuid", "text", "text"],
      ],
      ["content_review_detail", [clean], ["uuid"]],
      [
        "update_content_review",
        [clean, "approve", null, "", detail.updated_at],
        ["uuid", "text", "jsonb", "text", "timestamptz"],
      ],
    ])
      await assert.rejects(call(name, args, casts), /Administrator/);
    await assert.rejects(
      db.query("update public.content_review_items set status='approved'"),
      /permission denied/,
    );
    await assert.rejects(
      call(
        "write_book_question",
        [null, q, null, null],
        ["uuid", "jsonb", "uuid", "integer"],
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
