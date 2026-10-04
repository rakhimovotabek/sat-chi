import { contentFixture, bookId, sessionId } from "./content.js";
const uid = "d0000000-0000-0000-0000-000000000010";
export async function learningFixture(page, role = "student") {
  const store = await contentFixture(page, role);
  store.groups = [];
  store.members = [];
  store.progress = [];
  store.homework = [];
  store.dailyTemplates = [];
  store.dailyRows = [];
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
  store.typedTests = [];
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
    /\/rest\/v1\/(groups|group_members|profiles|vocabulary_books|vocabulary_sets|vocabulary_words|vocabulary_passages|vocabulary_progress|vocabulary_questions|rpc\/(daily_homework_templates|daily_homework_directory|daily_homework_report|daily_homework_statistics|save_daily_homework|set_daily_homework_state|start_daily_homework|practice_analytics|practice_question_analytics|start_vocabulary_typed_test|vocabulary_typed_history|vocabulary_typed_test|answer_vocabulary_typed_test|finish_vocabulary_typed_test|refresh_study_plan|save_study_preferences|start_study_task|study_task_vocabulary|question_mistakes|practice_mistake|vocabulary_catalog|question_bank_facets|vocabulary_book_detail|set_vocabulary_publication|question_bank|start_bank_practice|create_homework|homework_directory|start_homework|learning_metrics|learning_standings|admin_overview|group_summary|start_vocabulary_test|start_vocabulary_practice|vocabulary_summary|vocabulary_pool|review_vocabulary|star_vocabulary|import_vocabulary))(\?|$)/;
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
    if (table === "question_bank" || table === "question_bank_facets") {
      const f = body.p_filters || {};
      const rows = store.questions.filter(
        (q) =>
          (!f.section || q.section === f.section) &&
          (!f.domain || q.domain === f.domain) &&
          (!f.book || f.book === bookId) &&
          (!f.difficulty || q.difficulty === f.difficulty) &&
          (table === "question_bank_facets" ||
            !(f.domains?.length || f.skills?.length) ||
            f.domains?.includes(q.domain) ||
            f.skills?.some(
              (s) => s.domain === q.domain && s.skill === q.skill,
            )),
      );
      if (table === "question_bank_facets") {
        const groups = new Map();
        for (const q of rows) {
          const key = JSON.stringify([q.section, q.domain, q.skill]);
          const entry = groups.get(key) || {
            section: q.section,
            domain: q.domain,
            skill: q.skill,
            count: 0,
          };
          entry.count++;
          groups.set(key, entry);
        }
        return json([...groups.values()]);
      }
      return json({
        count: rows.length,
        rows: rows.map((q) => ({
          ...q,
          book_title: "SAT Book",
          topic_title: "Algebra",
        })),
      });
    }
    if (table === "vocabulary_catalog") {
      const rows = store.vocabBooks
        .filter(
          (b) =>
            (role === "admin" || b.published) &&
            b.title.toLowerCase().includes((body.p_search || "").toLowerCase()),
        )
        .slice(body.p_page * 50, body.p_page * 50 + 50);
      return json(
        rows.map((b) => {
          const sets = store.sets.filter((s) => s.book_id === b.id),
            words = store.words.filter((w) =>
              sets.some((s) => s.id === w.set_id),
            );
          return {
            ...b,
            set_count: sets.length,
            word_count: words.length,
            mastered_count: words.filter((w) =>
              store.progress.some(
                (p) => p.word_id === w.id && p.mastery_state === "mastered",
              ),
            ).length,
          };
        }),
      );
    }
    if (table === "vocabulary_book_detail") {
      const book = store.vocabBooks.find((b) => b.id === body.p_book);
      if (!book || (role !== "admin" && !book.published))
        return json({ message: "Book unavailable" }, 403);
      const sets = store.sets
        .filter((s) => s.book_id === book.id)
        .map((s) => ({
          ...s,
          words: store.words.filter((w) => w.set_id === s.id).length,
          passages: store.passages.filter((p) => p.set_id === s.id).length,
          exercises: store.tests.filter((q) => q.set_id === s.id).length,
        }));
      return json({
        book,
        sets,
        ...(role === "admin"
          ? {
              pending: book.pending || 0,
              state: book.archived
                ? "archived"
                : book.published
                  ? "published"
                  : book.pending
                    ? "needs_review"
                    : "draft",
              eligible:
                sets.length > 0 &&
                sets.every((s) => s.words > 0) &&
                !book.pending,
            }
          : {}),
      });
    }
    if (table === "set_vocabulary_publication") {
      if (role !== "admin") return json({ message: "Admin required" }, 403);
      const book = store.vocabBooks.find((b) => b.id === body.p_book);
      book.published = body.p_state === "published";
      book.archived = body.p_state === "archived";
      return json(null);
    }
    if (table === "start_bank_practice")
      return json(
        start("bank", "Question Bank practice", {
          timed: body.p_timed,
          time_limit: body.p_timed ? 270 : null,
        }),
      );
    if (table === "daily_homework_templates") return json(store.dailyTemplates);
    if (table === "save_daily_homework") {
      const id = body.p_template || `daily-${counter++}`;
      const old = store.dailyTemplates.find((t) => t.id === id);
      const t = {
        id,
        data: body.p_data,
        timezone: body.p_data.timezone,
        state: old?.state || (body.p_data.active ? "active" : "paused"),
        all_students: body.p_data.allStudents,
        students: body.p_data.students,
        groups: body.p_data.groups,
        revision: (old?.revision || 0) + 1,
        valid_from: body.p_data.startDate,
        pool_count: store.questions.length,
      };
      if (old) Object.assign(old, t);
      else store.dailyTemplates.push(t);
      return json(id);
    }
    if (table === "set_daily_homework_state") {
      store.dailyTemplates.find((t) => t.id === body.p_template).state =
        body.p_state;
      return json(null);
    }
    const dailyRows = () =>
      store.dailyRows.map((r) => {
        if (
          store.dailySessionKey !== `${r.template_id}-${r.study_date}` ||
          !store.session
        )
          return r;
        const answered = store.items.filter(
          (i) => i.selected_answer != null,
        ).length;
        const completed =
          store.session.submitted_at && answered === r.question_count;
        return {
          ...r,
          session_id: store.session.id,
          session_submitted_at: store.session.submitted_at,
          answered,
          active_seconds: store.session.elapsed_seconds,
          completed_at: completed ? store.session.submitted_at : null,
          correct: store.items.filter((i) => i.correct).length,
          status: completed
            ? r.is_today
              ? "Completed"
              : "Completed late"
            : !r.is_today
              ? "Missed"
              : "In progress",
        };
      });
    if (table === "daily_homework_directory") {
      const rows = dailyRows().filter(
        (r) =>
          (!body.p_template || r.template_id === body.p_template) &&
          (!body.p_from || r.study_date >= body.p_from) &&
          (!body.p_until || r.study_date <= body.p_until),
      );
      return json({
        total: rows.length,
        rows: rows.slice((body.p_page || 0) * 50, (body.p_page || 0) * 50 + 50),
      });
    }
    if (table === "daily_homework_report")
      return json(
        store.dailyReport || {
          today: store.dailyTemplates.map((t) => ({
            template_id: t.id,
            assigned: dailyRows().filter(
              (r) => r.is_today && r.template_id === t.id,
            ).length,
            completed: dailyRows().filter(
              (r) => r.is_today && r.template_id === t.id && r.completed_at,
            ).length,
          })),
          history: [],
          students: [],
          student_total: 0,
        },
      );
    if (table === "daily_homework_statistics")
      return json(
        store.dailyStats || {
          assigned: 0,
          completed: 0,
          missed_days: 0,
          current_streak: 0,
          longest_streak: 0,
          completion_rate: null,
          accuracy: null,
          average_seconds: null,
        },
      );
    if (table === "start_daily_homework") {
      const key = `${body.p_template}-${body.p_day}`;
      if (store.dailySessionKey === key && store.session)
        return json(store.session.id);
      const row = store.dailyRows.find(
        (r) => r.template_id === body.p_template && r.study_date === body.p_day,
      );
      store.dailySessionKey = key;
      return json(start("homework", row.title));
    }
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
    if (table === "refresh_study_plan")
      return json(store.plan || { preferences: null, tasks: [] });
    if (table === "save_study_preferences") {
      store.plan = {
        preferences: {
          minutes_per_day: body.p_minutes,
          preferred_days: body.p_days,
        },
        today: new Date().toISOString().slice(0, 10),
        tasks: [
          {
            id: "plan-task",
            study_date: new Date().toISOString().slice(0, 10),
            slot: 0,
            kind: "questions",
            title: "Targeted Algebra",
            minutes: 15,
            target_count: 5,
            completed_at: null,
          },
        ],
      };
      return json(null);
    }
    if (table === "start_study_task")
      return json({ session_id: start("bank", "Study Plan practice") });
    if (table === "study_task_vocabulary")
      return json({ total: store.words.length, words: store.words });
    if (table === "question_mistakes")
      return json({
        total: (store.mistakes || []).length,
        items: store.mistakes || [],
      });
    if (table === "practice_mistake")
      return json(start("bank", "Review a question mistake"));
    if (table === "practice_analytics")
      return json(
        store.analytics || {
          practiced: 0,
          solved: 0,
          unresolved: 0,
          areas: [],
          activity: [],
        },
      );
    if (table === "practice_question_analytics")
      return json(store.questionAnalytics || { total: 0, rows: [] });
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
      if (table === "vocabulary_books" && req.method() === "GET") {
        const title = (url.searchParams.get("title") || "")
          .replace(/^ilike\./, "")
          .replace(/%/g, "")
          .toLowerCase();
        const matched = rows.filter(
          (r) =>
            (role === "admin" || r.published) &&
            r.title.toLowerCase().includes(title),
        );
        const offset = Number(url.searchParams.get("offset") || 0),
          limit = Number(url.searchParams.get("limit") || 50);
        return json(matched.slice(offset, offset + limit));
      }
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
    if (table === "vocabulary_summary")
      return json({
        total: store.words.length,
        learned: store.progress.filter((p) => p.mastery_state !== "new").length,
        mastered: 0,
        due: 0,
        starred: store.progress.filter((p) => p.starred).length,
        successful: store.progress.reduce(
          (n, p) => n + (p.successful_recalls || 0),
          0,
        ),
        failed: store.progress.reduce((n, p) => n + (p.failed_recalls || 0), 0),
        study_seconds: 0,
        sets: store.sets.map((s) => ({
          set_id: s.id,
          total: store.words.filter((w) => w.set_id === s.id).length,
          learned: 0,
          mastered: 0,
          reviewing: 0,
          new: store.words.filter((w) => w.set_id === s.id).length,
        })),
      });
    if (table === "vocabulary_pool") {
      const words = store.words
        .filter(
          (w) =>
            (!body.p_sets.length || body.p_sets.includes(w.set_id)) &&
            (!body.p_search ||
              (w.word + " " + w.definition).includes(body.p_search)),
        )
        .map((w) => ({
          ...w,
          progress: store.progress.find((p) => p.word_id === w.id),
          source_sets: [w.set_id],
          set_title: store.sets.find((s) => s.id === w.set_id)?.title,
        }))
        .filter(
          (w) =>
            body.p_filter === "all" ||
            (body.p_filter === "starred" && w.progress?.starred) ||
            (body.p_filter === "due" && w.progress?.next_review) ||
            (body.p_filter === "weak" && w.progress?.failed_recalls >= 2),
        );
      return json({
        total: words.length,
        words: words.slice(body.p_page * 100, body.p_page * 100 + 100),
      });
    }
    if (table === "star_vocabulary") {
      let p = store.progress.find((p) => p.word_id === body.p_word);
      if (!p) {
        p = { word_id: body.p_word, mastery_state: "new" };
        store.progress.push(p);
      }
      p.starred = body.p_starred;
      return json(null);
    }
    if (table === "review_vocabulary") {
      let p = store.progress.find((p) => p.word_id === body.p_word);
      if (!p) {
        p = {
          word_id: body.p_word,
          review_count: 0,
          successful_recalls: 0,
          failed_recalls: 0,
        };
        store.progress.push(p);
      }
      const word = store.words.find((w) => w.id === body.p_word);
      const correct =
        body.p_mode === "typed"
          ? body.p_answer.trim().toLowerCase() === word.word.toLowerCase()
          : ["good", "easy", "know"].includes(body.p_rating);
      p.mastery_state = correct ? "learning" : "review";
      p.review_count = (p.review_count || 0) + 1;
      const recallField = correct ? "successful_recalls" : "failed_recalls";
      p[recallField] = (p[recallField] || 0) + 1;
      p.next_review = new Date(Date.now() + 86400000).toISOString();
      p.study_seconds = (p.study_seconds || 0) + body.p_seconds;
      return json({ progress: p, correct });
    }
    if (table === "start_vocabulary_typed_test") {
      const retry = store.typedTests.find((t) => t.id === body.p_retry);
      const words = retry
        ? retry.items.filter((i) => i.correct === false).map((i) => i.word)
        : store.words.filter(
            (w) => !body.p_sets?.length || body.p_sets.includes(w.set_id),
          );
      const selected = body.p_count ? words.slice(0, body.p_count) : words;
      const test = {
        id: `typed-${counter++}`,
        title: "Typed vocabulary recall",
        created_at: new Date().toISOString(),
        submitted_at: null,
        item_count: selected.length,
        study_seconds: 0,
        items: selected.map((w, i) => ({
          id: `typed-item-${counter++}`,
          position: i,
          word: w,
          question: {
            definition: w.definition,
            set_title: "Set 1",
            source_sets: [w.set_id],
          },
          correct: null,
          selected_text: null,
          answered_at: null,
        })),
      };
      store.typedTests.push(test);
      return json(test.id);
    }
    if (table === "vocabulary_typed_history")
      return json(
        store.typedTests
          .map((t) => ({
            ...t,
            answered: t.items.filter((i) => i.answered_at).length,
            correct: t.items.filter((i) => i.correct).length,
          }))
          .reverse(),
      );
    if (
      [
        "vocabulary_typed_test",
        "answer_vocabulary_typed_test",
        "finish_vocabulary_typed_test",
      ].includes(table)
    ) {
      const t = store.typedTests.find((t) => t.id === body.p_session);
      if (table === "answer_vocabulary_typed_test") {
        const i = t.items.find((i) => i.id === body.p_item);
        if (!i.answered_at) {
          i.selected_text = body.p_answer;
          i.correct = body.p_answer.trim().toLowerCase() === i.word.word;
          i.answered_at = new Date().toISOString();
          t.study_seconds += body.p_seconds;
        }
        return json({
          correct: i.correct,
          word: i.word.word,
          example: i.word.example,
        });
      }
      if (table === "finish_vocabulary_typed_test")
        t.submitted_at ||= new Date().toISOString();
      const rows = t.items.filter(
        (i) => !body.p_mistakes || i.correct === false,
      );
      return json({
        session: {
          id: t.id,
          title: t.title,
          created_at: t.created_at,
          submitted_at: t.submitted_at,
          item_count: t.item_count,
          study_seconds: t.study_seconds,
        },
        answered: t.items.filter((i) => i.answered_at).length,
        correct: t.items.filter((i) => i.correct).length,
        incorrect: t.items.filter((i) => i.correct === false).length,
        total: rows.length,
        next_position: t.items.find((i) => !i.answered_at)?.position ?? null,
        mastered: 0,
        items: rows
          .slice((body.p_page || 0) * 100, (body.p_page || 0) * 100 + 100)
          .map(({ word, ...i }) => ({
            ...i,
            feedback:
              i.answered_at || t.submitted_at
                ? { word: word.word, example: word.example }
                : {},
          })),
      });
    }
    if (table === "start_vocabulary_practice")
      return json(start("vocabulary", "Selected sets · Test"));
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
