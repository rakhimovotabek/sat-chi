// Supabase verifies the email before redirecting with a PKCE code. This notice
// is informational only: it never creates a session or grants access. Email
// confirmations intentionally leave the user on the password sign-in form;
// Google alone exchanges its code at /auth/callback.
export function emailConfirmationNotice(search, hash) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  if ([query, fragment].some((p) => p.has("error") || p.has("error_code")))
    return "error";
  if (query.get("code") || fragment.get("type") === "signup")
    return "success";
  return null;
}
