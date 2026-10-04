# Focused interface review

Full targeted review of Question Bank and vocabulary library/set administration. React with the existing plain CSS system. Books card affordances and admin navigation were checked within that path; Dashboard, Settings and Content Review were inspected for consistency but not broadly redesigned.

| Category    | Evidence                                                               | Result                                                             |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Typography  | Desktop/mobile renders, real headings/labels, CSS counts               | Deliberate title/section/metadata hierarchy, tabular counts        |
| Surfaces    | Configuration layout, set rows, selected/hover/focus states            | Quiet surfaces and dividers; secondary actions subordinate         |
| Animations  | CSS disclosures and native word accordion, reduced-motion browser path | Short interruptible transitions; no runtime animation dependency   |
| Icons       | Existing SVG family, disclosure control                                | Consistent currentColor chevron; keyboard expanded state           |
| Performance | Facet SQL, 25-item question preview, paged 50-book catalog             | Aggregate counts stay on server; no full question-library download |

## Findings corrected

| Severity | Location                    | Before                                                       | After                                                                            | Why                                            |
| -------- | --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| High     | Question Bank configuration | Sticky footer overlapped long filter rows in first render    | Bounded filter scrolling with footer in normal flow                              | Every control remains reachable                |
| Medium   | Question Bank               | Single-domain form with separate Apply action                | Immediate domain/skill union selection, separate chevron                         | Less friction and clear selection semantics    |
| Medium   | Vocabulary                  | Repeated card labels and Open set/book buttons               | Local set title as primary link; real counts and quiet management actions        | Opening and management have distinct hierarchy |
| High     | Vocabulary publication      | Hidden Published checkbox; no readiness explanation          | Explicit lifecycle panel, readiness and review blockers; checked server mutation | Admin can find publishing; drafts stay private |
| Medium   | Admin navigation            | Global Questions alongside overlapping content workflows     | Contextual editor link with route preserved                                      | Cleaner navigation without lost functionality  |
| Medium   | Filter accessibility        | Native label matching was ambiguous for exact control lookup | Explicit names for selects; existing visible labels preserved                    | Reliable keyboard/screen-reader targeting      |

## Considered but rejected

| Candidate                               | Reason                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------- |
| GSAP runtime for disclosures            | Native controls/CSS cover these interactions without dependency cost   |
| Animated changing counts                | High-frequency filtering needs stable numerals and immediate feedback  |
| Broad typography/sidebar replacement    | Preserve existing identity and working navigation within limited scope |
| Bulk publication of imported vocabulary | Source-derived items still need genuine review approval                |

Verification: unit/PostgreSQL tests exercise union filtering, real facets, unpublished visibility, readiness and audited lifecycle actions. Browser tests exercise selection/counts, zero results, timed payload, persistence, row navigation, publication blockers, auth/navigation and reduced-motion/mobile layouts. Desktop/mobile screenshots were inspected in a bounded pass; the footer issue was corrected and recaptured. The Impeccable mechanical detector reported no findings. Normal and reduced-motion interaction paths are tested; a 10%-speed developer-tools motion replay was not performed. Broader dashboard polish remains outside this checkpoint.

Verdict: targeted workflow approved after corrective checks; the developer-tools slow-motion replay and broader surface audit remain unverified.
