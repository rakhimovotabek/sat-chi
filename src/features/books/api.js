import { bookSavePayload, bookSaveError } from "./book-save.js";
import { resolveCovers } from "./cover-assets.js";
import { supabase } from "../../lib/supabase.js";
async function checked(
  request,
  message = "Could not load content. Check your connection and try again.",
) {
  const { data, error } = await request;
  if (error)
    throw new Error(
      error.code === "23505"
        ? "This content has already been imported."
        : message,
    );
  return data;
}
export async function getBookCatalog(page = 0, search = "") {
  const title = search.replace(/[%_\\]/g, "").trim();
  const { data, count, error } = await supabase
    .from("books")
    .select(
      "id,title,description,category,cover_url,cover_path,published,created_at",
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
    books: await resolveCovers(data, supabase),
    total: count ?? data.length,
  };
}
export async function getBook(id) {
  const book = await checked(
    supabase.from("books").select("*").eq("id", id).single(),
    "This book is unavailable.",
  );
  return (await resolveCovers([book], supabase))[0];
}
export const getTopics = (book) =>
  checked(
    supabase
      .from("book_topics")
      .select("*,questions(count)")
      .eq("book_id", book)
      .order("position")
      .order("id"),
  );
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
  return { session, items, review };
}
export const savePractice = (id, items) =>
  checked(
    supabase.rpc("save_book_practice", {
      p_session_id: id,
      p_answers: items.map(({ id, selected_answer, marked, eliminated }) => ({
        id,
        selected_answer,
        marked,
        eliminated,
      })),
    }),
    "Could not save your answers. Try again before leaving.",
  );
export const finishPractice = (id) =>
  checked(
    supabase.rpc("finish_book_practice", { p_session_id: id }),
    "Could not submit practice. Your saved answers remain available.",
  );
