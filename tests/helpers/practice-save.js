// Existing lifecycle fixtures expressed sequential saves before CAS existed.
// Supply the version just read by that fixture, while keeping raw/new-protocol
// tests responsible for checking missing and stale versions explicitly.
export async function versionedFixtureArgs(db, name, args) {
  if (/^check_(bank|book_practice)_(answer|response)$/.test(name)) {
    const rows = (
      await db.query(
        "select i.*,s.submitted_at from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where i.id=$1 and i.session_id=$2",
        [args[1], args[0]],
      )
    ).rows;
    const item = rows[0],
      response = name.endsWith("response");
    const event = (
      await db.query(
        "select id from public.question_check_attempts where id=$1",
        [args[3]],
      )
    ).rows[0];
    if (
      !item ||
      event ||
      item.solved_at ||
      item.submitted_at ||
      (!response &&
        (!Number.isInteger(args[2]) ||
          args[2] < 0 ||
          args[2] > 3 ||
          item.eliminated.includes(args[2]))) ||
      (response &&
        (typeof args[2] !== "string" ||
          !args[2].trim() ||
          args[2].length > 200))
    )
      return args;
    if (
      response
        ? item.selected_response !== args[2]
        : item.selected_answer !== args[2]
    ) {
      const change = {
        id: item.id,
        expected_revision: item.answer_revision,
        selected_answer: response ? 0 : args[2],
        ...(response ? { selected_response: args[2] } : {}),
      };
      await db.query("select public.save_practice_changes($1,$2::jsonb)", [
        args[0],
        JSON.stringify([change]),
      ]);
    }
    return args;
  }
  if (name !== "save_book_practice" || args.length < 2) return args;
  const definition = (
    await db.query(
      "select prosrc from pg_proc where oid='public.save_book_practice(uuid,jsonb)'::regprocedure",
    )
  ).rows[0]?.prosrc;
  if (!definition?.includes("persist_practice_changes")) return args;
  let changes;
  try {
    changes = JSON.parse(args[1]);
  } catch {
    return args;
  }
  if (!Array.isArray(changes)) return args;
  for (const c of changes) {
    if (
      !c ||
      c.expected_revision !== undefined ||
      !/^[a-f0-9-]{36}$/i.test(c.id || "")
    )
      continue;
    const row = (
      await db.query(
        "select answer_revision from public.book_practice_items where id=$1",
        [c.id],
      )
    ).rows[0];
    c.expected_revision = row?.answer_revision || 0;
  }
  return [args[0], JSON.stringify(changes), ...args.slice(2)];
}
