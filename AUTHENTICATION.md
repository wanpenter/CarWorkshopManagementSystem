# Login and account access

Workshop Registry uses two login roles. Login accounts are separate from mechanic
records: a mechanic can appear on appointments without needing a sign-in account.

| Action | Staff | Admin |
| --- | --- | --- |
| Dashboard and workshop records | Yes | Yes |
| Customers, vehicles, services, mechanics, appointments | Existing operations | Existing operations |
| Change own password | Yes | Yes |
| List/create login accounts | No | Yes |
| Edit account name, role, active status | No | Yes |
| Reset another user's password | No | Yes |
| Demote or deactivate own Admin account | No | No |

Every workshop API endpoint, including the older cars endpoint, requires a valid
session. The health probe and CSRF-token endpoint are public; sign-in is public
but requires a valid CSRF token. There is no public account registration.

## First administrator

Run the bootstrap command once before normal use. It applies migrations and
creates the first Admin only if there are no login accounts. It refuses to run
again once an account exists. Configure the database through the API's User
Secrets as described in README.md, then run from the repository root:

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

This exits after setup; start the normal API and frontend afterward. Passwords
are not accepted as command-line arguments or checked into configuration. There
are no built-in default credentials. The first Admin can use **User accounts** to
create Staff or additional Admin accounts.

The local setup performed for this task stores its generated first-login details
in `.build-temp/initial-admin-credentials.txt`, when a first administrator was
created. That directory is ignored by Git. Use **My account** to replace the
initial password with your own, then remove the credential note when no longer
needed. A different installation should use the interactive setup above.

## How access works

- Passwords are hashed using ASP.NET Core Identity's `PasswordHasher`. Password
  hashes, plaintext passwords, and session cookies are never returned in account DTOs.
- Usernames are 3–50 ASCII letters, digits, periods, underscores, or hyphens, and
  are unique without regard to letter case. Full names are limited to 100 characters.
- New and reset passwords are 12–128 characters. Passwords are not trimmed, so
  passphrases retain the spaces the user typed.
- Sign-in sets an HttpOnly, SameSite=Strict cookie, protected by ASP.NET Core Data
  Protection. JavaScript does not store credentials or authentication tokens in
  localStorage/sessionStorage. The only existing stored frontend setting is the API address.
- A session has a fixed eight-hour lifetime, without sliding renewal. Its database
  record and active user are checked on each authenticated request.
- Sign-out revokes the server session and clears the cookie. Replaying a signed-out
  cookie does not restore access. Other concurrent sessions remain until their own
  sign-out, expiry, or account/password revocation.
- Password change/reset, role changes, and deactivation revoke all sessions for
  that user. React clears records on a 401 and checks sessions on focus and at
  one-minute intervals while visible. Server access is denied immediately; an idle
  screen updates on the next check or request.
- Five failed password attempts lock an account for 15 minutes. Login also has a
  per-IP limit of 60 attempts per minute. Failed/inactive/locked sign-ins use a
  generic response to avoid identifying accounts.
- Every write, including login and logout, requires the ASP.NET Core antiforgery
  token in `X-CSRF-TOKEN`. The client requests a fresh token before each write so
  identity changes and other browser tabs do not leave it using an old token.
- API requests return 401 when no valid session exists and 403 when an authenticated
  role lacks permission. Admin controls are protected by the API as well as hidden
  in the Staff interface.
- Admins can disable accounts, but accounts cannot be deleted through this module.
  Self-demotion/deactivation and removal of the last active Admin are rejected.

## Running and deployment

The local frontend remains `http://127.0.0.1:4173`, with Vite forwarding `/api`
to `http://127.0.0.1:5272`. Use the same host consistently (localhost or 127.0.0.1).
Different ports on that host are supported when the origin is explicitly allowed.

For deployment, use HTTPS and host frontend/API on the same site, preferably behind
one origin with an `/api` reverse proxy. Strict cookies intentionally do not support
an unrelated frontend domain making cross-site authenticated requests. Production
cookies require HTTPS. Only exact configured frontend origins receive credentialed
CORS permission; wildcard credentialed CORS is not enabled. Keep the Data Protection
key ring persistent and protected across restarts/instances when deploying.

Apply the authentication migration before using the updated API. It adds
WorkshopUsers and WorkshopSessions without replacing existing workshop tables.
Protect database access and backups because they now include password hashes and
session metadata. Email recovery, MFA, and public customer accounts are outside
the current scope; password recovery is an Admin reset in User accounts.

## Checks

```powershell
dotnet test tests/CarWorkshop.UnitTests/CarWorkshop.UnitTests.csproj -m:1
pwsh -NoProfile -File scripts/Run-BookingIntegrationTests.ps1 -VerifyFrontend -PlaywrightModule <installed-playwright-module-path>
pwsh -NoProfile -File scripts/Verify-CustomerVehicle.ps1 -Credential (Get-Credential)
```

The integration runner creates a disposable MySQL server, an isolated Admin, and
its own verification API on port 5273. It runs the existing booking workflow and
the new login/role/account browser scenarios. Verification passwords are generated
at runtime and passed through process environment variables without printing them.
The customer/vehicle script logs in and uses cookies plus CSRF for its checks.

Implementation references: [ASP.NET Core cookie authentication](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-9.0)
and [ASP.NET Core antiforgery protection](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-9.0).
