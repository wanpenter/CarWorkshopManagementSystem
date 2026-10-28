# Mechanic frontend verification

Verified 28 October 2026. Scope: Mechanics workspace, mechanic assignment in the
existing Appointments workspace, API client integration, and the isolated browser runner.

The feature inherits the existing service-desk design: warm paper, rust actions,
Georgia headings, Segoe UI controls, and a list beside its editor on desktop.
ENERGY 1 / RHYTHM 2 / MOTION 1. Rust identifies actions; spacing separates records
from editing; animation only communicates loading and control feedback. Existing
theme tokens and shared components supply all styling. No assets or libraries added.

## Functional verification

- PASS: 23 frontend tests, including mechanic validation, API payloads, and conflict details.
- PASS: 21 backend unit tests.
- PASS: 32 real MySQL integration tests, including assignment conflicts and concurrent scheduling.
- PASS: production Vite build, 25 modules transformed.
- PASS: browser created a customer, vehicle, service, mechanic, and appointment through the UI; confirmed the appointment, assigned and replaced its mechanic, moved it through InProgress to Completed, and read the saved mechanic ID/name from the API.
- PASS: browser exercised mechanic edit/cancel/reload, search/clear, active/inactive filtering, deactivation/reactivation, inactive assignment history, and the unsaved-booking assignment guard.
- PASS: browser exercised an intercepted HTTP 409 to verify visible conflict recovery; actual overlap rejection is covered separately by the real MySQL suite.
- PASS: browser exercised an intercepted connection failure, API settings/Escape, retry, and a held loading response.
- PASS: keyboard Tab moved from name to phone with a visible outline; invalid submission focused the name field.
- PASS: screenshots inspected at 1440px and 390px; mobile document width remained within the viewport; no browser page errors.
- PASS: changed tracked files pass git diff --check. Existing unrelated working changes are outside this verification scope.

Reproduce with the frontend running on port 4173:

```powershell
pwsh -NoProfile -File scripts/Run-BookingIntegrationTests.ps1 -VerifyFrontend -PlaywrightModule <installed-playwright-module-path>
```

The runner uses its own temporary MySQL server and database, plus an API on port
5273. It stops the test API and database afterward. Screenshots are in the ignored
`.verification` directory. Existing workshop records are not used for the walkthrough.

## Anti Slop delivery gate

Each row records the result for the added feature, not an audit of unrelated screens.

| Check | Result and evidence |
| --- | --- |
| R-02 em dashes | PASS: added interface copy contains none. |
| R-03 mobile overflow | PASS: browser width assertions and 390px captures. |
| R-17 statistics | PASS: counts come from API arrays; no invented statistics. |
| R-18 testimonials | PASS: none added. |
| R-23 assets/navigation | PASS: existing components reused; requested Mechanics destination exists. |
| R-24 navigation | PASS: all new navigation opens implemented workspaces. |
| R-25 text contrast | PASS: checked muted text/paper 6.81:1, white/rust 6.82:1, success/paper 6.75:1, error/raised paper 8.60:1 with the skill's contrast checker. |
| R-26 dead controls | PASS: create/edit/save/cancel, search/filter/clear, reload/retry/settings, assignment/replacement all have handlers; browser exercised them. |
| R-27 states | PASS: empty, filtered-empty, loading, API error, validation error, conflict, saving, and disabled states implemented; browser exercised recovery. |
| R-28 FAQ | PASS: none added. |
| R-32 keyboard | PASS: native form elements, associated labels, validation focus, keyboard Tab/outline and Escape checks. |
| R-33 source edits | PASS: feature authored directly in JSX and JavaScript using patches. |
| R-34 theme toggle | PASS: existing single light theme retained; no toggle introduced. |
| R-35 runtime | PASS: production build and successful real browser walkthrough. |
| R-36 unsupported claims | PASS: copy describes existing API behavior, verified by integration tests. |
| R-37 direction | PASS: existing workshop design inherited; dials and reasons recorded above. |
| R-38 fabricated content | PASS: production displays API records; clearly named verification records only created in the temporary database. |
| R-01 gradients/glows | PASS: no new decorative effects. |
| R-04 icons | PASS: no icon assets added. |
| R-06 typography | PASS: inherited service-manual heading voice and readable staff controls. |
| R-07 background pattern | PASS: none added. |
| R-08 arrows | PASS: none added to controls. |
| R-09 badges | PASS: active status is plain functional text. |
| R-10 glass | PASS: none added. |
| R-12 shadows | PASS: inherited action shadow only on primary buttons. |
| R-13 glow stacking | PASS: no glows. |
| R-14 uniform feature cards | PASS: desktop record table and mobile record cards serve actual records. |
| R-19 motion | PASS: inherited control/loading feedback, no new animations. |
| R-22 illustrations | PASS: none added. |
| Liveliness dials | PASS: ENERGY 1 / RHYTHM 2 / MOTION 1, inherited practical staff-tool treatment. |
| Liveliness consistency | PASS: screenshot comparison confirms existing typography, spacing, controls, and surfaces. |
| Liveliness focal point | PASS: workspace title and editing action organize each screen. |
| Liveliness whitespace | PASS: list/editor separation and grouped form fields use existing structural spacing. |
| Liveliness accent | PASS: rust primary actions and selected navigation. |
| Liveliness identity | PASS: inherited paper, rust rail, and service-manual typography. |
| Liveliness design read | PASS: existing design inspected before implementation; its purpose and dials recorded above. |
| C-1 intentionality | PASS: list supports finding staff, editor supports maintaining staff, separate assignment form protects saved scheduling details. |
| C-2 completeness | PASS: requested operations implemented and browser verified. |
| C-3 content | PASS: sections contain actual staff records and booking assignment. |
| C-4 resilience | PASS: loading/error/empty recovery, busy guards, mobile and keyboard checks. |
| C-5 evidence | PASS: data from API; scheduling behavior covered by MySQL tests. |
| R-05 composition | PASS: established operational list/editor composition retained. |
| R-11 radii | PASS: existing small control radii and larger mobile record radii. |
| R-15 action copy | PASS: Add mechanic, Save changes, Assign mechanic, Replace mechanic. |
| R-16 marketing language | PASS: no marketing claims or buzzwords added. |
| R-20 identity | PASS: matching incumbent workshop registry screens. |
| R-21 theme | PASS: existing daytime-workshop light theme retained. |
| R-29 palette | PASS: no colors added; existing semantic status colors reused. |
| R-30 imitation | PASS: existing project identity extended. |
| R-31 reasoning | PASS: visual purposes recorded in the design paragraph above. |
