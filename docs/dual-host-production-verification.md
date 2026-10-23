# Dual-host production verification

The application release `2eb75608526b807ee1ea752a8cf4d58f7a524b41` is deployed on
both existing projects. Application changes are `deaf38e` (trusted authentication
redirects and Vercel SPA rewrite) and `97a429c` (permission-safe Question Bank
selector). Subsequent release documentation changes do not change the frontend
artifact; both hosts must retain the same verified asset hashes.

| Host | Deployment verified |
| --- | --- |
| [Netlify](https://sat-chi.netlify.app) | `6ad9fc0afd584a47f187539c`, ready, matching release commit |
| [Vercel](https://satchi.vercel.app) | `Ezf5MirBhrNk59uxWCH5RhTAaHzJ`, successful GitHub deployment status |

Twenty production route/asset responses match the recorded clean-build SHA-256
values. Direct `/login`, `/dashboard`, `/auth/callback` and `/reset-password`
requests return the SPA on both hosts. No additional hosting project was created.

## Authentication root cause and configuration

The old deployed frontend already requested the correct Vercel callback. The
observed host change happened inside Supabase: its running Auth service rejected
the Vercel URL despite the stored allowlist containing that exact URL, then used
the Netlify Site URL fallback before any frontend callback navigation. Later fresh
requests accepted both exact callbacks without another configuration mutation or
HTTP 544 retry. The internal propagation failure and its precise resolution time
remain unverified. A successful stored readback alone was not treated as proof.

The original Site URL and all 16 existing redirect entries remain intact. Exact
production callback, recovery and confirmation URLs are present. Google, signup,
email confirmation and nonce checks retain their intended settings. Google's
provider callback remains the Supabase `/auth/v1/callback`; provider credentials,
existing accounts and sessions were not replaced. No Auth configuration write,
service restart or migration occurred in the unblock/resume follow-up.

Fresh deployed-frontend browser probes verified origin-aware `redirect_to`, S256
PKCE, the Supabase provider callback and exact cancelled-flow return URLs on both
hosts. Actual Google sign-in was separately completed by the user, who confirmed:
**“Both work and show my progress.”** This verifies both starting-origin returns
and the existing account/progress loading; browser sessions remain separate.

## Focused authenticated results

New disposable student/admin accounts exercised the real production UI and API:

- Student and admin email/password login on both sites, with matching user UUIDs.
- SAT'chi Bank Check, saved answers, marked state, source switching and reloads.
- Book Practice Check and durable answers after reload and fresh email login.
- Answers/marks created on Vercel loaded unchanged through Netlify.
- One Homework assigned only to the disposable student, submitted through the UI,
  viewed on both hosts and shown in authenticated admin results.
- College Board source selection/filter persistence, Math and Reading & Writing,
  unknown counts, disabled local practice and the official external link.
- College Board mobile layout at 390×844; desktop checks at 1400×950.

No uncaught browser errors or failed HTTP responses occurred in the completed
probe. An earlier probe attempted to mark a one-question session after its correct
Check had already completed it; the server correctly rejected a submitted-session
write. The probe was corrected to mark before Check and accept the normal
Submitted state. This was a harness correction, with no application/schema change.
No platform-wide accessibility, performance or unrelated feature audit was run.

Recovery requests use each starting origin's `/reset-password` with S256 PKCE;
invalid links fail closed on both production routes. The outbound recovery-request
check intercepted delivery, so it does not establish production email delivery.
Custom SMTP is not configured. Real PKCE recovery/password update was previously
verified in isolated Auth with a local mail sink; production inbox delivery and a
complete production password change remain unverified.

Build, lint and focused authentication tests passed before publication. The
copyright authorization/import preflight's nine synthetic cases passed again on
resume, without reading restricted question content.

## Cleanup, access and content

Only two fixture accounts, their five practice sessions and one fixture-only
Homework were removed, after checking their exact identifiers, fixture email/name
markers and assignment recipient. Follow-up reads found no fixture profiles,
sessions or Homework remaining. Existing students, answers and accounts were not
modified. Normal access remained available throughout; signup remains enabled.
No maintenance change, database migration or new database backup was performed.
All 82 existing migrations were left untouched.

Both original Desktop PDFs still match their recorded SHA-256 hashes. Neither
PDF, question text, choices, answer keys nor explanations were imported, uploaded
or bundled. Written rights covering the proposed processing/publication methods
remain unverified. Existing official-labeled books were not relabeled as licensed
College Board content. The request to add all College Board questions therefore
awaits verified authorization; PDF page counts do not establish question totals
or complete Question Bank coverage.

Sanitized configuration/routing evidence is checked in at
[dual-host-auth-routing-verification.json](dual-host-auth-routing-verification.json).
Production runtime, hosting, user-confirmation and cleanup evidence is retained
outside Git in `/home/otabek/satchi-release-backups/dual-host-release-20261022`.
Private credentials and test-account details are excluded from this report.
