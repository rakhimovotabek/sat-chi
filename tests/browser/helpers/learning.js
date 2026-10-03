import { contentFixture, bookId, sessionId } from "./content.js";
const uid = "d0000000-0000-0000-0000-000000000010";
export async function learningFixture(page, role = "student") {
  const store = await contentFixture(page, role);
  store.groups = [];
  store.members = [];
  store.progress = [];
  store.homework = [];
  store.vocabBooks = [
    { id: "vbook", title: "Vocabulary Source", published: true },
  ];
  store.sets = [{ id: "vset", book_id: "vbook", title: "Set 1", position: 0 }];
  store.words = ["abate", "candid", "diligent", "prudent"].map((word, i) => ({
    id: `word-${i}`,
    set_id: "vset",
    word,
    definition: [
      "become less intense",
      "honest",
      "careful and persistent",
      "wise and careful",
    ][i],
    example: `The learner was ${word}.`,
    position: i,
  }));
  store.tests = [];
  store.passages = [
    {
      id: "passage",
      set_id: "vset",
      title: "Supplied passage",
      passage: "Be candid and prudent as worries abate.",
    },
  ];
  let counter = 0;
  const start = (kind, title = "Focused practice", extra = {}) => {
    store.session = {
      id: sessionId,
      student_id: uid,
      title,
      kind,
      started_at: new Date(
        Date.now() - (store.forceExpired ? 300000 : 0),
      ).toISOString(),
      submitted_at: null,
      current_position: 0,
      elapsed_seconds: 0,
      ...extra,
    };
    store.items = store.questions.map((q, i) => ({
      id: `item-${i}`,
      position: i,
      session_id: sessionId,
      question: Object.fromEntries(
        Object.entries(q).filter(([k]) => k !== "question_answers"),
      ),
      selected_answer: null,
      marked: false,
      eliminated: [],
      correct: null,
    }));
    return sessionId;
  };
  store.assign = () =>
    (store.homework = [
      {
        id: "hw",
        assignment_id: "assignment",
        student_id: uid,
        title: "October practice",
        instructions: "Work through both sections.",
        due_at: new Date(Date.now() + 86400000).toISOString(),
        timed: false,
        sections: [{ title: "Math", count: 3 }],
        session_id: null,
        submitted_at: null,
      },
    ]);
  const regex =
    /\/rest\/v1\/(groups|group_members|profiles|vocabulary_books|vocabulary_sets|vocabulary_words|vocabulary_passages|vocabulary_progress|vocabulary_questions|rpc\/(question_bank|start_bank_practice|create_homework|homework_directory|start_homework|learning_metrics|learning_standings|admin_overview|group_summary|start_vocabulary_test|import_vocabulary))(\?|$)/;
  await page.route(regex, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      table = url.pathname.split("/").pop(),
      body = req.postData() ? req.postDataJSON() : null;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    };
    const json = (data) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify(data),
      });
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    store.requests.push({ path: url.pathname, method: req.method(), body });
    if (table === "profiles") {
      if (url.searchParams.get("role") !== "eq.student")
        return route.fallback();
      return json([
        {
          id: uid,
          display_name: "Fixture Learner",
          role: "student",
          active: true,
          current_sat_score: 1200,
          target_sat_score: 1450,
        },
      ]);
    }
    if (table === "groups") {
      if (req.method() === "POST")
        store.groups.push({ id: `group-${counter++}`, ...body });
      if (req.method() === "PATCH")
        Object.assign(
          store.groups.find((g) => `eq.${g.id}` === url.searchParams.get("id")),
          body,
        );
      if (req.method() === "DELETE")
        store.groups = store.groups.filter(
          (g) => `eq.${g.id}` !== url.searchParams.get("id"),
        );
      return json(store.groups);
    }
    if (table === "group_members") {
      if (req.method() === "POST")
        store.members.push({
          id: `member-${counter++}`,
          ...body,
          profiles: { display_name: "Fixture Learner" },
        });
      if (req.method() === "DELETE")
        store.members = store.members.filter(
          (m) => `eq.${m.id}` !== url.searchParams.get("id"),
        );
      return json(store.members);
    }
    if (table === "group_summary")
      return json({
        members: store.members.length,
        questions: 0,
        study_seconds: 0,
        completed: 0,
      });
    if (table === "question_bank") {
      const f = body.p_filters;
      const rows = store.questions.filter(
        (q) =>
          (!f.section || q.section === f.section) &&
          (!f.domain || q.domain === f.domain) &&
          (!f.book || f.book === bookId),
      );
      return json({
        count: rows.length,
        rows: rows.map((q) => ({
          ...q,
          book_title: "SAT Book",
          topic_title: "Algebra",
        })),
      });
    }
    if (table === "start_bank_practice")
      return json(
        start("bank", "Question Bank practice", {
          timed: body.p_timed,
          time_limit: body.p_timed ? 270 : null,
        }),
      );
    if (table === "create_homework") {
      store.homework.push({
        id: `homework-${counter++}`,
        assignment_id: `assignment-${counter++}`,
        student_id: uid,
        display_name: "Fixture Learner",
        title: body.p_data.title,
        instructions: body.p_data.instructions,
        due_at: body.p_data.dueAt,
        sections: body.p_data.sections,
        timed: body.p_data.timed,
      });
      return json(store.homework.at(-1).id);
    }
    if (table === "homework_directory")
      return json(
        store.homework.map((row) => ({
          ...row,
          session_id:
            store.session?.kind === "homework" ? store.session.id : null,
          submitted_at:
            store.session?.kind === "homework"
              ? store.session.submitted_at
              : null,
        })),
      );
    if (table === "start_homework") {
      if (store.session?.kind === "homework") return json(store.session.id);
      const id = start("homework", store.homework[0].title);
      store.items.forEach(
        (i, n) =>
          (i.question.homework_section = n < 2 ? "Algebra" : "Mixed practice"),
      );
      return json(id);
    }
    if (table === "learning_metrics")
      return json({
        attempted: store.session?.submitted_at
          ? store.items.filter((i) => i.selected_answer != null).length
          : 0,
        correct: store.items.filter((i) => i.correct).length,
        incorrect: 0,
        today: 0,
        study_seconds: store.session?.elapsed_seconds || 0,
        homework_total: store.homework.length,
        homework_completed:
          store.session?.kind === "homework" && store.session.submitted_at
            ? 1
            : 0,
        vocabulary_known: store.progress.filter((p) => p.status === "known")
          .length,
        groups: store.groups,
        activity: [],
        breakdowns: [],
      });
    if (table === "learning_standings")
      return json([
        {
          id: uid,
          display_name: "Fixture Learner",
          questions: 0,
          correct: 0,
          study_seconds: 0,
          homework: 0,
        },
      ]);
    if (table === "admin_overview")
      return json({
        students: 1,
        groups: store.groups.length,
        assignments: store.homework.length,
        completed: 0,
        questions: 0,
        activity: [],
      });
    if (
      [
        "vocabulary_books",
        "vocabulary_sets",
        "vocabulary_words",
        "vocabulary_passages",
        "vocabulary_questions",
      ].includes(table)
    ) {
      const key = {
        vocabulary_books: "vocabBooks",
        vocabulary_sets: "sets",
        vocabulary_words: "words",
        vocabulary_passages: "passages",
        vocabulary_questions: "tests",
      }[table];
      if (req.method() === "POST")
        store[key].push({ id: `vocab-${counter++}`, ...body });
      if (req.method() === "PATCH")
        Object.assign(
          store[key].find((r) => `eq.${r.id}` === url.searchParams.get("id")),
          body,
        );
      if (req.method() === "DELETE")
        store[key] = store[key].filter(
          (r) => `eq.${r.id}` !== url.searchParams.get("id"),
        );
      const rows = store[key].filter((r) =>
        [...url.searchParams].every(
          ([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3),
        ),
      );
      return json(
        table === "vocabulary_sets" && url.searchParams.has("id")
          ? rows[0]
          : rows,
      );
    }
    if (table === "vocabulary_progress") {
      if (req.method() === "POST") {
        store.progress = store.progress.filter(
          (p) => p.word_id !== body.word_id,
        );
        store.progress.push(body);
      }
      return json(store.progress);
    }
    if (table === "start_vocabulary_test")
      return json(start("vocabulary", "Set 1 · Test"));
    if (table === "import_vocabulary") {
      store.vocabBooks.push({
        id: `vocab-${counter++}`,
        title: body.p_payload.title,
        published: false,
      });
      return json(store.vocabBooks.at(-1).id);
    }
    return route.fallback();
  });
  return store;
}
