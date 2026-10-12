# Car Workshop Management System V2

Local development stack: React, Tailwind CSS, ASP.NET Core, Entity Framework Core, and MySQL.

The Customer and Vehicle module is ready for local use. Staff can create and edit
customers, register vehicles under an owner, change ownership, search and filter,
and delete records. Each vehicle has a unique registration number. A customer with
vehicles cannot be deleted until those vehicles are moved or removed.

## Run locally

Start MySQL with the database configured for `CarWorkshop.Api`. Apply migrations,
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

Open http://127.0.0.1:4173. The frontend calls http://localhost:5272 by default. API settings can override that URL in the browser. Set `VITE_API_BASE_URL` in the frontend's `.env.local` to change the build-time default; restart Vite after changing it. Only public configuration belongs in `VITE_` variables because these values are sent to the browser.

## Project structure

| Project | Responsibility |
| --- | --- |
| `src/CarWorkshop.Web` | React components, Tailwind styling, browser state, API client |
| `src/CarWorkshop.Api` | HTTP endpoints, input validation, dependency registration |
| `src/CarWorkshop.Application` | Customer and vehicle use cases, contracts, and repository interfaces |
| `src/CarWorkshop.Domain` | Entities and core business rules |
| `src/CarWorkshop.Infrastructure` | EF Core context, migrations, MySQL persistence |
| `tests` | Backend unit and integration test projects |

The browser calls the API. Customer and vehicle requests pass through the API,
Application, Domain, and Infrastructure layers before EF Core writes to MySQL.
The older `/api/cars` endpoint remains for its existing Brand/Model records. Those
rows lack an owner and registration number, so they are preserved separately and
are not automatically converted into vehicles. The old `CarService` still lives
in Api; new features use the layered structure.

The new API routes are `/api/customers`, `/api/customers/{id}`,
`/api/customers/{id}/vehicles`, `/api/vehicles`, and `/api/vehicles/{id}`.
`GET /api/vehicles?customerId={id}` filters vehicles by owner. Customer and
vehicle writes use JSON. Validation returns HTTP 400, missing records 404,
and duplicate registrations or protected customer deletion 409.

Authentication, appointments, mechanic assignment, and service history are later
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
