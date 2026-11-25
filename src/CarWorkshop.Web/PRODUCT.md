# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Customers (`/`):** Vehicle owners booking workshop maintenance and tracking their vehicle service history online without calling the service desk. They self-register, manage their own profile and vehicles, browse active workshop services, book or cancel appointments, follow job status, review completed service records, and print digital service receipts (`TP-YYYY-00001`).
- **Workshop Staff (`/staff`):** Front-desk and operations staff running daily workshop schedules. They monitor the operations dashboard, maintain customer records and owner-linked vehicles (including ownership transfers), manage the service catalogue and active mechanics, review requested bookings, assign mechanics, advance appointments through the service lifecycle, log actual work performed and odometer readings, and print receipts.
- **Workshop Administrators (`/staff`):** Hold all Staff operational capabilities plus governance responsibilities: creating and managing Staff/Admin login accounts, resetting user passwords, and inspecting the append-only Audit Log.
- **Evaluators & Reviewers:** UTEM academic evaluators and portfolio reviewers assessing the platform against real-world Malaysian workshop workflows and engineering standards.

## Product Purpose

TorquePro is a full-stack car workshop management platform and customer self-booking portal built as a UTEM project and portfolio showcase to real Malaysian workshop standards.

It replaces manual phone and paper workshop coordination with a single system covering the complete visit lifecycle—from customer self-booking and mechanic dispatch to odometer-tracked maintenance history and printable service receipts. Success means reliable concurrency-safe scheduling with zero double-booked mechanics or vehicles, clear operational traceability, strict separation between customer self-service and internal workshop controls, and truthful API-driven state with no placeholder metrics.

## Positioning

TorquePro pairs a dual-portal, 3-role RBAC architecture (`/` for Customers, `/staff` for Staff & Admin) with server-side anti-IDOR ownership checks, MySQL advisory-lock scheduling that prevents concurrent mechanic/vehicle/capacity conflicts, booking-time price and duration snapshots, and an append-only Admin Audit Log with before/after JSON diffs.

## Operating Context

- **Locale & workshop hours:** English UI following Malaysian workshop conventions—dates and times displayed in Malaysia time (`Asia/Kuala_Lumpur`, MYT) while persisted in UTC, prices formatted in MYR (`en-MY`), odometer readings in `km`, and strict 30-minute appointment slots within `08:30–17:30 MYT`.
- **Dual-portal web topology:** React 19 + Vite SPA (`src/CarWorkshop.Web`) backed by an ASP.NET Core 9 + EF Core 9 + MySQL 8 API (`src/CarWorkshop.Api`). Local development runs the web app on `http://127.0.0.1:4173` proxying `/api` to `http://127.0.0.1:5272`; production requires same-origin HTTPS due to strict cookies.
- **Mechanic records vs login accounts:** Mechanics are operational records assigned to appointments and do not require login accounts. Only active mechanics can receive new assignments; inactive mechanics remain visible in historical bookings.
- **Service receipts:** Completed appointments generate printable PDF service receipts (`TP-YYYY-00001`) showing booked service snapshots, actual work performed, odometer reading, and next-service-due mileage.

## Capabilities and Constraints

- **Confirmed capabilities:**
  - Customer portal (`/api/portal/*`): self-registration, profile editing, vehicle CRUD, active service browsing, live available slot picker (`/api/portal/availability`), self-booking and cancellation, status tracking, spare parts & invoice breakdown viewing, vehicle service history, and printable invoice/service receipts.
  - Staff & Admin operations (`/api/*`): operations dashboard (with live monthly collected revenue, outstanding invoice balance, and low-stock parts summary), customer and vehicle CRUD (including vehicle ownership transfer while preserving original appointment vehicle references), service catalogue activation/deactivation, spare parts inventory & stock adjustments (`/api/parts`), mechanic CRUD and job assignment, live slot availability (`/api/appointments/availability`), 1-click appointment workflow (`Requested → Confirmed → InProgress → Completed / Rejected / Cancelled`), mandatory mechanic assignment before work starts, job spare-parts usage with atomic stock deduction/restoration, auto-issued invoices (`INV-YYYY-00001`) with counter payment recording (`Cash`, `DuitNow QR`, `Card`, `Online Transfer`), post-completion service record and odometer logging, and printable PDF invoices/receipts.
  - Admin governance & production readiness: Staff/Admin account management, password resets, self-protection against demoting/deactivating the last active Admin, searchable append-only Audit Log with JSON diffs, security headers & `X-Request-Id` correlation, `GET /api/health/ready`, persistent Data Protection key path, and `--migrate` CLI.
- **Security & data invariants:**
  - `HttpOnly`, `SameSite=Strict` cookie sessions (8-hour fixed lifetime, no sliding renewal) backed by server-side `WorkshopSessions` revocation; zero credentials or auth tokens stored in `localStorage` or `sessionStorage`.
  - Per-request CSRF validation (`X-CSRF-TOKEN`), constant-time dummy password verification against username enumeration, row-level locked brute-force protection (5 failed attempts → 15-minute lockout), and per-IP rate limiting (60 req/min on login/register).
  - First Admin account is created via a one-time bootstrap command with no hardcoded default credentials.
  - Appointments are never hard-deleted (`Cancelled` / `Rejected` preserve history); service names, prices, and durations are retained as booking-time snapshots.
- **Scope boundaries:**
  - Active frontend target is `src/CarWorkshop.Web`.
  - The legacy `/api/cars` endpoint remains in the backend for compatibility only (authenticated) and is not mapped onto customer vehicles in the frontend.
  - The older gitignored `sites/workshop-frontend` ("Workshop Car Desk") preview export is outside scope.
- **Open decisions / current absences:**
  - Automated online payment gateway checkout (e.g., Stripe/FPX) is not implemented — invoices and counter/manual payment recording (`Cash`, `DuitNow QR`, `Card`, `Online Transfer`) are implemented, while third-party payment gateway integration remains out of scope.
  - Localization beyond English (e.g., Bahasa Melayu UI) is not currently planned; English UI with Malaysian conventions is the confirmed baseline.
  - Containerization / live production hosting details are deferred until the user builds the Docker deployment setup step by step.

## Brand Commitments

- **Product name:** **TorquePro** (supersedes the earlier draft name "Workshop Registry").
- **Workshop profile placeholders:** `src/CarWorkshop.Web/src/workshopProfile.js` defaults to `TorquePro Auto Workshop` (`Vehicle Maintenance & Service Centre`), `Melaka, Malaysia`, and `+60 6-000 0000` (configurable via `VITE_WORKSHOP_*` environment variables). The Melaka address and `+60 6-000 0000` phone number are confirmed placeholders, not a live physical storefront.
- **Truthful data rule:** All displayed counts, charts, visits, and histories must derive strictly from real API responses; empty datasets stay empty and unimplemented capabilities must not be presented as working features.

## Evidence on Hand

- **Project assets & docs:**
  - Hero photo asset: `src/CarWorkshop.Web/src/assets/workshop-hero.jpg`
  - Interface showcase screenshots: `docs/screenshots/customer-login-desktop.png`, `docs/screenshots/staff-login-desktop.png`, `docs/screenshots/staff-dashboard-desktop.png`, `docs/screenshots/customer-portal-desktop.png`
  - Architecture and security documentation: `README.md`, `AUTHENTICATION.md`
  - Automated verification suites: `tests/CarWorkshop.UnitTests`, `tests/CarWorkshop.IntegrationTests`, `src/CarWorkshop.Web/tests`, Playwright verification scripts in `scripts/`, and `.github/workflows/ci.yml`.
- **Absences (do not fabricate):** No real customer testimonials, client logos, press coverage, fabricated revenue figures (dashboard totals must always compute from real API invoice records), or verified storefront contact details (the default Melaka address and `+60 6-000 0000` phone are placeholders).

## Product Principles

1. **Operational integrity first:** Concurrency locks, booking-time service snapshots, preserved appointment history, and server-side ownership rules are core invariants that UI workflows must uphold.
2. **Clear role and portal isolation:** Customers act strictly within their own self-service boundary, Staff run daily workshop execution, and Admins control account governance and auditability.
3. **Real workshop realism in a showcase build:** Even as a UTEM project and portfolio piece, workflows, Malaysian locale rules (MYT, MYR, km, 30-minute slots), and security controls follow production workshop expectations.
4. **Truthful state over filler:** Loading, empty, disconnected, and error states reflect actual backend state—never substitute sample data, fake metrics, or implied payment features.
