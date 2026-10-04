import { supabase } from "../../lib/supabase.js";
// These admin/student RPCs return actionable validation errors, without private keys.
export async function dailyRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    throw new Error(
      error.message || "Could not load daily homework. Try again.",
    );
  return data;
}
export const dailyTemplates = () => dailyRpc("daily_homework_templates");
export const saveDailyHomework = (data, template) =>
  dailyRpc("save_daily_homework", {
    p_data: data,
    p_template: template || null,
  });
export const setDailyState = (template, state) =>
  dailyRpc("set_daily_homework_state", {
    p_template: template,
    p_state: state,
  });
export const dailyDirectory = (args = {}) =>
  dailyRpc("daily_homework_directory", args);
export const dailyReport = (args = {}) =>
  dailyRpc("daily_homework_report", args);
export const startDaily = (row) =>
  dailyRpc("start_daily_homework", {
    p_template: row.template_id,
    p_day: row.study_date,
  });
export const dailyStatistics = (student) =>
  dailyRpc("daily_homework_statistics", { p_student: student || null });
