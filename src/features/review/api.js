import { supabase } from "../../lib/supabase.js";
export async function reviewRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(error.message || "Content review failed. Please retry.");
  return data;
}
export async function reviewHistory(table, source, page) {
  let request = supabase
    .from(table)
    .select("*,import_jobs(title,source_file)", { count: "exact" })
    .order(table === "import_runs" ? "recorded_at" : "happened_at", {
      ascending: false,
    })
    .order("id", { ascending: false })
    .range(page * 20, page * 20 + 19);
  if (source) request = request.eq("source_id", source);
  const { data, count, error } = await request;
  if (error) throw new Error("Could not load administrator history.");
  return { rows: data, total: count };
}
export const outcomeLabel = (o) =>
  ({
    imported: "Imported",
    imported_review: "Imported — needs review",
    partial: "Partially imported",
    manual: "Manual review required",
    unsupported: "Unsupported",
    failed: "Failed",
  })[o] || o;
