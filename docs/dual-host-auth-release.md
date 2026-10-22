# Netlify and Vercel authentication release

**BLOCKED before GitHub push or hosting publication.** Prepared application commit:
`deaf38e09c59e05db4e864b99b2174b49a16a728`. The permission-safe source selector is
included in its ancestor `97a429c`.

Supabase returned successful configuration readbacks containing all required
exact redirects, but multiple fresh live Google authorization/cancellation probes
from `https://satchi.vercel.app` still returned to the Netlify Site URL. A later
configuration synchronization request returned HTTP **544**. No service restart,
Site URL replacement, wildcard expansion or insecure redirect workaround was
attempted. The release stopped under the user's explicit critical-auth-safeguard
rule. Google account authentication and authenticated production feature tests
were not run; the user should wait before attempting the final Google test.

Final readback confirmed the original Site URL, enabled signup/Google, every
original redirect, all intended exact production redirects and all other Auth
settings unchanged. The existing release gate remains `compatible` with zero
verification exemptions. Edge CORS probes passed for both production and local
origins and rejected an untrusted origin. No database migrations, verification
accounts, test Homework or practice records were created. Existing hosting
deployments remain active, and GitHub main was not pushed. Private configuration
snapshots and the final state are retained in the directory documented below.

Resume only when live callbacks demonstrably return to both starting origins;
configuration readback alone is insufficient. Then push the prepared verified
source, publish to the existing hosting projects, compare the built assets, run
the scoped production feature checks and ask the user to complete Google login
on each domain. Do not assume a successful cancelled flow proves actual Google
account sign-in or shared-progress loading.

Prepared 2026-10-22 for the existing GitHub `rakhimovotabek/sat-chi` main branch.
Targets are the existing Netlify site `02da050d-7e57-45c4-bb83-5de0660fbbf6`
and the existing Vercel project `rahimov-production/sat-chi`. No new hosting
project is required. Both production bundles were verified to use Supabase
`ileffhbbaomfimwulvpw`.

Production origins:

- `https://sat-chi.netlify.app`
- `https://satchi.vercel.app` (user-confirmed; root serves the same SAT'chi bundle)

The existing configured Vercel project alias
`https://sat-chi-rahimov-production.vercel.app` remains trusted. Its hosting
protection settings were not changed. Arbitrary preview domains are not trusted
by the application. Local loopback origins work only in development builds;
disposable local Auth environments configure their own ports independently.

## Diagnosis and changes

The existing Google component already supplied the current browser origin's
`/auth/callback`. Supabase's production redirect list lacked the exact callback
URLs for both public production sites, creating a Site URL fallback risk.
Vercel also returned 404 for direct `/login` and `/dashboard` requests despite
serving the app at `/`. The Supabase `manage-student` Edge Function rejected both
production origins because its CORS secret contained only two local origins.

The application now uses `trustedAuthRedirect` for Google, recovery and signup
confirmation. Destinations are chosen from the current verified origin and fixed
application routes; URL query parameters cannot select a destination. The
Supabase client still uses PKCE, persistent sessions, automatic refresh and
explicit callback exchange. Session/logout and recovery verification logic are
unchanged. `vercel.json` adds the SPA rewrite required for direct client routes;
Netlify retains its existing rewrite.

## Supabase configuration

The existing Site URL stays `https://sat-chi.netlify.app`. Signup remains enabled,
email confirmation remains required, Google remains enabled and nonce checking
remains enabled. Google client credentials and provider settings were not changed.
The Google provider redirect URI remains:

```text
https://ileffhbbaomfimwulvpw.supabase.co/auth/v1/callback
```

Preserve all existing redirect entries. Add exact `/auth/callback`, `/reset-password`
and `/login` URLs for each public production origin and the previously approved
`http://localhost:5173` and `http://127.0.0.1:5173` development origins.
Seven missing exact URLs were added; no new wildcard was introduced. Historical
Vercel redirect entries were retained rather than removed during this release.
Only `uri_allow_list` changed in the Auth configuration readback.

The existing CORS value was verified against its secret digest before mutation.
Both local origins were retained and the two production origins added. The Edge
Function implementation, authentication checks and release-gate requirement are
unchanged; untrusted origins must continue to receive 403. No wildcard is used.

This is Supabase-hosted redirect OAuth, not Google's JavaScript/One Tap flow.
No Google Cloud JavaScript-origin change is required by the implemented flow.
Google Cloud settings cannot be inferred from a Supabase configuration response;
real Google-account login remains a separate interactive verification.

## Release safeguards

All 82 repository migrations were already applied. No migration or database
schema change is part of this release, and no migration backup/cutover is needed.
Private before/after Auth configuration and the verified prior CORS value are
saved outside Git under
`/home/otabek/satchi-release-backups/dual-host-release-20261022` for rollback.
Restore only changed settings if necessary; do not reset unrelated provider,
signup, session or Site URL settings.

Normal release-gate mode was `compatible` with zero verification exemptions.
This additive redirect/CORS and frontend release does not require pausing writes
or signup. Existing user data is not migrated or rewritten. Production probes
must use newly created disposable verification accounts and remove only their
guarded records afterwards. Browser sessions remain separate across domains;
account identity and server-side progress are shared.

Only verified application commits, this authentication fix and the permission-safe
Question Bank selector are included. Existing unrelated book-import working-tree
changes are excluded. No Desktop PDF or College Board question content is bundled
or uploaded. College Board local practice remains disabled with the official link.

## Focused checks before publication

- 16 authentication unit cases passed: trusted redirects, unsafe URL rejection,
  confirmation, recovery validation and session lifecycle.
- 22 browser cases passed: PKCE callback/onboarding, email login, signup,
  logout/session refresh, student/admin routing, recovery errors and the source
  selector including saved answers and mobile layouts.
- Real isolated Supabase Auth PKCE email recovery passed against disposable local
  Auth/PostgreSQL/PostgREST and a local SMTP sink.
- Lint and production build passed. The release artifact must be built from a
  clean checkout of the committed revision and compared with both deployed hosts.

After publishing, verify deep routes, entry/chunk hashes, Supabase project,
Google authorization request/PKCE, a cancelled provider callback's return origin,
email login, source selector, Book/Bank practice and saved Check answers, Homework
and administrator access on both sites. Do not log tokens, passwords, provider
state or question/answer content. Real Google success and existing-account
progress require the user's interactive confirmation on each domain. Custom SMTP
is not configured, so isolated recovery success does not establish production
email delivery.
