import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function isHttpUrl(value) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(url && anonKey && isHttpUrl(url));

// A missing configuration leaves the login screen available with setup guidance.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      global: { headers: { "x-satchi-client-version": "20261008" } },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    })
  : null;

export async function googleSignInAvailable() {
  if (!isSupabaseConfigured) return false;
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anonKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Could not check sign-in availability.");
  const settings = await response.json();
  return settings.external?.google === true;
}
