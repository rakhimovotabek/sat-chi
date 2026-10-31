---
name: "SAT’chi"
description: "Rounded academic workspaces for study, saved learning and Battles."
colors:
  brand: "#245fe5"
  accent-soft: "#eaf1ff"
  ink: "#172b4d"
  text-muted: "#566980"
  canvas: "#f3f6fc"
  surface: "#ffffff"
  surface-quiet: "#f0f4fa"
  surface-hover: "#eaf0fa"
  border: "#dce4f0"
  positive: "#147a5b"
  positive-soft: "#e5f6ef"
  negative: "#bd344c"
  negative-soft: "#fff0f2"
  dark-brand: "#82adff"
  dark-accent-soft: "#1a2e51"
  dark-ink: "#e6edfc"
  dark-text-muted: "#a8b7cf"
  dark-canvas: "#0c1424"
  dark-surface: "#121f33"
  dark-surface-quiet: "#19283f"
  dark-surface-hover: "#203350"
  dark-border: "#2c3d57"
  dark-positive: "#7edab7"
  dark-positive-soft: "#143b34"
  dark-negative: "#ff9db0"
  dark-negative-soft: "#422636"
  button-blue: "#245fe5"
  button-hover: "#174dc5"
  button-text: "#fff"
  arena-navy: "#152e60"
  arena-text: "#e4edff"
  team-amber: "#b67425"
  dark-team-amber: "#ffcb80"
typography:
  headline:
    fontFamily: 'Manrope, "Segoe UI", sans-serif'
    fontSize: "clamp(28px, 3vw, 40px)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  title:
    fontFamily: 'Manrope, "Segoe UI", sans-serif'
    fontSize: "19px"
    fontWeight: 750
  body:
    fontFamily: 'Manrope, "Segoe UI", sans-serif'
    lineHeight: 1.6
  description:
    fontSize: "14px"
    lineHeight: 1.7
  label:
    fontSize: "13px"
    fontWeight: 750
rounded:
  control: "12px"
  card: "22px"
  workspace: "22px"
  task: "18px"
  modal: "24px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.button-blue}"
    textColor: "{colors.button-text}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.button-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  chip:
    backgroundColor: "{colors.surface-quiet}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  nav-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.brand}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
---
# Design System: SAT’chi

## Overview

**Creative North Star: "The Rounded Academic Commons"**

The Rounded Academic Commons uses humanist lettering, calm learning surfaces and comfortable rounded controls. White and blue organize light mode; deep navy surfaces and brighter blue organize dark mode. Battles adds a concentrated arena treatment while keeping questions and live states readable.

This document records implemented source. The finish reviewer resolved the listed fixes across the supplied 94 app captures and 14 supplementary captures; exact coverage and limits are recorded in docs/ui-redesign-review.md. The local Manrope font and license provenance are recorded in public/fonts/provenance.json.

**Key Characteristics:**
- Blue learning accents with semantic answer states.
- Rounded cards, pill actions and visible keyboard focus.
- Saved-data presentation with short, bounded motion.

## Colors

### Primary

Study Blue (`brand`) marks navigation, progress and selected controls. Primary actions retain fixed Button Blue and white text in both themes; hover uses the deeper button tone. Dark mode changes the semantic brand to a lighter blue for text and indicators.

### Secondary

Team Amber distinguishes the opposing Battles team and brightens in dark mode. Arena Navy supplies the concentrated competition header; it is a local Battles treatment, not a workspace background.

### Neutral

Canvas sits behind white surfaces in light mode and navy surfaces in dark mode. Quiet and hover surfaces separate grouped controls without adding heavy outlines. Ink, muted text and borders change together with the theme. Positive and negative pairs communicate grading and readiness; retain accompanying labels and icons.

**The Semantic Theme Rule.** Use the matching theme's surface, text and status tokens together; fixed action blue remains a deliberate exception.

## Typography

**Display and Body Font:** Manrope, with Segoe UI and sans-serif fallbacks. The local variable font supports weights 200–800 and uses font-display swap.

Headlines use the frontmatter headline role. Dashboard and arena introductions grow to 44px; section titles use 19px and weight 750. Descriptions use the description role and a maximum of 74ch. Buttons and navigation use compact 13px text. Metric values use weight 800 and tabular numerals; compact annotations remain smaller than body copy. General body size is inherited rather than a newly declared global token.

## Layout

The desktop shell uses a 224px rail, or 76px when collapsed, with a 72px topbar in the general shell. Practice instead uses an intrinsic top row, a 72px minimum topbar height and 12px vertical topbar padding so its heading and tools can wrap. On mobile, Practice retains three grid rows for topbar, navigation and content. Content is capped at 1200px. Main content padding is 36px 32px 24px, narrowing at 960px to 28px 22px and at 720px to 26px 16px. The shell switches its navigation treatment at 720px. Reused spacing follows the frontmatter scale; page compositions also use local intermediate values.

General content card grids stack on mobile; metric snapshots retain two columns. Section headings wrap, account summaries disappear on narrower screens, and general form text becomes 16px on mobile. Progress filter selects retain a compact 13px size. Progress activity and its chart precede the all-time learning overview in source order. Filters wrap or stack within the available width; narrow activity charts use 160px tracks. Preserve the full chart baseline together with its scope controls in the verified first viewports. Dashboard and Progress use distinct working compositions rather than a universal card grid. Preserve their source reading order when adapting layouts.

## Elevation & Depth

Soft shadows lift outer cards; nested cards and metric cards stay flat. Floating dialogs and book-card hover use the stronger float shadow. Borders and quiet surface tones supply most structural separation. Exact light/dark shadows and motion durations live in the sidecar and source stylesheet.

**The Bounded Motion Rule.** Counters and charts settle in 750ms, start when visible and pause when hidden. Reduced motion shows final values immediately. No per-frame React updates or animation dependency are required. Loading skeletons breathe for three cycles; reduced motion disables that animation. Text inputs, selects and textareas also suppress their field transitions under reduced motion.

## Shapes

Controls use the control radius; main cards use the card radius. Repeated tasks use the task radius, modal and management surfaces use the modal radius, and actions and tags use pills. Battles introduces a 28px arena header and 20px player cards. These are observed local exceptions; the requested rounded language takes priority over generic sharp-corner defaults.

## Components

### Buttons

Pill-shaped primary actions use fixed Button Blue, white text and a minimum height of 44px. Hover deepens the background and adds a light blue shadow; active presses move down 1px and scale to 0.985. Secondary actions use theme surfaces and a border, switching to the accent-soft pair on hover. Compact actions use 36px height. Disabled actions use opacity 0.55 and suppress movement and shadows.

### Chips

Quiet, muted pills use the chip tokens. Selected segmented controls become surface-colored with accent text and a small shadow; the group sits on a quiet pill-shaped track.

### Cards / Containers

Theme surfaces, rounded corners and restrained borders define containers. Learning panels use 26px padding, reducing to 20px on mobile. Book cards lift 4px on hover; reduced motion removes the lift.

### Inputs / Fields

Fields use themed surfaces, a 1px border, the control radius and at least 44px height. Placeholder text uses muted text. Focus across interactive elements uses a 3px accent outline with 3px offset. Error panels use the negative pair; disabled selects use quiet surfaces. Correct and incorrect answer treatments use semantic positive and negative theme pairs, including existing practice state selectors.

### Navigation

Rail links use 13px type, 12px corners and a minimum height of 44px. Hover uses the hover surface; the active route uses the accent-soft pair. The theme selector exposes Light, Dark and System preferences and synchronizes browser storage changes. Night Light remains a separate display tint.

### Saved analytics and Battles

Tabular metric counters expose the final saved value to assistive technology throughout animation. Charts grow from their baseline, rings draw to the saved percentage, and unavailable values render an em dash. Ring size is contextual: 100px in the compact Progress overview and 62px in book cards. Battles uses labeled readiness, a round progress track and team-colored score cards; state changes supply the energy.

## Do's and Don'ts

### Do:

- **Do** use semantic surface and text variables so both themes remain readable.
- **Do** preserve saved values and explicit unavailable states in analytics.
- **Do** honor reduced motion and pause chart motion outside the viewport or hidden tab.
- **Do** retain visible keyboard focus and clear answer-state labels.
- **Do** keep Progress activity and scope controls before the all-time summary, and allow Practice header tools to wrap without losing the mobile navigation row.

### Don't:

- **Don't** invent progress, achievements, scores or learning history.
- **Don't** replace the confirmed blue/white and navy/blue palette.
- **Don't** add endlessly moving decoration to study or Battles.
