# SAT’chi

SAT learning platform using React, Vite, JavaScript, Supabase, and plain CSS. Includes secure student/admin workspaces, books and private covers, question practice, homework, a filtered Question Bank, vocabulary learning and multi-set study, study plans, progress, groups, settings, and administrator Content Review with validated bulk approval. Local PDF adapters preserve source provenance and private question visuals; imported content remains draft until reviewed and explicitly published.

## Frontend development

Use Node.js 22.12+ (22.x), or Node.js 24+ with npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Without configuration the public landing page remains available and authentication actions are disabled. Credentials are required to enter a workspace. Never put privileged Supabase keys into a `VITE_*` variable: Vite exposes those values in the browser bundle.

Commands:

- `npm run dev`: local development server.
- `npm run build`: production bundle in `dist/`.
- `npm run preview`: serve a previously built bundle.
- `npm test`: Edge Function authorization, validation, deletion, and compensation tests, using Node’s built-in test runner.
- `npm ci`: repeatable install from the lockfile.

Components use two-space indentation and PascalCase names. ESLint and Prettier are project-local: run `npm run lint`, `npm run format`, or the scoped `npm run format:check`. Browser verification uses `npm run test:e2e`; the complete unit/database suite uses `npm test`.

## Project structure

```text
src/
  auth/                 Auth context/provider and route guards
  components/           Navigation, headers, student form/table
  pages/auth/           Login and account-unavailable screens
  pages/student/        Student dashboard
  pages/admin/          Admin dashboard and real Students page
  layouts/              Separate student/admin layouts and shared shell
  lib/                  Supabase client, student services, route metadata
  hooks/                Auth and page-title hooks
  styles/               Plain CSS
supabase/
  config.toml           Local signup and Edge Function settings
  migrations/           Database schema, grants, triggers, and RLS
  functions/manage-student/  JavaScript Edge Function
  tests/security.sql    Transactional database security regression checks
tests/                  Node Edge Function tests
```

## Supabase setup: exact order

### 1. Create and configure a project

Create a new project in the Supabase Dashboard and save its project reference and database password securely. In Authentication, enable the email/password provider. Enable **Allow new users to sign up** and keep email confirmation enabled. Public registration always creates students; only trusted SQL can promote an administrator. `supabase/config.toml` enables public signup for local development too.

Under project API settings, locate the project URL and the legacy `anon` public key. This implementation uses the legacy `anon`/`service_role` keys, supported by Supabase. Never use `service_role` as the frontend anonymous key. Set Authentication’s Site URL to your frontend URL (initially `http://localhost:5173`; use your real domain later).

### 2. Link and apply the migrations

The checked-in `supabase/config.toml` is already initialized; do not run `supabase init` over it. Run from the repository root:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

Replace `YOUR_PROJECT_REF` with your own reference. Login/link may prompt for your access token and database password. Review the dry run before applying changes. This migration is intended for a new project without conflicting tables.

Alternatively, execute both migration files from `supabase/migrations/` in filename order in the trusted Dashboard SQL Editor: first `20261003000100_auth_groups_foundation.sql`, then `20261003000200_student_onboarding.sql`, then `20261003000300_books_questions_practice.sql`. Choose one migration method; manually applying SQL does not record CLI migration history. If switching to CLI later, reconcile history with the CLI’s migration repair command before pushing.

The migration creates `profiles`, `groups`, and `group_members`, profile provisioning on Auth inserts, active-role helpers, update safeguards, and RLS. Existing Auth users are backfilled as students. No account is automatically made admin.

### 3. Configure the frontend

In the root `.env` file, set only:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Restart Vite after editing. `.env` and nested local env files are ignored; `.env.example` contains only these two empty frontend-safe variables.

### 4. Create the first admin safely

In **Authentication → Users**, create the owner account for `rakh1movotabek576@gmail.com` using the password chosen privately by the owner. Never paste that password into SQL, source files, documentation, or frontend environment variables. Confirm the email using the Dashboard’s confirmation option or the normal verification flow. Copy that user’s UUID. Its trigger-created profile will initially be a student.

In the trusted **SQL Editor**, replace the UUID and execute:

```sql
update public.profiles
set role = 'admin', active = true, display_name = 'Platform Administrator'
where id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid
returning id, role, active;
```

Verify exactly one intended row is returned. Sign in at `/login`. If already signed in when the role changes, log out and sign in again. Role promotion/demotion is restricted to trusted SQL/server administration, including for browser admins; there is no public promotion RPC or signup role field.

### 5. Set Edge Function secrets and deploy

The server requires these environment values:

| Variable                    | Source                                      | Purpose                                           |
| --------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `SUPABASE_URL`              | Automatically injected by Supabase          | Project API                                       |
| `SUPABASE_ANON_KEY`         | Automatically injected legacy key           | Verify the caller with `auth.getUser(token)`      |
| `SUPABASE_SERVICE_ROLE_KEY` | Automatically injected legacy server secret | Admin Auth API and profile management             |
| `ALLOWED_ORIGINS`           | Set by you as an Edge Function secret       | Comma-separated frontend origins for browser CORS |

Supabase injects the reserved `SUPABASE_*` variables. Do not try to upload them with `supabase secrets set`, and do not copy them into the frontend `.env`. Check your project’s legacy key availability if the function reports missing configuration.

Set the custom secret and deploy:

```bash
npx supabase@latest secrets set ALLOWED_ORIGINS=http://localhost:5173 --project-ref YOUR_PROJECT_REF
npx supabase@latest functions deploy manage-student --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Use the exact origin printed by Vite: `localhost` and `127.0.0.1` differ. For multiple origins, use a quoted comma-separated value, for example your localhost origin and your actual deployed frontend origin. Origins must have no trailing slash. You can also set `ALLOWED_ORIGINS` through **Edge Functions → Secrets**.

`verify_jwt = false` disables the gateway’s legacy JWT check so the handler can support newer Auth signing keys. The function **still requires and validates a user Bearer token with Supabase Auth**, then checks the caller’s current database profile for `role = 'admin'` and `active = true`. Neither CORS nor frontend routing substitutes for this server authorization.

The JavaScript entrypoint is configured explicitly. The service client is created only on the server and is never imported by the frontend. New accounts have confirmed emails and the password supplied by the admin; this foundation does not send invitation emails or provide password-reset UI. Share initial credentials privately.

### 6. Verify the integration

As the admin, open `/admin/students`, create a student, confirm its profile appears, and sign in as that student in a separate browser session. Verify that manually visiting `/admin/students` redirects to `/dashboard` (or `/onboarding` if the student has not completed their learning profile), while refreshing a student route preserves the login session. Log out and verify all workspace URLs redirect to `/login`.

As admin, test deleting a disposable student account through the explicit confirmation step. Confirm the corresponding Auth user, profile, and group memberships are removed. Missing Edge Function deployment or secrets produces an actionable error rather than simulated success.

On October 3, 2026, migrations `20261003000100` and `20261003000200` were applied to the verified SAT’chi project `ileffhbbaomfimwulvpw`. The existing `manage-student` Edge Function was also deployed, with localhost and 127.0.0.1 port 5173 allowed for CORS. No owner password or Google credentials were supplied. See the public-auth setup below for the remaining provider and redirect configuration.

## Database authorization model

| Resource                             | Active student                     | Active admin                                          |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------- |
| Own profile                          | Read; update display name/username | Read; update display name/username                    |
| Other profiles                       | No access                          | Read all; update student display name/username/status |
| Profile ID, role, creation timestamp | No browser updates                 | No browser updates                                    |
| Profile create/delete                | No direct access                   | Through the server-only account function              |
| Groups                               | Read joined groups                 | Read/create/update/delete                             |
| Memberships                          | Read own memberships               | Read/create/update/delete student memberships         |

Inactive users can read only their own profile so the frontend can explain the disabled account; they cannot edit profiles or access group data. Anonymous callers have no table privileges or helper execution grants.

RLS is enabled on every application table. Explicit column grants and an invoker trigger prevent student changes to `active`, `role`, identity, or timestamps. Definer helpers use a fixed empty search path and the authenticated user’s UUID, avoiding recursive profile policies and user-editable metadata. Trigger functions have no public RPC execution grant. Unique group/student pairs prevent duplicates, and a trigger rejects admin profiles as student members. Auth deletion cascades through profiles and group memberships.

Account creation spans Auth and a subsequent profile update. If profile setup fails, the function compensates by removing the newly created Auth user. Failed compensation returns an error requiring manual Auth/profile inspection. Deletion refuses self-deletion and admin targets, and removes the Auth account before relying on FK cascades. The student directory uses real `profiles` queries with 50-row pagination.

## Auth and routes

Supabase persists and refreshes the normal browser session. The provider fetches the profile from the database before rendering a protected route; it does not trust role claims from user metadata or local storage. Async profile responses are versioned so a stale request cannot overwrite a newer login/logout. Missing, inactive, unsupported, or unreadable profiles fail closed with retry/logout controls.

Tab/window return and same-user `SIGNED_IN` / `TOKEN_REFRESHED` events update the session silently, without clearing the profile, refetching it, redirecting, or unmounting the active page. The question player keeps its current question, selections, elimination, review marks, and open navigator. Profiles are loaded on initial restoration or an account change, and explicitly refreshed after profile/onboarding saves. The provider owns one auth subscription and cleans up queued work and that subscription on unmount. Supabase still handles token renewal and invalid-session sign-out; database RLS remains authoritative. An intentional browser reload continues to restore the saved session and practice answers.

- `/` is public for visitors; signed-in users are redirected by database role.
- `/login`, `/signup`, and `/auth/callback` support email and Google authentication.
- `/onboarding` is student-only. Missing required learning information or an incomplete flag sends students there before entering the workspace.
- Student routes: `/dashboard`, `/homework`, `/books`, `/question-bank`, `/vocabulary`, `/progress`, `/standings`, `/profile`. Old `/student/*` links redirect to these routes.
- `/admin/*` requires an active admin profile. Students are redirected to their dashboard, where the onboarding guard also applies.
- Student and admin navigation are separate; admin branding says **Admin Control Panel**. Both shells show the real profile name, role, and logout controls. No fake notification or learning statistics are shown.
- Public signup metadata never supplies a trusted role. Google users receive a student profile too. Email confirmation may mean no session exists until the student follows the email link.

## Security regression tests

```bash
npm test
```

The Node suite runs Edge Function tests with isolated test doubles and executes all migrations and RLS regression checks in real PostgreSQL via PGlite, without Docker. Tests never use real accounts or server secrets. It covers unauthenticated/non-admin/inactive callers, role injection, validation, account cleanup failures, and deletion restrictions.

For actual SQL policy checks, install the Supabase CLI, Docker, and `psql`, then use a disposable local stack:

```bash
npx supabase@latest start
npx supabase@latest db reset --local
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
```

The example password is the local stack’s default database password, not an application/admin credential. `db reset --local` erases only the local development database; use a disposable stack. The SQL test inserts fixture accounts, switches database roles/JWT subjects, asserts RLS and protected-column behavior, checks cascades, then rolls everything back. Run it locally, not against production.

The migration and these SQL checks were also executed in an isolated PostgreSQL/PGlite runtime during implementation. Hosted Auth, gateway configuration, and deployed Edge Function behavior still need the integration checks above.

## Local Edge Function and Netlify deployment

For local function work, create an ignored `supabase/functions/.env` containing `ALLOWED_ORIGINS=http://localhost:5173`. The local Supabase runtime injects its own server keys. After starting the local stack:

```bash
npx supabase@latest functions serve manage-student --env-file supabase/functions/.env --no-verify-jwt
```

For Netlify later, set build command `npm run build`, publish directory `dist`, and only the two frontend-safe env values. `public/_redirects` preserves nested browser routing. Add the actual Netlify/custom-domain origin to the Edge Function allowlist and update the Auth Site URL. Nothing has been deployed to Netlify.

References: [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth state changes](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [function authorization](https://supabase.com/docs/guides/functions/auth-headers), [server environment variables](https://supabase.com/docs/guides/functions/secrets).

## Public authentication and onboarding setup

The frontend `.env` already points to `https://ileffhbbaomfimwulvpw.supabase.co` with the public publishable key. `.env.example` retains placeholders only. No service-role key belongs in either frontend file.

1. Open the SAT’chi Supabase project → **Authentication → URL Configuration**. Set the production Site URL to `https://sat-chi.netlify.app`. Add these exact Redirect URLs: `https://sat-chi.netlify.app/login`, `https://sat-chi.netlify.app/auth/callback`, `http://localhost:5173/login`, `http://localhost:5173/auth/callback`, `http://127.0.0.1:5173/login`, and `http://127.0.0.1:5173/auth/callback`. Use the same hostname throughout a PKCE flow.
2. Keep **Email** enabled, public signup enabled, and email confirmation enabled. Configure production SMTP before inviting a large cohort; the built-in sender has delivery restrictions. Signup sends `emailRedirectTo` using the current origin plus `/login`. Supabase verifies the email before redirecting there; the login page displays a success notice and waits for email/password sign-in, without redeeming the confirmation code or creating a session. This also works when the email opens in a different browser. Existing authenticated sessions retain their normal role redirects. Google continues to use `/auth/callback` separately. If you customized the Confirm signup email template, retain `{{ .ConfirmationURL }}` as the verification link; do not link directly to the Site URL or an app page, which would bypass verification. Changes apply to newly sent emails; old emails retain their original redirect.
3. In Google Cloud → **Google Auth Platform**, configure branding, audience/test users, and the `openid`, email, and profile scopes. Create an OAuth **Web application** client.
4. Add Authorized JavaScript origin `http://localhost:5173` and your actual production origin when known. Add Authorized redirect URI **`https://ileffhbbaomfimwulvpw.supabase.co/auth/v1/callback`**. This is Google's callback to Supabase, not the app callback.
5. In Supabase → **Authentication → Sign In / Providers → Google**, enable Google and enter the real Google client ID and client secret. Keep these credentials in the provider dashboard; do not add them to Vite or Git. Publish the consent configuration when ready to allow users beyond configured test users.
6. The app requests a PKCE flow with an origin-relative `/auth/callback`. It exchanges the authorization code and loads the database profile. First-time Google users go to onboarding; returning users go to their role's dashboard.
7. Before production, set Supabase Site URL to your actual HTTPS site and add its exact `/auth/callback` redirect URL. Add that origin in Google Cloud and the Edge Function CORS allowlist. `netlify.toml` sets `npm run build`, publishes `dist`, and rewrites SPA routes. Set only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify, then rebuild.

Onboarding persists `display_name`, optional `current_sat_score`, `target_sat_score`, `grade`, optional `target_test_date`, and `main_goal`. Scores are 400–1600 in steps of 10. Required fields plus server-controlled `onboarding_completed` determine whether onboarding is shown. Signup stores a safe draft in Auth metadata; the form carries it forward after confirmation. `/profile` uses the same restricted save flow.

Migration `20261003000200_student_onboarding.sql` adds checked columns and `complete_onboarding(payload jsonb)`. The RPC derives the student ID from `auth.uid()`, locks the caller's row, requires an active student, rejects all unknown keys, and never accepts role/status/identity/completion from the browser. New columns have no direct authenticated UPDATE grants. Existing profile/group RLS remains enabled.

### Browser verification

```bash
npx playwright install chromium
npm test
npm run test:e2e
npm run build
```

Browser tests intercept requests only in the test runner against an isolated local API address; application code has no mock-data mode. Tests cover landing links, signup validation/confirmation, onboarding persistence, login/logout, restored sessions, student/admin guards, all shell routes, responsive navigation, inactive/missing profiles, OAuth callback and safe errors. Real Google consent and delivery of confirmation emails require the configuration above and a real user's account; they are not claimed as live-tested.

Official references: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Books, questions, and practice

- Students browse published books at `/books`, open a book and its topic tree, open individual topics, then start practice. Parent-topic practice includes descendant questions in topic/question order. Empty libraries remain empty until real content is added.
- Admins manage books and topics at `/admin/books`, and manage questions/answer keys at `/admin/questions` or inside a book. Topics can be nested and ordered; the database rejects cycles and parents from another book. Question lists use 50-row pagination. Books are drafts until explicitly published. Covers and question diagrams use HTTPS URLs.
- Admin JSON imports accept complete books or questions for an existing topic, with preview, validation, a source-content preview, and transactional insertion. Exact duplicate imports are rejected. See [the JSON format and examples](docs/book-import-format.md).
- `/practice/:sessionId` uses a two-panel passage/reference and question/choice interface. Previous/next, numbered overview, mark-for-review, and elimination controls retain state. Every answer change is saved through an ownership-checked RPC; failed saves offer retry. The layout stacks on narrow screens.
- Submission grades on the server and reveals correct choices/explanations only afterward. Saved session URLs resume after refresh; submitted sessions reopen in review mode. The initial question snapshot is retained when source content is edited or deleted.

Migration `20261003000300_books_questions_practice.sql` creates `books`, `book_topics`, `questions`, `question_answers`, `content_imports`, `book_practice_sessions`, `book_practice_items`, and `book_practice_keys`. All eight tables use RLS. Active students can read published content and their own session snapshots. Answer-key tables have admin-only SELECT policies. Students have no content mutation or direct practice-update grants. Fixed-search-path RPCs check the current database role/active status and session ownership; internal import helpers cannot be called by browser roles.

The migration is applied to the verified project `ileffhbbaomfimwulvpw`. No sample educational content or test accounts were inserted into the hosted database. Add your own content through the admin interface and publish it when ready. This phase adds no Edge Function or frontend dependency. Homework, vocabulary, question bank, progress, and standings remain outside this phase.

Tests include PostgreSQL RLS, transactional rollback, duplicate imports, hierarchy constraints, hidden answer keys, cross-student session access, immutable submission, content-deletion snapshots, admin content CRUD, file imports, student practice/resume/review, save failures, and responsive layout. Browser test responses are isolated in the test runner; production always uses Supabase.

## Learning workflows and local imports

Groups, multi-section homework, Question Bank, vocabulary learning, progress, standings and admin monitoring now query real Supabase records. See [learning workflows](docs/learning-workflows.md) for authoring, source handling, current limits, Desmos configuration and deployment details.

```bash
npm run import:inspect
npm run import:apply -- --apply
```

The importer scans only relevant Desktop files and `Desktop/Books`, validates intermediate JSON, verifies the linked project, and leaves uncertain extraction unimported. Private artifacts remain under ignored `local-imports/`. Imported local books are drafts until an administrator reviews and publishes them.

### Vocabulary and importer checkpoints

The Vocabulary studio supports original source sets, combined study pools, word accordions, favorites, deterministic spaced reviews, strict typed recall, source passages and saved tests. Automatically extracted content remains draft until admin review. See [learning workflows](docs/learning-workflows.md), [source inventory](docs/book-import-report.md), and [resume instructions](docs/CODEX_HANDOFF.md).

```bash
npm run lint
npm run format:check
npm run import:report
npm run import:check-vocabulary
node --test tests/vocabulary-model.test.js
npm run test:e2e -- tests/browser/learning.spec.js
```

Source discovery is restricted to `~/Desktop/Books` and its subdirectories. Source PDFs, extracted text, SQL payloads and local checkpoints stay in ignored `local-imports/`; they must never be committed.

### Content Review and Settings

Administrators use `/admin/content-review` for live source outcomes, paginated catalog/review inspection, corrections, explicit approval, rejection, duplicate/defer decisions, manual source transcription and audit/import history. Review RPCs and RLS enforce administrator access; imported catalog publication requires completed reviews. See [the review workflow](docs/content-review-workflow.md) and [source reconciliation report](docs/book-import-report.md).

Students use `/settings` for their account display name and daily Study Plan budget, plus per-account browser vocabulary defaults that initialize shuffle/test size/type. Administrators have account settings at `/admin/settings`. No placeholder toggles or partial theme switch are exposed.

Apply additive migrations through `20261004002000`; never reset the linked production database. `npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check` and `npm run build` cover the existing and new workflows. Private source/provenance audits stay under ignored `local-imports/`.

### Source-specific Math recovery

Use the existing local Node runtime, Python 3, Poppler (`pdftotext`/`pdftoppm`), ImageMagick (`magick`), and Tesseract for selected scanned headers only. Source files stay under `~/Desktop/Books`; derived regions/evidence stay in ignored `local-imports/`.

```bash
node scripts/imports/recover-math.js --source="MathBook 2.0 Ready.pdf"
# Prepare private assets and a source-scoped validated draft payload:
node scripts/imports/recover-math.js --source="MathBook 2.0 Ready.pdf" --apply
node scripts/imports/apply-local-imports.js --apply --source="MathBook 2.0 Ready.pdf"
node scripts/imports/report.js
node scripts/imports/report-math.js
node --test tests/math-recovery.test.js
```

Supported embedded-text families: MathBook 2.0, MathBook 3.0, HardBook 2.0, PrepPros Complete Guide, and 800 Challenge. A separate selected-scan adapter for PrepPros Advanced requires the private verified key evidence from the existing local checkpoint; it does not OCR an entire book. Approve/publish separately. `refresh-math-assets.js --source="Filename.pdf"` regenerates existing crop paths without inserting questions. `reconcile-checkpoints.js` restores a manifest from complete atomic per-source reports after interrupted writers; it verifies payload hashes and makes no database writes. Run importer mutations sequentially.

### Focused SAT workspace corrections

Admin book/source detail separates validated approval from publication. Approve the validated subset using the versioned confirmation, then publish approved content. Unresolved numeric/key/option/visual candidates remain hidden and do not block that subset. Correcting a question invalidates only its approval; it does not unpublish the rest of the book.

Math recovery now requires real interactive choices. Existing imported IDs must be repaired with `node scripts/imports/repair-math-options.js --apply`, optionally scoped by `--source="Filename.pdf"`; the old full-region refresh refuses to overwrite corrected crops. This command depends on private verified local checkpoints, source fingerprints, Poppler/ImageMagick and authenticated private Storage. Never substitute placeholder choices or guessed keys. See the exact corrected counts and limitations in `docs/book-import-report.md`.

The practice Calculator embeds the official College Board Desmos testing calculator by default. For the supported JavaScript integration, request an embedding key from [Desmos](https://www.desmos.com/my-api) and configure the **public browser embedding key** as `VITE_DESMOS_API_KEY` in `.env.local` and the hosting build environment, then rebuild. The API script uses v1.12 and `apiKey`; SDK failures fall back to the in-app testing calculator. Never place a Supabase service role key or another private backend secret in a `VITE_` variable. External calculator connectivity is required. [Official SDK documentation](https://www.desmos.com/api/v1.12/docs/index.html).

Update `src/data/sat-dates.js` when [College Board confirms new dates](https://satsuite.collegeboard.org/sat/dates-deadlines). This is a static maintained schedule; registration and late deadlines are shown without scraping at runtime. `profiles.target_test_date` is the canonical selection across onboarding, settings, dashboard and Study Plan. Changing it preserves completed and active history while regenerating future unstarted work.

The unit/database test command limits concurrency to two processes so PGlite suites remain usable on a development laptop. All existing tests are retained.

The recurring homework backend and its calendar, membership, grading and RPC contracts are documented in [Daily Homework model](docs/daily-homework-model.md). Its executed database checks run with `node --test tests/daily-homework.test.js` or the full `npm test` command. The existing admin Homework form supports One-time and Daily recurring. Students use Today, Overdue/Missed and saved history in Homework, plus real Dashboard counts; Admin → Students → detail includes lifetime daily completion/streak/accuracy/time metrics. Production migrations through `20261004003200` are applied and verified; see [migration audit](docs/daily-homework-production-audit.md). Run daily browser regressions with `npm run test:e2e -- tests/browser/daily-homework.spec.js`; aggregate database checks with `node --test tests/daily-reporting.test.js`. Run full unit and browser suites sequentially to avoid competing image/browser workloads.

### Structured book ZIP imports

A supplied `book.json` / `manifest.json` / `review.json` / `assets/` package can be imported without re-extracting or rewriting its questions. See [the structured package workflow](docs/book-package-import.md). Python 3's standard library validates and extracts the archive; the existing Node/Supabase tooling writes the book and permanent private PNG assets. Book Practice also supports source-image choices, supplied open-response answer lists, and an Explanation button after any answer selection.

```bash
node scripts/imports/book-package.js /absolute/path/book-satchi-import.zip
node scripts/imports/book-package.js /absolute/path/book-satchi-import.zip --apply --verify-assets
node --test tests/book-package.test.js
npm run test:e2e -- tests/browser/book-explanations.spec.js
```

### Homework lifecycle repair (local, October 8)

The additive `20261008000100_homework_lifecycle.sql` migration supports open-response one-time homework, atomic editing, unfinished-attempt synchronization, recipient/group roster updates, and withdrawn access without deleting history. Admin Homework shows answered/total progress. One-time deadline inputs use Asia/Tashkent independently of browser timezone. Recurring edits still take effect the next local day.

See [repair report and reproducible checks](docs/homework-repair-report.md) for the root-cause reproduction, changed functions, verification boundaries, and migration status. The migration and frontend changes have **not** been applied or deployed to the hosted application. Local SQL-backed browser tests execute PostgreSQL with RLS; their authentication is simulated.

Phase 1 adds durable pending-answer recovery, acknowledged versioned saves, conflict protection and administrator open-response review in `20261008000200_practice_answer_integrity.sql`. Both October 8 migrations remain pending. See the [Phase 1 integrity report](docs/phase-1-integrity-repair-report.md) for snapshot/access policy, regression results and coordinated release requirements.

### Native database and browser regression

`tests/native-app-workflows.test.js` starts an isolated PostgreSQL cluster, PostgREST, and the actual Vite application. Application queries and RPCs go through PostgREST; Auth and Storage transport are local disposable fixtures, with Storage permissions checked using database RLS. It never connects to the linked Supabase project. Supply local PostgreSQL and PostgREST binaries and run:

```sh
SATCHI_TEST_POSTGRES_BIN=/path/to/postgresql/bin \
SATCHI_TEST_POSTGREST=/path/to/postgrest \
node --test tests/native-app-workflows.test.js
```

Use the Node version specified in `package.json`, install Playwright Chromium with the existing browser-test setup, and supply any library path needed by your PostgreSQL distribution. The test explicitly skips when binary paths are absent. It creates and removes its own temporary cluster and applies migrations only inside that cluster. Hosted verification requires separate authorized test credentials and approved schema updates.

### Real-user reliability gate

Run `npm run test:reliability` before a release, separately from other heavy suites. It requires PostgreSQL17, PostgREST14 and Playwright Chromium; missing tools fail the command instead of silently skipping native coverage. Provide `SATCHI_TEST_POSTGRES_BIN` and `SATCHI_TEST_POSTGREST`, or use the persistent local cache paths documented in [the reliability handoff](docs/codex-reliability-handoff.md).

The suite launches disposable Vite/PostgREST/database fixtures and verifies saved answers through both HTTP acknowledgements and authoritative database rows, including browser restart, stale tabs, network failures, three students, large sessions and recurring Homework. Auth/Storage HTTP transport remains a fixture; this is not hosted verification. See [the audit](docs/real-user-reliability-audit.md), [answer report](docs/answer-persistence-test-report.md), and [Homework report](docs/homework-reliability-report.md) for results, limitations and pending migrations. These local repairs have not been deployed.
