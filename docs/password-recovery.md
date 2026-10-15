# Password recovery configuration and local verification

The browser uses Supabase's [PKCE password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), `exchangeCodeForSession`, and `updateUser({ password })`. No custom reset tokens or privileged browser keys are used. Open the email in the browser and origin that requested it so the SDK can use its PKCE verifier. Recovery codes are removed from the URL; recovery forms verify the current user with Auth and expire their local UI authorization after 15 minutes or the session expiry, whichever comes first. Supabase remains the authority for token validity and password updates.

Before a separately approved production release, inspect **Supabase Dashboard → Authentication → URL Configuration**:

- Site URL: `https://sat-chi.netlify.app`
- Additional Redirect URLs: `https://sat-chi.netlify.app/reset-password`, `http://localhost:5173/reset-password`, `http://127.0.0.1:5173/reset-password`.
- Add the exact `/reset-password` URL for any other approved local development origin; `localhost` and `127.0.0.1` are different origins. The disposable test Auth server configures its randomly allocated loopback origin automatically. Do not add a broad production wildcard.
- Preserve existing signup and OAuth redirects.

Under **Authentication → Email Templates → Reset Password**, verify that the template's link uses `{{ .ConfirmationURL }}`. Under **Authentication → Email / SMTP Settings**, enable and verify the intended SMTP provider, sender address/domain and delivery credentials, then verify recovery email rate limits and expiry in the Auth settings. These are external settings: this task does not read or change the hosted dashboard and does not assert that hosted SMTP is configured. Never put SMTP credentials or a service-role key into Vite variables.

The isolated recovery regression uses real **Supabase Auth v2.197.0**, its own disposable database in local PostgreSQL 17, and an in-memory loopback SMTP sink. It provisions only `*.fixture.invalid` accounts and never sends real mail. Message bodies, recovery links, tokens and passwords are not printed or saved. Ordinary platform tests continue to use synthetic Auth unless `realAuth` is explicitly requested.

The pinned Linux AMD64 Auth archive is available from the [official v2.197.0 release](https://github.com/supabase/auth/releases/tag/v2.197.0). Extract it, including `migrations/`, to `~/.cache/satchi-test-tools/auth2197/` or set `SATCHI_TEST_AUTH_BIN` to the extracted `auth` executable. Native test commands and tool locations are documented in the platform report.

Hosted delivery, provider credentials, spam placement and the hosted redirect allowlist require a later authorized release check. A successful local reset does not establish hosted email delivery.
