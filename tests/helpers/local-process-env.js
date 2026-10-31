// Child services must not inherit hosted Supabase/PostgREST/PG/Auth settings.
export function localProcessEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        !/^(?:PG|PGRST_|SUPABASE_|GOTRUE_|VITE_SUPABASE_|DATABASE_URL$|API_EXTERNAL_URL$|PORT$)/.test(
          key,
        ),
    ),
  );
}
