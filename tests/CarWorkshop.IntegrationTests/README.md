# Booking API integration tests

These tests send HTTP requests through the real ASP.NET Core pipeline using
`WebApplicationFactory<Program>`, EF Core, and MySQL 8. The fixture applies the
checked-in migrations to a new `cw_it_<random GUID>` database. It drops
only that generated database when the suite finishes. It never reads the API's
User Secrets or uses the database name from the supplied connection string.

Use a dedicated local test server. Its account needs CREATE/DROP DATABASE and
normal table read/write privileges. No running API is required. The application
clock is fixed in the fixture so bookings do not expire as calendar time passes.
Each scenario has its own customer, vehicles, service, and booking day.

On Windows with PowerShell 7 and this project's extracted MySQL binaries, run
this command from the repository root:

```powershell
pwsh -NoProfile -File scripts/Run-BookingIntegrationTests.ps1
```

The script starts a new loopback-only MySQL instance on port 33307 with a random
test password, runs the suite, and stops the server in a `finally` block. It
removes its temporary database files and password file, retaining logs under
the ignored `.build-temp` directory. Use `-Port 33308` if the port is occupied,
or `-MySqlDirectory 'C:\path\to\mysql'` for another extracted MySQL installation.

For an already running dedicated test server:

```powershell
$env:WORKSHOP_TEST_MYSQL = 'Server=127.0.0.1;Port=33307;User ID=root;Password=YOUR_TEST_PASSWORD;SslMode=Required;'
dotnet test tests/CarWorkshop.IntegrationTests/CarWorkshop.IntegrationTests.csproj --configuration Release -m:1
Remove-Item Env:WORKSHOP_TEST_MYSQL
```

The environment variable is mandatory. Missing configuration or an unreachable
database fails the suite rather than silently skipping database checks. Release
builds avoid locking the output used by a running Debug API in Visual Studio.
If a test process is forcibly terminated, a generated test database may remain
on the dedicated test server; ordinary completion cleans it up.

Coverage includes persisted booking details and service snapshots, vehicle
ownership, Malaysia working-hour boundaries, inactive services, adjacent and
overlapping bookings, concurrent overlap/capacity requests, cancellation and
rejection freeing capacity, catalogue changes, invalid status transitions, and
failed reschedules preserving saved data. Concurrent edit protection remains
separate follow-up work; these concurrency tests check booking creation only.

GitHub Actions starts its own disposable MySQL service, runs both backend test
projects and the frontend tests/build, and uploads backend TRX reports. Its
database password is a public, disposable CI-only value. No workshop database
credentials or GitHub repository secrets are needed.

References: [ASP.NET Core integration testing](https://learn.microsoft.com/aspnet/core/test/integration-tests?view=aspnetcore-9.0)
and [GitHub Actions service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services).
