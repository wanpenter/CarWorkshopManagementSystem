# Workshop frontend

React + Tailwind CSS, built locally with Vite. The frontend calls the ASP.NET Core API, which stores customer, vehicle, and appointment records in MySQL.

The current interface is a working design draft based on the user's dashboard
reference. It opens on a live workshop overview with sidebar navigation on desktop
and a navigation menu on phones. See DESIGN.md for the visual direction and
REDESIGN-VERIFICATION.md for the checks performed.

From this directory:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:4173. Start the backend from the repository root with:

```powershell
dotnet run --project src/CarWorkshop.Api/CarWorkshop.Api.csproj --launch-profile http
```

The frontend uses its own address for `/api` by default. During local development, Vite forwards those requests to the C# API at http://127.0.0.1:5272. API settings stores an override in browser storage. `.env.example` shows the optional configuration for a separately hosted API; credentials must never be put in frontend environment variables.

`npm test` runs API-client and validation tests. `npm run build` generates the production frontend in `dist`.

## Source layout

- `src/main.jsx`: React root with Strict Mode.
- `src/App.jsx`: Connection state, coherent record loading, navigation, and mutation coordination.
- `src/components`: Customer, vehicle, service, mechanic, and appointment workspaces, shared form controls, and native dialogs.
- `src/api.js`: API client, request timeout, URL and input validation, and storage helpers.
- `src/index.css`: Tailwind import, theme tokens, reusable controls, and global browser styles.

Customer and vehicle CRUD, service catalogue, mechanic management and assignment,
appointment booking and status updates, filtering, search, validation, delete
confirmations, and API settings are implemented. All five record lists refresh
together after a change. Appointment times are entered in Malaysia time and sent
to the API as UTC. Mechanic assignment uses the saved booking schedule and is
disabled while booking changes are unsaved. Only active mechanics can receive
assignments; previously assigned inactive mechanics remain visible in history.

An appointment belongs to a booked customer and one of that customer's vehicles. The vehicle selector follows the selected customer. Existing appointments keep showing their original vehicle when that vehicle is later reassigned, so staff can still understand the historical booking. Appointments are cancelled through the `Cancelled` status; the frontend does not delete appointment history.

The older `/api/cars` endpoint and its existing records remain in the backend for compatibility. This frontend uses `/api/customers`, `/api/vehicles`, and `/api/appointments`; it does not guess how legacy car rows should be assigned to customers. Authentication remains a future module, so the current backend should stay local.

## Verification

Run `npm test` and `npm run build` after frontend changes. End-to-end browser verification also requires the API and MySQL to be running with the Customer and Vehicle migration applied.
