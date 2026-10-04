# SAT’chi design system

SAT’chi is a quiet academic workspace: precise, readable, and built for sustained study. Keep the existing blue identity, ink typography and practical navigation. Structure comes from alignment, whitespace and dividers; elevation is reserved for overlays. No decorative gradients, repeated nested cards, imitation branding or motion that delays work.

## Foundations

- Typography: existing system/Inter stack, no additional font download. Page title 28–34px/1.2, section title 17–20px/1.35, body and controls 14px/1.55, metadata 12px/1.5. Tight tracking only on headings. Counts use tabular numerals. Short headings balance; source passages retain natural wrapping and readable line height.
- Spacing: 4px unit; 8/12 within controls, 16/24 between groups, 32 between sections. Dense lists use separators rather than separate cards.
- Surfaces: canvas #f6f8fc, main white, quiet #f4f6fa. Ink #172b4d, muted #53647b, accent #245bcc, selected #edf3ff, border #dce3ec. Error and success always include text.
- Radius: controls 6px, workspaces 10px, pills only for genuinely compact status. Shadows only for menus/dialogs, restrained hover on library covers.
- Controls: minimum 40px desktop / 44px touch targets. One primary action per task. Secondary actions use quiet text or outline. Native labeled fields and checkboxes remain keyboard accessible. Never nest buttons inside links.
- Tables: left-aligned labels, tabular counts, clear header and row separators; paginate data at the database. Stack or scroll bounded tables on mobile, without page overflow.
- Navigation: preserve sidebar and drawer. Active state combines ink/accent background and existing icon. Contextual editors stay reachable without duplicate global navigation.

## Interaction

Question Bank uses one two-column configuration workspace: domains/skills on the left, advanced filters on the right, stable action footer below. Section switching clears incompatible domain/skill selections. Whole domains and individual skills form a union; source/difficulty/history constrain that pool. Chevron expansion never changes selection. Counts describe the real filtered catalog; facet counts ignore domain/skill selection so alternatives remain discoverable. No answer keys appear in previews.

Vocabulary books link through their title and main content. Within a book, set rows show the local set title and real word/passage/exercise counts. Selection and editing are separate controls. Publication belongs to the book: Draft, Needs review, Published, Archived. Imported catalog approval and nonempty sets are required; optional word fields are not. Archiving unpublishes. No automatic source publication.

## States and motion

Focus uses a visible blue outline, including checkboxes, selects and disclosure controls. Selected rows retain a checked indicator plus blue surface. Loading preserves workspace geometry; announce busy state and disable starting until the matching result is current. Zero matches explain how to broaden selection. Errors retain retry controls.

Motion tokens: fast 120ms, standard 180ms, disclosure 220ms, ease cubic-bezier(.2,0,0,1). CSS transitions target color, background, opacity and transform explicitly; no transition: all. Routine selection is immediate. Disclosure chevrons rotate, accordion content fades gently where supported. Reduced-motion removes nonessential transitions. No GSAP runtime dependency is warranted for these simple states.

Desktop uses a 1.35:1 Question Bank split; below 760px filters stack in reading order and footer remains in normal flow. All long titles wrap; no forced minimum column widths. Touch targets grow without changing information hierarchy.

## Design advisers

Installed/studied locally using official resources: [Impeccable](https://impeccable.style/), [Transitions.dev](https://transitions.dev/), [official GSAP skills](https://github.com/greensock/gsap-skills), [make-interfaces-feel-better](https://github.com/jakubkrehel/make-interfaces-feel-better). Their recommendations inform hierarchy, hit areas, optical alignment and restrained interruptible motion; this document resolves differences into one SAT’chi system. Installation details and limits are recorded in CODEX_HANDOFF.md. Project-local third-party skills are tooling, not application dependencies.
