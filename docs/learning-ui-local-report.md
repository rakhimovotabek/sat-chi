# Learning UI — local verification

All five requested priorities are implemented locally. Nothing was pushed or deployed; no production data was accessed or modified. No new migration is needed for these UI changes.

## Changes

- Calculator, reference sheet and Pen use the common header beside Night Light/account controls. Question number, Mark for Review, Eliminate and real recorded Attempts sit above the question. Previous/Check/Next retain their existing handlers.
- Desmos occupies a rounded left panel with question reflow on desktop and a closable stacked panel on narrow screens. The existing embed remains mounted across close/reopen and question navigation. The desktop divider still resizes it; free dragging is not exposed.
- Night Light cycles Off/Warm/Extra Warm and persists locally, including migration of the previous boolean preference. Warm and Extra Warm use subtle amber overlays at 20% and 32% opacity; pointer events pass through. Modal backgrounds also receive warmth.
- Overview closes on backdrop, Escape, Close or question selection and restores focus. Clicking content or padding inside stays open. Existing navigation and answer persistence are unchanged.
- Short text-only Math choices use two columns on large screens; long text, image options and narrow screens retain one column. Existing Pen annotations and Check feedback remain available.

## Verification

Two focused Chromium integration tests passed with actual isolated PostgreSQL 17/PostgREST. Auth and Storage transports are disposable fixture services, not hosted Supabase verification. Desmos used the real official College Board embed, with an expression entered and verified after close/reopen.

- Stable question/image/canvas DOM identity across Calculator and Check; no additional application REST requests (apart from heartbeat) or question-image fetches when opening Calculator.
- Desktop calculator/question non-overlap, narrow-screen calculator opening/closing, expression and iframe identity preservation.
- All three warmth levels; Extra Warm preserved after reload.
- Overview content/padding, backdrop, Escape with focus restoration, Close and question 12 selection.
- Actual Pen drawing, MCQ Check, authoritative database save/revision checks and reload restoration.
- Question Bank and Homework answer saves checked against database rows and restored after reload; header tools and overview dismissal exercised there too.
- Existing admin Homework results/date isolation and all-mode leaderboard browser regression passed, including image-option answer persistence.

Five focused model/calculator tests also passed. Scoped ESLint, production build and `git diff --check` passed. No full-suite audit was run. This does not claim hosted verification, mobile touch testing, or exhaustive grading/content coverage.

## Files

Header wiring: `AppShell.jsx`, `TopBar.jsx`, new `LearningToolsContext.js`, `Icon.jsx`. Player/layout: `Player.jsx`, `CalculatorWorkspace.jsx`, `testing-workspace.css`. Display preference: `NightLight.jsx`, `night-light.js`, `main.jsx`. Dismissal: shared `Modal.jsx`. Coverage: new `learning-tools-native.test.js`, updated `essential-features-native.test.js` and `homework-results-model.test.js`.

## Manual testing

Current running isolated URL: **http://127.0.0.1:41061**.

- Student: `student@fixture.invalid`
- Admin: `admin@fixture.invalid`
- Both passwords: `disposable-test-only`

Restart with `npm run dev:isolated` from this repository. Use the localhost URL printed by that command (the port is allocated dynamically). It applies local migrations only to a disposable database. Reload/login preserve data during the run; restarting the command creates fresh fixtures. The native PostgreSQL 17/PostgREST tools must remain in the existing local cache. Desmos requires internet access.

The pre-existing uncommitted production-release report is preserved outside this change's commit.
