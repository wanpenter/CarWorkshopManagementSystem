# Car Workshop Management System V2

Local development stack: React, Tailwind CSS, ASP.NET Core, Entity Framework Core, and MySQL.

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

Authentication, mechanic assignment, and actual service history are later
modules. Run this unauthenticated version only in a trusted local environment.

## Verify

```powershell
dotnet test tests/CarWorkshop.UnitTests/CarWorkshop.UnitTests.csproj -m:1
pwsh -NoProfile -File scripts/Verify-CustomerVehicle.ps1
Set-Location src/CarWorkshop.Web
npm test
npm run build
```

The PowerShell 7 verification script requires a running API and MySQL. It creates
temporary customers and vehicles, checks the real database behavior, then removes
only those test records. Its checks include a concurrent duplicate registration
attempt and preservation of legacy `/api/cars` data.

Development CORS allows only the local frontend origins on port 4173. The current API has no authentication and is intended for local development. Its HTTPS profile requires a valid trusted developer certificate; the commands above use the HTTP development profile.
