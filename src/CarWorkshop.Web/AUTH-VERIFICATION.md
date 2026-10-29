# Authentication verification, 29 October 2026

Implemented login/logout, Admin/Staff authorization, Admin account creation and
editing, deactivation/reactivation, password reset, and self-service password
change. Mechanics remain independent from login accounts. See the repository's
AUTHENTICATION.md for setup, role permissions, session policy, and deployment.

## Evidence

- PASS: 28 frontend tests, including credentialed requests, fresh CSRF, validation
  field mapping, 401 session expiry, and 403 permission denial without logout.
- PASS: 21 domain regression tests.
- PASS: 47 real MySQL integration tests (32 booking/mechanic and 15 auth/security).
- PASS: production Vite build, 32 modules.
- PASS: real browser booking flow through completion under authenticated access.
- PASS: browser Admin creates, edits, deactivates/reactivates and resets Staff;
  Staff uses workshop records but receives API 403 for account administration.
- PASS: wrong password, reload persistence, own password change, sign-out, cookie
  replay rejection, immediate server revocation, and UI session-expiry handling.
- PASS: HttpOnly Strict cookie and absence of credentials in browser storage;
  anonymous module requests denied; login without CSRF rejected.
- PASS: desktop/phone login, users, and account screenshots inspected; phone width
  assertions and browser page-error assertions passed.
- PASS: first local Admin created by bootstrap after additive migration; generated
  credentials remain in Git-ignored .build-temp/initial-admin-credentials.txt.

Final combined run: scripts/Run-BookingIntegrationTests.ps1 -VerifyFrontend;
TRX User_WAND103_2026-10-29_14_50_29.trx. Both browser scripts printed PASS and the
temporary verification API/database were stopped. No test users were added to
the actual workshop database. Local API /api/auth/me returns 401 without login.

## Design delivery gate

ENERGY 1 / RHYTHM 2 / MOTION 1. Existing screenshot-directed white/grey/orange
system retained. Login separates identity entry from workshop data; account
screens retain records/editor composition. Framework and browser failures found
during implementation were corrected before the successful verification run.

| Gate | Result and evidence |
| --- | --- |
| R-02, R-16 copy | PASS: concrete sign-in/account controls; no em dash or marketing claims added to operational forms. |
| R-03, C-4 responsive | PASS: desktop/phone screenshots and overflow assertions. |
| R-17, R-18, R-36, R-38 truth | PASS: real account DTOs; no fabricated users/metrics in production UI. |
| R-23, R-24 navigation/assets | PASS: existing brand retained; Admin users and both-role account destinations implemented. |
| R-25 contrast | PASS: existing neutral/white 5.60:1, neutral/grey 5.23:1, white/orange 5.18:1 and dark-orange/peach 6.57:1 palette retained. |
| R-26, C-2 controls | PASS: sign-in/out, create/edit/status/reset, password change exercised end to end. |
| R-27 states | PASS: session checking, signed out, loading/error/retry, validation, saving, disabled/self-protection states implemented. |
| R-28 FAQ | PASS: none added. |
| R-32 keyboard | PASS: labeled native fields, password visibility buttons, first-error focus and existing navigation/dialog behavior retained. |
| R-33 source | PASS: authored React/CSS source edits. |
| R-34, R-21 theme | PASS: established user-directed light theme retained. |
| R-35 runtime | PASS: build, MySQL tests and two real browser workflows passed. |
| R-37 direction | PASS: established DESIGN.md and reference-based layout inherited. |
| R-01, R-07, R-10, R-13 effects | PASS: no decorative gradients, patterns, glass or glows introduced. |
| R-04, R-08 icons | PASS: functional account/navigation SVGs; no decorative arrow proliferation. |
| R-06 typography | PASS: existing readable administrative sans-serif system. |
| R-09 badges | PASS: Active/Inactive communicates real account status. |
| R-12 depth | PASS: login surface and existing dialogs use restrained soft shadows. |
| R-14, R-05, C-3 composition | PASS: login form and account/editor structure follow actual tasks. |
| R-19 motion | PASS: loading/control feedback, reduced-motion support. |
| R-22 illustration | PASS: none added. |
| Liveliness | PASS: declared dials reflected in quiet staff UI, clear sign-in focal point, grouped fields, orange action emphasis, existing brand. |
| C-1, R-31 intention | PASS: form grouping separates identity, permissions, and password changes. |
| C-5 evidence | PASS: real API/database results substantiate behavior. |
| R-11 shape | PASS: established control/panel radii. |
| R-15 labels | PASS: Sign in, Sign out, Create user, Save changes, Reset password, Change password. |
| R-20, R-30 identity | PASS: existing Workshop Registry appearance retained. |
| R-29 palette | PASS: existing neutrals/orange plus semantic status colors. |

These are local verified changes, not a claim of a penetration test or a deployed
production service. Production requires HTTPS, same-site hosting, and persistent
protected Data Protection keys as documented. Email recovery/MFA remain outside scope.
