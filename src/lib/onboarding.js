import { supabase } from "./supabase.js";
import { profilePayload, validateProfile } from "../auth/profile-fields.js";

export async function saveLearningProfile(values) {
  const validation = validateProfile(values);
  if (validation) throw new Error(validation);
  if (!supabase) throw new Error("Sign-in is not configured.");
  const { data, error } = await supabase.rpc("complete_onboarding", {
    payload: profilePayload(values),
  });
  if (error) {
    throw new Error(
      "Your profile could not be saved. Check your connection and try again.",
    );
  }
  return data;
}
