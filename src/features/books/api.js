import { bookSavePayload, bookSaveError } from "./book-save.js";
import { resolveCovers } from "./cover-assets.js";
import { supabase } from "../../lib/supabase.js";
async function checked(
  request,
  message = "Could not load content. Check your connection and try again.",
) {
  const { data, error } = await request;
  if (error)
    throw Object.assign(
      new Error(
        error.code === "PGRST202"
          ? "Saving is unavailable on this server. Your answers have not been saved to the server. Ask an administrator to update it, then retry saving."
          : error.code === "PT409" || error.code === "40001"
            ? error.message
            : error.code === "23505"
              ? "This content has already been imported."
              : message,
      ),
      { code: error.code },
    );
  return data;
}
export async function getBookCatalog(page = 0, search = "") {
  const title = search.replace(/[%_\\]/g, "").trim();
  const { data, count, error } = await supabase
    .from("books")
    .select(
      "id,title,description,category,cover_url,cover_path,published,created_at,book_topics(questions(count))",
      {
        count: "exact",
      },
    )
    .ilike("title", `%${title}%`)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 50, page * 50 + 49);
  if (error)
    throw new Error(
      "Could not load books. Check your connection and try again.",
    );
  return {
    books: await resolveCovers(
      data.map((book) => ({
        ...book,
        ...(Array.isArray(book.book_topics)
          ? {
              topic_count: book.book_topics.length,
              question_count: book.book_topics.reduce(
                (total, t) => total + (t.questions?.[0]?.count || 0),
                0,
              ),
            }
          : {}),
      })),
      supabase,
    ),
    total: count ?? data.length,
  };
}
// Select controls need book labels, not nested question counts or signed covers.
export async function getBookOptions(page = 0, search = "") {
  const { data, count, error } = await supabase
    .from("books")
    .select("id,title", { count: "exact" })
    .ilike("title", `%${search.replace(/[%_\\]/g, "").trim()}%`)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 50, page * 50 + 49);
  if (error) throw new Error(`Could not load books: ${error.message}`);
  return { books: data || [], total: count || 0 };
}
export async function getBookOption(id) {
  const { data, error } = await supabase
    .from("books")
    .select("id,title")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Could not load book: ${error.message}`);
  return data;
}
export async function getBook(id) {
  const book = await checked(
    supabase.from("books").select("*").eq("id", id).single(),
    "This book is unavailable.",
  );
  return (await resolveCovers([book], supabase))[0];
}
export async function getTopics(book) {
  const [topics, progress] = await Promise.all([
    checked(
      supabase
        .from("book_topics")
        .select("*,questions(count)")
        .eq("book_id", book)
        .order("position")
        .order("id"),
    ),
    checked(supabase.rpc("book_practice_progress", { p_book: book })),
  ]);
  return topics.map((t) => ({
    ...t,
    progress: progress.find((p) => p.topic_id === t.id),
  }));
}
export async function saveBook(values, id) {
  const payload = bookSavePayload(values);
  const { data, error } = await (id
    ? supabase.from("books").update(payload).eq("id", id).select().single()
    : supabase.from("books").insert(payload).select().single());
  if (error) throw new Error(bookSaveError(error));
  return data;
}
export const deleteBook = (id) =>
  checked(
    supabase.from("books").delete().eq("id", id),
    "Could not delete this book.",
  );
export const saveTopic = (values, id) =>
  checked(
    id
      ? supabase
          .from("book_topics")
          .update(values)
          .eq("id", id)
          .select()
          .single()
      : supabase.from("book_topics").insert(values).select().single(),
    "Could not save the topic. Check its name and parent topic.",
  );
export const deleteTopic = (id) =>
  checked(
    supabase.from("book_topics").delete().eq("id", id),
    "Could not delete this topic.",
  );
export async function getQuestions(topic, page = 0) {
  const { data, count, error } = await supabase
    .from("questions")
    .select("*,question_answers(correct_answer,explanation)", {
      count: "exact",
    })
    .eq("topic_id", topic)
    .order("position")
    .order("id")
    .range(page * 50, page * 50 + 49);
  if (error)
    throw new Error(
      "Could not load questions. Check your connection and try again.",
    );
  return { rows: data || [], count: count ?? data?.length ?? 0 };
}
export const saveQuestion = (topic, payload, id = null) =>
  checked(
    supabase.rpc("save_book_question", {
      p_topic_id: topic,
      p_payload: payload,
      p_question_id: id,
    }),
    "Could not save the question. Check its fields and try again.",
  );
export const deleteQuestion = (id) =>
  checked(
    supabase.from("questions").delete().eq("id", id),
    "Could not delete this question.",
  );
export const importContent = (payload, topic = null) =>
  checked(
    supabase.rpc("import_book_content", {
      p_payload: payload,
      p_topic_id: topic,
    }),
    "Import failed. Nothing was imported. Check your JSON and connection.",
  );
export const startPractice = (topic) =>
  checked(
    supabase.rpc("start_book_practice", { p_topic_id: topic }),
    "Could not start practice. Choose a published topic with 1–500 questions.",
  );
export async function getPractice(id) {
  const session = await checked(
    supabase.from("book_practice_sessions").select("*").eq("id", id).single(),
    "Practice is unavailable.",
  );
  const items = await checked(
    supabase
      .from("book_practice_items")
      .select("*")
      .eq("session_id", id)
      .order("position"),
  );
  let review = [];
  if (session.submitted_at)
    review = await checked(
      supabase.rpc("review_book_practice", { p_session_id: id }),
    );
  if (
    ["book", "bank", "homework"].includes(session.kind) &&
    session.submitted_at &&
    items.some((i) => i.question.question_type === "open")
  ) {
    const openReview = await checked(
      supabase.rpc("book_practice_open_review", { p_session: id }),
    );
    review = review.map((r) => ({
      ...r,
      ...openReview.find((o) => o.item_id === r.item_id),
    }));
  }
  const attempts = ["bank", "book"].includes(session.kind)
    ? await checked(
        supabase
          .from("question_check_attempts")
          .select("*")
          .in(
            "item_id",
            items.map((i) => i.id),
          )
          .order("attempt_order"),
      )
    : [];
  return {
    session,
    items: items.map((i) => ({
      ...i,
      attempts: attempts.filter((a) => a.item_id === i.id),
    })),
    review,
  };
}
// Versioned, dirty-item-only saves return explicit server acknowledgements.
export async function savePracticeChanges(id, changes) {
  const { data, error } = await supabase.rpc("save_practice_changes", {
    p_session: id,
    p_changes: changes,
  });
  if (error)
    throw Object.assign(
      new Error(
        error.code === "PGRST202"
          ? "Saving is unavailable on this server. Your pending answers are kept on this device. Ask an administrator to update the server before retrying."
          : error.code === "PT409" || error.code === "40001"
            ? error.message
            : `Could not save your answers. ${error.message || "Retry saving."}`,
      ),
      { code: error.code },
    );
  return data;
}
export const finishPractice = (id) =>
  checked(
    supabase.rpc("finish_book_practice", { p_session_id: id }),
    "Could not submit practice. Your saved answers remain available.",
  );

export const checkBankAnswer = (session, item, choice, event) =>
  checked(
    supabase.rpc("check_bank_answer", {
      p_session: session,
      p_item: item,
      p_choice: choice,
      p_event: event,
    }),
    "Could not check your answer. Retry to save this attempt.",
  );

export const getBookExplanation = (session, item) =>
  checked(
    supabase.rpc("book_practice_explanation", {
      p_session: session,
      p_item: item,
    }),
    "Could not load the explanation. Check your connection and try again.",
  );

export const checkBankResponse = (session, item, response, event) =>
  checked(
    supabase.rpc("check_bank_response", {
      p_session: session,
      p_item: item,
      p_response: response,
      p_event: event,
    }),
    "Could not check your answer. Retry to save this attempt.",
  );

export const checkBookAnswer = (session, item, choice, event) =>
  checked(
    supabase.rpc("check_book_practice_answer", {
      p_session: session,
      p_item: item,
      p_choice: choice,
      p_event: event,
    }),
    "Could not check your answer. Retry to save this attempt.",
  );

export const checkBookResponse = (session, item, response, event) =>
  checked(
    supabase.rpc("check_book_practice_response", {
      p_session: session,
      p_item: item,
      p_response: response,
      p_event: event,
    }),
    "Could not check your answer. Retry to save this attempt.",
  );
