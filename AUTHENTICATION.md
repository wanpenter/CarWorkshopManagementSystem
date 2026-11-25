# Authentication, Roles & Dual-Portal Security

TorquePro uses **three role-based access levels** across **two separated portals**:

* **Customer Portal (`/`)** — Public customer self-registration and self-service booking portal (`Customer` role).
* **Staff & Admin Portal (`/staff`, `/admin`)** — Restricted internal operations console (`Staff` and `Admin` roles).

Login accounts are separate from mechanic records: a mechanic can be assigned to appointments without needing a sign-in account.

## Role & Access Matrix

| Capability | Customer (`/`) | Staff (`/staff`) | Admin (`/staff`) |
| --- | :---: | :---: | :---: |
| Self-register account (`POST /api/auth/register`) | Yes | No | No |
| Sign in via Customer Portal (`POST /api/auth/customer/login`) | Yes | No | No |
| Sign in via Staff Portal (`POST /api/auth/staff/login`) | No | Yes | Yes |
| Manage own profile, vehicles, bookings & receipts (`/api/portal/*`) | Yes (scoped) | — | — |
| Workshop dashboard, customers, vehicles, services, mechanics, appointments | No | Yes | Yes |
| Record completed service work & print service receipts | Own receipts only | Yes | Yes |
| Change own password (`POST /api/auth/change-password`) | Yes | Yes | Yes |
| List, create & update staff/admin accounts (`/api/users`) | No | No | Yes |
| Reset another user's password (`POST /api/users/{id}/reset-password`) | No | No | Yes |
| Inspect append-only Audit Log (`GET /api/audit-logs`) | No | No | Yes |
| Demote or deactivate own Admin account / remove last active Admin | No | No | No |

Every workshop API endpoint requires a valid authenticated session via the fallback authorization policy. Only `/api/health`, `/api/health/ready`, `/api/auth/csrf`, login endpoints, and `/api/auth/register` are anonymous — and all state-changing routes (including login, registration, and logout) require a valid CSRF token.

## First Administrator Bootstrap

Staff and Admin accounts cannot be publicly registered. Run the one-time bootstrap command before first use. It applies EF Core migrations and creates the initial `Admin` account only when no login accounts exist (it refuses to run again once any user exists):

```powershell
$env:WORKSHOP_ADMIN_USERNAME = Read-Host 'Administrator username'
$taskAdminSecret = Read-Host 'Administrator password (12 to 128 characters)' -AsSecureString
$env:WORKSHOP_ADMIN_PASSWORD = [Net.NetworkCredential]::new('', $taskAdminSecret).Password
try {
    dotnet run --project src/CarWorkshop.Api/CarWorkshop.Api.csproj --launch-profile http -- --bootstrap-admin
} finally {
    Remove-Item Env:WORKSHOP_ADMIN_USERNAME, Env:WORKSHOP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $taskAdminSecret = $null
}
```

Passwords are never accepted via command-line arguments or checked into configuration, and there are no hardcoded default credentials. Once signed in at `/staff`, the first Admin can create additional `Staff` or `Admin` accounts under **User accounts**.

## Security Controls

* **Portal-Scoped Authentication & Anti-IDOR**:
  * `/api/auth/customer/login` accepts only `Customer` accounts; `/api/auth/staff/login` accepts only `Staff` and `Admin` accounts. Cross-portal login attempts are rejected with a generic `401` and logged as `User.PortalAccessDenied` in the audit log.
  * Every `/api/portal/*` endpoint resolves the authenticated user's linked `CustomerId` from the database on each request so customers can never read or modify another customer's vehicles, appointments, or receipts.
* **Password Storage & Enumeration Resistance**:
  * Passwords are hashed using ASP.NET Core Identity's `PasswordHasher<WorkshopUser>` (automatic rehash on upgrade). Password hashes and session tokens are never exposed in DTOs or audit logs.
  * Unknown, inactive, or locked accounts execute a dummy password verification to mitigate timing-based username enumeration and always return a generic `401 Unauthorized` response.
  * Usernames allow 3–50 ASCII characters (`A-Z`, `a-z`, `0-9`, `.`, `_`, `-`), unique case-insensitively. Passwords require 12–128 characters (spaces preserved).
* **Brute-Force & Rate Limiting**:
  * Row-level database locking (`SELECT ... FOR UPDATE`) serializes failed login counters. Five consecutive failed attempts lock the account for **15 minutes** and record `User.LockedOut`.
  * Login and registration routes enforce a per-IP fixed-window rate limit of **60 requests per minute** (`429 Too Many Requests`).
* **Server-Side Sessions & Cookie Hardening**:
  * Authentication cookies (`.Workshop.Auth`) are `HttpOnly`, `SameSite=Strict`, `Secure` in non-development environments, and protected by ASP.NET Core Data Protection. No credentials or auth tokens are stored in `localStorage` or `sessionStorage`.
  * Sessions have a fixed **8-hour lifetime** (no sliding renewal) persisted in `WorkshopSessions` and validated against the active user record on every authenticated request.
  * Sign-out revokes the server session immediately (replaying a signed-out cookie returns `401`). Password changes, admin password resets, role edits, and account deactivation revoke **all** active sessions for that user.
* **CSRF Protection**:
  * Every write request (`POST`, `PUT`, `DELETE`), including login, registration, and logout, requires a fresh ASP.NET Core antiforgery token in the `X-CSRF-TOKEN` header fetched from `GET /api/auth/csrf`.
* **No-Store Caching & Security Headers**:
  * All `/api/*` responses include `Cache-Control: no-store` and `Pragma: no-cache` headers.
  * Every response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a correlation `X-Request-Id` header tied to structured request logs.

## Deployment Notes

* In local development, the React frontend runs on `http://127.0.0.1:4173` with Vite proxying `/api` to `http://127.0.0.1:5272`.
* In production, serve frontend and API over **HTTPS** behind the **same origin** (e.g., reverse proxy forwarding `/api` to ASP.NET Core). Set `ReverseProxy:TrustForwardedHeaders=true` when behind a trusted proxy so `ForwardedHeaders` honors `X-Forwarded-For` and `X-Forwarded-Proto`. Strict cookies intentionally disallow cross-site credentialed requests from unrelated domains.
* Set `WORKSHOP_DATA_PROTECTION_KEYS_PATH` to a mounted, permission-restricted directory so the ASP.NET Core Data Protection key ring persists across restarts/replicas (preventing surprise session invalidation). Run `--migrate` to apply EF Core migrations cleanly before starting traffic, and wire probes to `GET /api/health` (liveness) and `GET /api/health/ready` (MySQL readiness). Restrict database/backup access because `WorkshopUsers` and `WorkshopSessions` contain password hashes and session metadata.

## Verification

```powershell
# Backend unit tests
dotnet test tests/CarWorkshop.UnitTests/CarWorkshop.UnitTests.csproj -m:1

# Full MySQL integration + Playwright browser verification (auth, roles, customer portal, bookings)
pwsh -NoProfile -File scripts/Run-BookingIntegrationTests.ps1 -VerifyFrontend -PlaywrightModule <installed-playwright-module-path>
```

Implementation references: [ASP.NET Core Cookie Authentication](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-9.0) and [ASP.NET Core Antiforgery Protection](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-9.0).
