import { learningDatabase, admin, student } from "./database.js";

export async function openReviewDatabase(
  kind = "homework",
  submitted = true,
  range = null,
  response = "9",
) {
  const fixture = await learningDatabase();
  const { db, role, call, book } = fixture;
  let session;
  if (kind === "homework") {
    await role(admin);
    await call(
      "create_homework",
      [
        JSON.stringify({
          title: "Disposable response review",
          dueAt: "2026-12-01T12:00:00Z",
          students: [student],
          sections: [{ title: "Math", count: 2, filters: {} }],
        }),
      ],
      ["jsonb"],
    );
    await role(student);
    session = await call(
      "start_homework",
      [(await call("homework_directory"))[0].assignment_id],
      ["uuid"],
    );
  } else if (kind === "bank") {
    session = await call(
      "start_bank_practice",
      ["{}", 2, false],
      ["jsonb", "integer", "boolean"],
    );
  } else {
    const topic = (
      await db.query(
        "select id from public.book_topics where book_id=$1 limit 1",
        [book],
      )
    ).rows[0].id;
    session = await call("start_book_practice", [topic], ["uuid"]);
  }
  await db.exec(
    "reset role;update public.profiles set onboarding_completed=true,display_name='Disposable Reviewer'",
  );
  const items = (
    await db.query(
      "select * from public.book_practice_items where session_id=$1 order by position",
      [session],
    )
  ).rows;
  const item = items[0].id,
    mcq = items[1].id;
  await db.query(
    'update public.book_practice_items set question=question||\'{"question_type":"open","options":[],"question_text":"Enter 8.6"}\'::jsonb where id=$1',
    [item],
  );
  await db.query(
    "update public.book_practice_keys set correct_answer=null where item_id=$1",
    [item],
  );
  await db.query(
    "insert into public.book_practice_open_keys(item_id,accepted_answers,correct_answer,answer_format) values($1,'[\"8.6\",\"43/5\"]','8.6','numeric')",
    [item],
  );
  if (range)
    await db.query(
      "update public.book_practice_open_keys set accepted_answers='[]',correct_answer=null,answer_format='numeric-range',accepted_range=$2::jsonb where item_id=$1",
      [item, JSON.stringify(range)],
    );
  await role(student);
  await call(
    "save_practice_changes",
    [
      session,
      JSON.stringify([
        {
          id: item,
          selected_answer: 0,
          selected_response: response,
          expected_revision: 0,
        },
      ]),
    ],
    ["uuid", "jsonb"],
  );
  if (submitted) await call("finish_book_practice", [session], ["uuid"]);
  return { ...fixture, session, item, mcq };
}
