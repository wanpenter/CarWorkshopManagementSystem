# Workshop frontend

React + Tailwind CSS, built locally with Vite. The frontend calls the ASP.NET Core API, which stores customer and vehicle records in MySQL.

From this directory:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:4173. Start the backend from the repository root with:

```powershell
dotnet run --project src/CarWorkshop.Api/CarWorkshop.Api.csproj --launch-profile http
```

The default API URL is http://localhost:5272. API settings stores an override in browser storage. `.env.example` shows the optional Vite configuration; credentials must never be put in frontend environment variables.

`npm test` runs API-client and validation tests. `npm run build` generates the production frontend in `dist`.

## Source layout

- `src/main.jsx`: React root with Strict Mode.
- `src/App.jsx`: Connection state, coherent record loading, navigation, and mutation coordination.
- `src/components`: Customer and vehicle workspaces, shared form controls, and native dialogs.
- `src/api.js`: API client, request timeout, URL and input validation, and storage helpers.
- `src/index.css`: Tailwind import, theme tokens, reusable controls, and global browser styles.

Customer and vehicle CRUD, owner filtering, search, validation, delete confirmations, and API settings are implemented. Registration numbers are normalized before writing, and customer summaries are refreshed after vehicle changes so ownership counts stay current.

The older `/api/cars` endpoint and its existing records remain in the backend for compatibility. This frontend uses `/api/customers` and `/api/vehicles`; it does not guess how legacy car rows should be assigned to customers. Authentication and appointment booking remain future modules, so the current backend should stay local.

## Verification

Run `npm test` and `npm run build` after frontend changes. End-to-end browser verification also requires the API and MySQL to be running with the Customer and Vehicle migration applied.
