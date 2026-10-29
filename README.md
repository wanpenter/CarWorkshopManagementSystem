# Car Workshop Management System V2

Local development stack: React, Tailwind CSS, ASP.NET Core, Entity Framework Core, and MySQL.

Staff now sign in before viewing workshop records. Admins also manage login
accounts, roles, active status, and password resets. Read [AUTHENTICATION.md](AUTHENTICATION.md)
for first-Admin setup, the role matrix, session behavior, and deployment requirements.

Staff can create and edit customers, register vehicles under an owner, change
ownership, and search and filter records. Each vehicle has a unique registration
number. A customer with vehicles cannot be deleted until those vehicles are moved
or removed. The service catalogue records current prices and estimated durations.
Appointments link a customer and vehicle to one or more services and keep a copy of
each selected service's name, price, and duration at booking time.

## Run locally

Start MySQL with the database configured for `CarWorkshop.Api`. In Visual Studio,
right-click `CarWorkshop.Api` and select **Manage User Secrets**. Set
`ConnectionStrings:DefaultConnection` to your local MySQL connection string in
the secrets editor. Keep the password out of `appsettings.json` and Git. The
database account must have permission to apply migrations. Apply migrations,
then open two terminals at the repository root.

Database (on first setup and after pulling new migrations):

```powershell
dotnet ef database update --project src/CarWorkshop.Infrastructure --startup-project src/CarWorkshop.Api
```

API:

```powershell
dotnet run --project src/CarWorkshop.Api/CarWorkshop.Api.csproj --launch-profile http
```

Frontend:

```powershell
Set-Location src/CarWorkshop.Web
npm ci
npm run dev
```

Open http://127.0.0.1:4173. In local development, the frontend calls `/api` on its own address and Vite forwards those requests to the C# API at http://127.0.0.1:5272. API settings can override the address in the browser. Set `VITE_API_BASE_URL` in the frontend's `.env.local` only when using a separately hosted API; restart Vite after changing it. Only public configuration belongs in `VITE_` variables because these values are sent to the browser.

## Project structure

| Project | Responsibility |
| --- | --- |
| `src/CarWorkshop.Web` | React components, Tailwind styling, browser state, API client |
| `src/CarWorkshop.Api` | HTTP endpoints, input validation, dependency registration |
| `src/CarWorkshop.Application` | Customer, vehicle, service, and appointment use cases, contracts, and repository interfaces |
| `src/CarWorkshop.Domain` | Entities and core business rules |
| `src/CarWorkshop.Infrastructure` | EF Core context, migrations, MySQL persistence |
| `tests` | Backend unit and integration test projects |

The browser calls the API. Customer, vehicle, service, and appointment requests pass through the API,
Application, Domain, and Infrastructure layers before EF Core writes to MySQL.
The older `/api/cars` endpoint remains for its existing Brand/Model records. Those
rows lack an owner and registration number, so they are preserved separately and
are not automatically converted into vehicles. The old `CarService` still lives
in Api; new features use the layered structure.

The API routes include `/api/customers`, `/api/customers/{id}`,
`/api/customers/{id}/vehicles`, `/api/vehicles`, and `/api/vehicles/{id}`.
`GET /api/vehicles?customerId={id}` filters vehicles by owner. Customer and
vehicle writes use JSON. Validation returns HTTP 400, missing records 404,
and duplicate registrations or protected customer deletion 409.

Services use `/api/services` and `/api/services/{id}`. New bookings select one or
more active services by ID. Inactive services cannot be added to new bookings, but
existing bookings retain their service snapshots. Appointments use
`/api/appointments` and `/api/appointments/{id}`. New bookings start as `Requested`.
Staff can confirm or reject them; confirmed bookings can move to `InProgress`, then
`Completed`, or be cancelled before completion. The selected vehicle must belong to
the selected customer. Booking starts must be on a 30-minute interval between
08:30 and 17:00 Malaysia time; the estimated work must finish by 17:30. At most 10
active bookings are allowed per day, and the same vehicle cannot have overlapping
active bookings. Appointment times are stored in UTC. Customers and vehicles linked
to appointments are protected from deletion to preserve history. Appointments from
the earlier free-text service version remain readable.

Mechanics use `/api/mechanics` for listing and creation, and `/api/mechanics/{id}`
for reading and updating details or active status. Assign or replace an appointment's
mechanic with `PUT /api/appointments/{id}/mechanic` and JSON `{"mechanicId": 1}`.
The mechanic must exist and be active; the appointment must be Confirmed or Scheduled
and have an estimated end time. Appointment responses include nullable `mechanicId`
and `mechanicName`. Existing unassigned bookings remain valid.

Assignments and appointment updates reject overlapping jobs for the same mechanic,
including changes to the start time or service duration. Jobs ending exactly when
another begins are allowed. Cancelled and Rejected appointments do not block the
mechanic's schedule. Failed assignments or reschedules leave saved data unchanged.
A shared MySQL scheduling lock serializes assignment and appointment updates before
reading the booking; the existing daily lock still protects booking capacity.
This favors simple, correct scheduling over parallel updates across unrelated days.
Deactivation prevents new assignments and preserves existing assignments and history.

The Mechanics tab supports creating and editing staff, searching by name or phone,
and activating or deactivating mechanics. In Appointments, edit a confirmed or
scheduled booking to assign or replace its mechanic. Save booking changes before
assigning staff. The API rejects overlapping jobs and the editor displays the
conflict while keeping the booking open. Assigned names appear in the appointment
list and remain visible in completed records.

Login and Admin/Staff access control protect the API and frontend. Actual service
history remains a later module. Configure the first Admin before normal use.

## Verify

```powershell
dotnet test tests/CarWorkshop.UnitTests/CarWorkshop.UnitTests.csproj -m:1
pwsh -NoProfile -File scripts/Verify-CustomerVehicle.ps1 -Credential (Get-Credential)
Set-Location src/CarWorkshop.Web
npm test
npm run build
```

The PowerShell 7 verification script requires a running API and MySQL. It creates
temporary customers and vehicles, checks the real database behavior, then removes
only those test records. Its checks include a concurrent duplicate registration
attempt and preservation of legacy `/api/cars` data.

Automated booking API/database checks are in
[`tests/CarWorkshop.IntegrationTests`](tests/CarWorkshop.IntegrationTests/README.md).
They require `WORKSHOP_TEST_MYSQL` pointing to a dedicated MySQL test server and
create their own temporary database. GitHub Actions runs the domain tests, real
MySQL integration tests, frontend tests, and production builds on pushes and pull
requests. Backend test reports are attached to each workflow run.

Development CORS allows only configured local frontend origins on port 4173, with
cookie credentials and the CSRF header. The HTTPS profile requires a trusted
developer certificate; the commands above use the HTTP development profile.
Use HTTPS and the same site for frontend/API when deploying.
