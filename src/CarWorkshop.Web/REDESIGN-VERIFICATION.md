# Reference-based frontend redesign

28 October 2026. Status: working design draft for user review. Visual direction
comes from the user's supplied admin-dashboard screenshot. DESIGN.md records
the applied palette, layout, type, spacing, and reasons.

The React frontend now has a sidebar, compact header, operational dashboard,
light grey workspace, bordered white panels, orange actions, and teal booking
bars. All five existing record workspaces use the new system. API behavior and
database schema are unchanged by this redesign.

## Verification

- PASS: 23 frontend tests.
- PASS: production Vite build, 28 modules, no build errors.
- PASS: 32 real MySQL integration tests.
- PASS: isolated browser workflow from customer and vehicle creation through
  booking, confirmation, assignment/reassignment, InProgress, and Completed;
  final mechanic ID/name checked through the real API.
- PASS: dashboard requested count, upcoming customer, and seven-day chart checked
  against the real temporary booking. Completed bookings leave the upcoming list.
- PASS: mechanic validation, search/filter/clear, reload, edit/cancel, activation,
  inactive assignment history, unsaved booking guard, and conflict recovery.
- PASS: intercepted connection error, API settings/Escape, retry, and held loading response.
- PASS: all six workspaces at 1440, 768, 390, and 320px without document overflow
  or browser page errors. Desktop and phone screenshots inspected in two bounded rounds.
- PASS: every dashboard button navigates, brand opens Dashboard, mobile menu
  moves keyboard focus into navigation and Escape restores the menu button.
- PASS: dialog opens and closes; invalid form focuses the first field; keyboard
  Tab reaches the next field with a visible outline.

Screenshots: `.verification/redesign-<module>-1440.png` and
`.verification/redesign-<module>-390.png` (ignored local artifacts).

## Delivery gate

Scope: the reference-based React redesign. The earlier MECHANICS-VERIFICATION.md
records the previous visual iteration; this report covers the new appearance.

| Check | Status and evidence |
| --- | --- |
| R-02 em dashes | PASS: new interface copy contains none. |
| R-03 overflow | PASS: all six modules checked at four widths; mobile captures inspected. |
| R-17 statistics | PASS: metrics derive from fetched appointments and mechanic arrays. |
| R-18 testimonials | PASS: none introduced. |
| R-23 assets/navigation | PASS: screenshot-directed navigation and module icons; existing brand name retained. |
| R-24 dead links | PASS: six nav destinations, brand, and all dashboard actions browser verified. |
| R-25 contrast | PASS: muted on white 5.60:1, muted on grey 5.23:1, white on orange 5.18:1, selected text on peach 6.57:1, using the skill contrast checker. |
| R-26 controls | PASS: dashboard links, mobile menu, settings dialog, and existing record workflow verified. |
| R-27 states | PASS: real zero counts, upcoming empty state, loading, error/retry, busy guards, and form validation. |
| R-28 FAQ | PASS: none introduced. |
| R-32 keyboard | PASS: native buttons, explicit labels, menu focus/Escape, field focus/Tab, and dialog Escape checked. |
| R-33 source | PASS: JSX and CSS authored directly through source patches. |
| R-34 themes | PASS: screenshot-directed light theme; no theme toggle introduced. |
| R-35 runtime | PASS: build, responsive browser checks, and real booking walkthrough. |
| R-36 claims | PASS: UI describes implemented workshop operations; no unsupported performance/security claims. |
| R-37 direction | PASS: user supplied screenshot and approved adapting it; DESIGN.md records direction. |
| R-38 content | PASS: real API records and explicitly isolated verification data; no production sample records. |
| R-01 gradients/glows | PASS: no decorative gradients or glows introduced. |
| R-04 icons | PASS: authored line icons identify their actual modules, calendar visits, and settings. |
| R-06 typography | PASS: compact administrative sans-serif follows the reference and supports scanning. |
| R-07 patterns | PASS: no background pattern added. |
| R-08 arrows | PASS: arrows only identify navigation to full record workspaces. |
| R-09 badges | PASS: status labels and counts communicate real booking data; no promotional badges. |
| R-10 glass | PASS: opaque operational surfaces, no glass effects. |
| R-12 shadows | PASS: limited to action depth, dialogs, and overlaid mobile navigation. |
| R-13 stacked glow | PASS: no glow effects. |
| R-14 uniform cards | PASS: four screenshot-directed summary metrics; detail panels use content-specific structures. |
| R-19 motion | PASS: control feedback and loading only, with reduced-motion support. |
| R-22 illustrations | PASS: no illustration assets introduced. |
| Dials declared | PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 in DESIGN.md. |
| Dials reflected | PASS: quiet staff tool, differentiated summary/chart/list regions, no entrance animations. |
| Focal point | PASS: dashboard title/action and records/editor headings establish hierarchy. |
| Whitespace | PASS: 28px desktop gutters, 22px panel gaps, compact field grouping. |
| Accent | PASS: orange selected navigation and actions; teal separates booking volume. |
| Identity | PASS: supplied admin-dashboard composition adapted to workshop modules and scheduling. |
| Design read | PASS: reference layout and intended phone behavior announced before implementation. |
| C-1 intention | PASS: sidebar groups modules, dashboard prioritizes review and assignment, editors preserve tasks. |
| C-2 completeness | PASS: all introduced actions exercised in browser. |
| C-3 composition | PASS: every dashboard panel uses existing operational data. |
| C-4 resilience | PASS: error, loading, empty, phone, keyboard, and busy states verified. |
| C-5 evidence | PASS: counts and chart checked with real isolated MySQL records. |
| R-05 template use | PASS: reference explicitly requests an admin dashboard; content determines panels. |
| R-11 radii | PASS: 6px controls, 8px panels, minimal functional status labels. |
| R-15 copy | PASS: actions name actual destinations and operations. |
| R-16 language | PASS: no marketing buzzwords added. |
| R-20 identity | PASS: workshop records and booking queue replace the reference's HR content. |
| R-21 light theme | PASS: user-supplied reference establishes the light appearance. |
| R-29 palette | PASS: neutral surfaces, orange action accent, teal booking visualization, existing semantic statuses. |
| R-30 imitation | PASS: user explicitly requested the supplied visual reference; its brand/content were not copied. |
| R-31 rationale | PASS: component purposes and visual decisions recorded in DESIGN.md. |

Authentication and financial modules remain outside the current product. This
design draft is ready for user review; it has not been published or committed.
