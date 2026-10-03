import { supabase } from "../../lib/supabase.js";
export async function checked(
  request,
  message = "Could not load learning data. Check your connection and try again.",
) {
  const { data, error } = await request;
  if (error)
    throw new Error(
      error.code === "23505" ? "This entry already exists." : message,
    );
  return data;
}
export const rpc = (name, args = {}) => checked(supabase.rpc(name, args));
export const groups = () =>
  checked(supabase.from("groups").select("*").order("name"));
export const members = (id) =>
  checked(
    supabase
      .from("group_members")
      .select("id,student_id,profiles(display_name,username,active)")
      .eq("group_id", id)
      .limit(100),
  );
export const searchStudents = (search = "") =>
  checked(
    supabase
      .from("profiles")
      .select(
        "id,display_name,username,active,current_sat_score,target_sat_score",
      )
      .eq("role", "student")
      .eq("active", true)
      .ilike("display_name", `%${search.replace(/[%_\\]/g, "")}%`)
      .order("display_name")
      .limit(50),
  );
export const saveGroup = (name, id) =>
  checked(
    id
      ? supabase.from("groups").update({ name }).eq("id", id)
      : supabase.from("groups").insert({ name }),
  );
export const removeGroup = (id) =>
  checked(supabase.from("groups").delete().eq("id", id));
export const addMember = (group_id, student_id) =>
  checked(supabase.from("group_members").insert({ group_id, student_id }));
export const removeMember = (id) =>
  checked(supabase.from("group_members").delete().eq("id", id));
export const bank = (filters, page = 0) =>
  rpc("question_bank", { p_filters: filters, p_page: page });
export const startBank = (filters, count, timed) =>
  rpc("start_bank_practice", {
    p_filters: filters,
    p_count: count,
    p_timed: timed,
  });
export const homework = () => rpc("homework_directory");
export const createHomework = (data) =>
  rpc("create_homework", { p_data: data });
export const startHomework = (id) =>
  rpc("start_homework", { p_assignment: id });
export const metrics = (student) =>
  rpc("learning_metrics", student ? { p_student: student } : {});
export const overview = () => rpc("admin_overview");
export const standings = (group) =>
  rpc("learning_standings", { p_group: group });
export const heartbeat = (session, position, seconds) =>
  rpc("practice_heartbeat", {
    p_session: session,
    p_position: position,
    p_seconds: seconds,
  });
export const importJobs = () =>
  checked(
    supabase
      .from("import_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
  );
export const vocabBooks = () =>
  checked(
    supabase
      .from("vocabulary_books")
      .select("*")
      .order("created_at", { ascending: false }),
  );
export const vocabSets = (book) =>
  checked(
    supabase
      .from("vocabulary_sets")
      .select("*")
      .eq("book_id", book)
      .order("position"),
  );
export async function vocabSet(id) {
  const [set, words, passages] = await Promise.all([
    checked(supabase.from("vocabulary_sets").select("*").eq("id", id).single()),
    checked(
      supabase
        .from("vocabulary_words")
        .select("*")
        .eq("set_id", id)
        .order("position")
        .limit(100),
    ),
    checked(supabase.from("vocabulary_passages").select("*").eq("set_id", id)),
  ]);
  const progress = words.length
    ? await checked(
        supabase
          .from("vocabulary_progress")
          .select("*")
          .in(
            "word_id",
            words.map((w) => w.id),
          ),
      )
    : [];
  return { set, words, passages, progress };
}
export const saveVocabProgress = (student, word, status) =>
  checked(
    supabase.from("vocabulary_progress").upsert({
      student_id: student,
      word_id: word,
      status,
      updated_at: new Date().toISOString(),
    }),
  );
export const deleteVocabBook = (id) =>
  checked(supabase.from("vocabulary_books").delete().eq("id", id));
export const importVocab = (payload) =>
  rpc("import_vocabulary", { p_payload: payload });
export const startVocab = (id, mode) =>
  rpc("start_vocabulary_test", { p_set: id, p_imported: mode === "test" });
