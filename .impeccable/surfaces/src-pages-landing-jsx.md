---
version: 1
slug: "src-pages-landing-jsx"
primary_target: "src/pages/Landing.jsx"
related_targets: ["src/styles/premium.css", "src/components/CreatorSignature.jsx"]
---

## Scope
Local premium public landing extension. Preserve the Rounded Academic Commons in root DESIGN.md; no new visual world. Source was checked on feature/premium-battles-2. Review disposition belongs to docs/premium-battles-visual-review.md and is not asserted here.

## Direction contract
THESIS: Make the connected learning workspace tangible through a readable introduction and an honest interactive feature preview.
OWN-WORLD: Existing Manrope, blue/white light and navy/blue dark tokens; rounded surfaces; static SVG icons and text rather than raster mockups or invented achievements.
STORY: Introduction and six-feature preview, connected-workspace statement, focused practice path, saved-progress explanation, competition invitation, purposeful final call to action.
FIRST VIEWPORT: Two-column hero (1.05fr/1fr) with clear signup/explore actions and an interactive capability preview, explicitly labeled “Feature preview · Sign in to see your own learning.”
FORM: Landing-only large type and alternating compositions extend the incumbent workspace rather than changing its tokens.
FINISH: Source documentation is complete; a separate final visual verdict must be read from the review report.

## Implemented composition
Hero gap is 52px with 75px/100px vertical padding. Feature preview switches between Question Bank, Books, Progress, Battles, Vocabulary and Homework. Buttons expose pressed state; the panel announces its updated content politely and retains a real feature link. No sample student statistics appear.

Main sections cap at 1160px and normally use 72px/32px padding. The practice path pairs explanatory copy with a rounded accent-soft process panel. Progress and closing sections pair copy with a clear action. The navy competition section is an isolated invitation, not a universal page backdrop.

At 960px the hero gap narrows and horizontal copy/action sections stack. At 700px the hero and two-column sections stack; body sections use 44px/24px padding. The competition section gains 16px side margins and a 26px radius. Preserve source reading order and reachable navigation/actions.

## Motion and identity
Hero children enter once using 420ms settle motion and 70ms delay increments; showcase arrival is 700ms and panel replacement is 220ms. Reduced motion disables these animations. Do not add continuous decoration or imply that the preview contains saved personal analytics.

The footer shares Made by Franz Hermann with authenticated pages. Its internal author destination comes from CREATOR_PORTFOLIO_URL, currently /dashboard. No raster asset or new raster provenance is required for this composition.
