# Custom DB Migration Setup

This project now supports `Firebase -> Custom Server DB` migration from the UI.

## 1. Start a migration server (local demo)

Run:

```bash
node scripts/custom-db/server.js
```

Optional env vars:

- `MIGRATION_PORT` (default `8787`)
- `MIGRATION_HOST` (default `0.0.0.0`)
- `CUSTOM_MIGRATION_TOKEN` (optional bearer token)
- `MIGRATION_DB_ENGINE` (`file` | `postgres` | `mysql`, default `file`)
- `CUSTOM_MIGRATION_DATA_DIR` (default `./tmp/custom-db`)
- `RUNTIME_SETTINGS_FILE` (default `./tmp/custom-db/runtime-settings.json`)
- `RUNTIME_SETTINGS_CORS_ORIGIN` (default `*`)

Postgres env:

- `POSTGRES_URL` (required when `MIGRATION_DB_ENGINE=postgres`)

MySQL env:

- `MYSQL_HOST` (required when `MIGRATION_DB_ENGINE=mysql`)
- `MYSQL_PORT` (default `3306`)
- `MYSQL_USER` (required when `MIGRATION_DB_ENGINE=mysql`)
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE` (required when `MIGRATION_DB_ENGINE=mysql`)

Server endpoints:

- `GET /health`
- `POST /migration/import`
- `POST /db/test`
- `GET /settings/firebase-runtime`
- `PUT /settings/firebase-runtime`
- `DELETE /settings/firebase-runtime`

By default (`file` engine) this server writes each collection to JSON files in `tmp/custom-db`.

## 1.1 Install server DB drivers

Run once:

```bash
npm install
```

The project now includes `pg` and `mysql2` for SQL import engines.

## 1.2 Run examples by engine

File engine (local demo):

```bash
npm run migration:server
```

Postgres engine:

```bash
MIGRATION_DB_ENGINE=postgres POSTGRES_URL="postgres://user:pass@localhost:5432/lucia" npm run migration:server
```

MySQL engine:

```bash
MIGRATION_DB_ENGINE=mysql MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=secret MYSQL_DATABASE=lucia npm run migration:server
```

## 2. Configure in UI

Add frontend env for persistent runtime DB selection:

```bash
VITE_RUNTIME_SETTINGS_API_BASE_URL=http://localhost:8787
```

Optional if endpoint requires auth:

```bash
VITE_RUNTIME_SETTINGS_API_TOKEN=your-token
```

To enable non-Firebase authentication mode (backend auth):

```bash
VITE_AUTH_API_BASE_URL=http://localhost:8787
```

Optional token for protected API:

```bash
VITE_AUTH_API_TOKEN=your-token
```

Auth API endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/admin-create-user` (admin session required)

To run assets module through backend API (MariaDB/Postgres) instead of Firebase realtime:

```bash
VITE_DATA_API_BASE_URL=http://localhost:8787
```

Optional auth token:

```bash
VITE_DATA_API_TOKEN=your-token
```

When this env is set, `useAssets` calls:

- `GET /api/assets`
- `POST /api/assets`
- `PUT /api/assets/:id`
- `DELETE /api/assets/:id`

`useServiceRequests` also switches to API mode and calls:

- `GET /api/service-requests`
- `POST /api/service-requests`
- `PUT /api/service-requests/:id`
- `DELETE /api/service-requests/:id`

Generic API for broad module migration:

- `GET /api/collections/:collection`
- `GET /api/collections/:collection/:id`
- `POST /api/collections/:collection`
- `PUT /api/collections/:collection/:id`
- `DELETE /api/collections/:collection/:id`

Currently switched to API mode when `VITE_DATA_API_BASE_URL` is set:

- `useAssets`
- `useServiceRequests`
- `useRestaurants`
- `useChecklists`
- `useProductBooking`
- `useMenuStructure`
- `useAssetFields`
- `useFieldPermissions`

Open `Database` tab and add connection:

- Type: `Custom Server DB (API)`
- API Base URL: `http://localhost:8787`
- Migration Path: `/migration/import`
- Health Path: `/health`
- DB Test Path: `/db/test`
- API Token: same value as `CUSTOM_MIGRATION_TOKEN` (if used)

For direct DB credentials from UI, fill one of these:

- MariaDB/MySQL: `DB Host`, `DB Port`, `DB User`, `DB Password`, `DB Name`
- PostgreSQL: `Postgres URL`

Then run migration:

- Source: Firebase connection
- Target: your Custom connection
- Select collections
- Click `Запустити міграцію`

## 3. Payload contract expected by your backend

The frontend sends:

```json
{
  "source": { "type": "firebase", "projectId": "your-project" },
  "target": {
    "type": "custom",
    "apiBaseUrl": "https://your-api",
    "dbEngine": "mysql",
    "dbHost": "127.0.0.1",
    "dbPort": 3306,
    "dbUser": "root",
    "dbPassword": "secret",
    "dbName": "lucia"
  },
  "collections": ["assets", "users"],
  "stats": { "assets": 120, "users": 8 },
  "data": {
    "assets": [{ "id": "a1", "data": { "name": "Asset 1" } }],
    "users": [{ "id": "u1", "data": { "email": "x@y.com" } }]
  },
  "migratedAt": "2026-03-09T10:00:00.000Z"
}
```

Expected response:

```json
{
  "ok": true,
  "importedCollections": { "assets": 120, "users": 8 }
}
```

## 4. SQL adapters in this repo

Integrated adapters:

- `scripts/custom-db/adapters/postgresAdapter.js`
- `scripts/custom-db/adapters/mysqlAdapter.js`

Reference examples (for custom changes):

- `scripts/custom-db/adapters/postgresAdapter.example.js`
- `scripts/custom-db/adapters/mysqlAdapter.example.js`

Recommended hardening before production:

- Add JWT or HMAC auth
- Limit body size and validate schema
- Add idempotency key and migration logs
- Add rate limits and CORS policy
- Migrate in chunks for very large datasets
