import { expect } from "@playwright/test";
export const bookId = "d0000000-0000-0000-0000-000000000001",
  topicId = "d0000000-0000-0000-0000-000000000002",
  sessionId = "d0000000-0000-0000-0000-000000000003";
export const sampleQuestion = {
  type: "mcq",
  question: "Which value solves 2x = 8?",
  passage: "Consider the equation 2x = 8.",
  options: ["2", "4", "6", "8"],
  correctAnswer: 1,
  explanation: "Divide both sides by 2 to obtain x = 4.",
  difficulty: "easy",
};
export async function contentFixture(
  page,
  role = "student",
  { empty = false } = {},
) {
  const id = "d0000000-0000-0000-0000-000000000010";
  let counter = 100;
  const uuid = () =>
    `d0000000-0000-0000-0000-${String(counter++).padStart(12, "0")}`;
  const store = {
    books: [],
    topics: [],
    questions: [],
    session: null,
    items: [],
    review: [],
    requests: [],
  };
  const makeQuestion = (payload, topic_id) => ({
    id: uuid(),
    topic_id,
    question_text: payload.question,
    passage: payload.passage || "",
    stimulus: payload.stimulus || "",
    options: payload.options,
    image_url: payload.imageUrl || null,
    stimulus_table: payload.table || null,
    section: "Math",
    domain: payload.domain || "Algebra",
    difficulty: payload.difficulty || "medium",
    source: payload.source || "",
    skill: payload.skill || "",
    position: store.questions.length,
    question_answers: {
      correct_answer: payload.correctAnswer,
      explanation: payload.explanation || "",
    },
  });
  if (!empty) {
    store.books = [
      {
        id: bookId,
        title: "SAT Book",
        description: "A test-fixture library.",
        category: "Math",
        published: true,
      },
    ];
    store.topics = [
      {
        id: topicId,
        book_id: bookId,
        parent_id: null,
        title: "Algebra",
        position: 0,
      },
    ];
    store.questions = [
      makeQuestion(sampleQuestion, topicId),
      makeQuestion(
        { ...sampleQuestion, question: "A second equation question." },
        topicId,
      ),
      makeQuestion(
        { ...sampleQuestion, question: "A third equation question." },
        topicId,
      ),
    ];
  }
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.test",
    user_metadata: {},
    app_metadata: { provider: "email" },
    created_at: "2026-10-03T00:00:00Z",
  };
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
    refresh_token: "test-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      body = req.postData() ? req.postDataJSON() : null;
    store.requests.push({ path: url.pathname, method: req.method(), body });
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Expose-Headers": "content-range",
    };
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/auth/v1/token") return json(session);
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname === "/rest/v1/profiles")
      return json([
        {
          id,
          role,
          active: true,
          display_name: "Fixture Learner",
          onboarding_completed: true,
          target_sat_score: 1450,
          grade: "11",
          main_goal: "Improve Math",
          target_test_date: store.satDate || null,
        },
      ]);
    const filter = (list) =>
      list.filter((row) =>
        [...url.searchParams].every(([k, v]) =>
          v.startsWith("ilike.")
            ? String(row[k] || "")
                .toLowerCase()
                .includes(v.slice(6).replace(/%/g, "").toLowerCase())
            : !v.startsWith("eq.") || String(row[k]) === v.slice(3),
        ),
      );
    const table = url.pathname.split("/").pop();
    if (table === "save_sat_date") {
      store.satDate = body.p_date;
      return json(null);
    }
    if (table === "book_review_summary") {
      const b = store.books.find((b) => b.id === body.p_book);
      return json({
        validated: store.review.filter((r) => r.status === "pending").length,
        human: 0,
        excluded: 0,
        duplicates: 0,
        approved: store.review.length
          ? store.review.filter((r) => r.status === "approved").length
          : store.questions.length,
        published: !!b?.published,
      });
    }
    if (table === "publish_approved_book") {
      store.books.find((b) => b.id === body.p_book).published = true;
      return json(null);
    }

    if (["books", "book_topics", "questions"].includes(table)) {
      const key = {
        books: "books",
        book_topics: "topics",
        questions: "questions",
      }[table];
      if (req.method() === "GET") {
        const rows = filter(store[key]).map((r) =>
          key === "topics"
            ? {
                ...r,
                questions: [
                  {
                    count: store.questions.filter((q) => q.topic_id === r.id)
                      .length,
                  },
                ],
              }
            : key === "books" &&
                url.searchParams.get("select")?.includes("book_topics")
              ? {
                  ...r,
                  book_topics: store.topics
                    .filter((t) => t.book_id === r.id)
                    .map((t) => ({
                      questions: [
                        {
                          count: store.questions.filter(
                            (q) => q.topic_id === t.id,
                          ).length,
                        },
                      ],
                    })),
                }
              : r,
        );
        if (
          key === "questions" ||
          (key === "books" && !url.searchParams.has("id"))
        ) {
          const offset = Number(url.searchParams.get("offset") || 0),
            limit = Number(url.searchParams.get("limit") || rows.length);
          return route.fulfill({
            status: 200,
            headers: {
              ...headers,
              "Content-Range": `${offset}-${Math.min(offset + limit, rows.length) - 1}/${rows.length}`,
            },
            contentType: "application/json",
            body: JSON.stringify(rows.slice(offset, offset + limit)),
          });
        }
        return json(
          url.searchParams.has("id") && key === "books" ? rows[0] : rows,
        );
      }
      if (req.method() === "POST") {
        const row = { id: uuid(), ...body };
        store[key].push(row);
        return json(row, 201);
      }
      if (req.method() === "PATCH") {
        const rows = filter(store[key]);
        Object.assign(rows[0], body);
        return json(rows[0]);
      }
      if (req.method() === "DELETE") {
        const ids = new Set(filter(store[key]).map((r) => r.id));
        store[key] = store[key].filter((r) => !ids.has(r.id));
        return route.fulfill({ status: 204, headers });
      }
    }
    if (table === "save_book_question") {
      const q = makeQuestion(body.p_payload, body.p_topic_id);
      if (body.p_question_id) {
        const old = store.questions.find((q) => q.id === body.p_question_id);
        Object.assign(old, { ...q, id: old.id });
        return json(old.id);
      }
      store.questions.push(q);
      return json(q.id);
    }
    if (table === "import_book_content") {
      if (body.p_topic_id) {
        body.p_payload.questions.forEach((q) =>
          store.questions.push(makeQuestion(q, body.p_topic_id)),
        );
        return json({
          book_id: store.topics.find((t) => t.id === body.p_topic_id).book_id,
          question_count: body.p_payload.questions.length,
        });
      }
      const b = {
        id: uuid(),
        ...body.p_payload.book,
        published: body.p_payload.book.published || false,
      };
      store.books.push(b);
      let n = 0;
      const topics = (list, parent = null) =>
        list.forEach((t, i) => {
          const topic = {
            id: uuid(),
            book_id: b.id,
            parent_id: parent,
            title: t.title,
            position: i,
          };
          store.topics.push(topic);
          (t.questions || []).forEach((q) => {
            store.questions.push(makeQuestion(q, topic.id));
            n++;
          });
          topics(t.children || [], topic.id);
        });
      topics(body.p_payload.topics);
      return json({ book_id: b.id, question_count: n });
    }
    if (table === "start_book_practice") {
      store.session = {
        id: sessionId,
        student_id: id,
        title: "Algebra",
        submitted_at: null,
        started_at: new Date().toISOString(),
        kind: "book",
        current_position: 0,
        elapsed_seconds: 0,
      };
      store.items = store.questions.map((q, i) => ({
        id: uuid(),
        session_id: sessionId,
        position: i,
        question: Object.fromEntries(
          Object.entries(q).filter(([key]) => key !== "question_answers"),
        ),
        selected_answer: null,
        marked: false,
        eliminated: [],
        correct: null,
      }));
      return json(sessionId);
    }
    if (table === "book_practice_sessions")
      return json(
        url.searchParams.has("id")
          ? store.session
          : store.session
            ? [store.session]
            : [],
      );
    if (table === "book_practice_items") return json(store.items);
    if (table === "question_check_attempts") return json(store.checks || []);
    if (table === "check_bank_answer") {
      store.checks ||= [];
      const item = store.items.find((i) => i.id === body.p_item);
      const answer = store.questions.find((q) => q.id === item.question.id)
        .question_answers.correct_answer;
      const attempt = {
        id: body.p_event,
        item_id: item.id,
        attempt_order:
          store.checks.filter((a) => a.item_id === item.id).length + 1,
        selected_answer: body.p_choice,
        correct: body.p_choice === answer,
        active_seconds: item.active_seconds || 0,
        created_at: new Date().toISOString(),
      };
      store.checks.push(attempt);
      Object.assign(item, {
        correct: attempt.correct,
        solved_at: attempt.correct ? attempt.created_at : null,
      });
      if (store.items.every((i) => i.solved_at))
        store.session.submitted_at = attempt.created_at;
      return json(attempt);
    }
    if (table === "practice_heartbeat") {
      store.session.current_position = body.p_position;
      store.session.elapsed_seconds += Math.min(120, body.p_seconds);
      const item = store.items.find((i) => i.position === body.p_position);
      if (item)
        item.active_seconds = (item.active_seconds || 0) + body.p_seconds;
      return json(store.session.elapsed_seconds);
    }
    if (table === "book_practice_explanation") {
      const item = store.items.find((i) => i.id === body.p_item);
      if (!item || (!item.has_answered && item.selected_answer == null))
        return json({ message: "Select an answer first" }, 403);
      return json({
        explanation: store.questions.find((q) => q.id === item.question.id)
          .question_answers.explanation,
      });
    }
    if (table === "save_book_practice") {
      body.p_answers.forEach((a) =>
        Object.assign(
          store.items.find((i) => i.id === a.id),
          a,
          {
            has_answered:
              store.items.find((i) => i.id === a.id).has_answered ||
              a.selected_answer != null ||
              Boolean(a.selected_response?.trim()),
          },
        ),
      );
      return json(null);
    }
    if (table === "finish_book_practice") {
      store.session.submitted_at = new Date().toISOString();
      store.items.forEach((item, i) => {
        item.correct =
          item.selected_answer ===
          store.questions[i].question_answers.correct_answer;
      });
      return json(null);
    }
    if (table === "review_book_practice") {
      expect(store.session.submitted_at).toBeTruthy();
      store.review = store.items.map((item, i) => ({
        item_id: item.id,
        ...store.questions[i].question_answers,
      }));
      return json(store.review);
    }
    return json({ message: "Unhandled fixture request" }, 400);
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(
    role === "admin" ? /admin\/dashboard$/ : /\/dashboard$/,
  );
  return store;
}
