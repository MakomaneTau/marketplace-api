# Marketplace API

Express API for the Marketplace application. The service currently exposes a
health endpoint and includes an admin Supabase client for future data routes.

## Stack

- Node.js with ECMAScript modules
- Express 5
- Supabase (PostgreSQL, Auth, Storage, and local Studio)
- `nodemon` for development reloads

## Prerequisites

- Node.js 20 or newer
- npm
- Docker Desktop for Windows running Linux containers (required for local
  Supabase and the containerized API workflow)

## Local development

Install dependencies from this directory:

```powershell
cd marketplace-api
npm ci
```

### Run the API only

The health endpoint does not currently access Supabase, so the API can be
started without a database:

```powershell
npm run dev
```

The API listens on `http://localhost:4000` by default. Verify it with:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "message": "Marketplace API is running"
}
```

### Run with local Supabase

The Supabase CLI is installed as a development dependency and uses Docker for
its local services.

1. Start Docker Desktop.
2. Start Supabase and display its generated local credentials:

   ```powershell
   npm run supabase:start
   npm run supabase:status
   ```

3. Create `.env` in this directory using the values printed by
   `npm run supabase:status`:

   ```dotenv
   PORT=4000
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_PUBLISHABLE_KEY=<local publishable or anon key>
   SUPABASE_SECRET_KEY=<local secret or service_role key>
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   ```

4. Start the API in a second terminal:

   ```powershell
   npm run dev
   ```

Local Supabase services include:

| Service | URL |
| --- | --- |
| Data/Auth API | `http://127.0.0.1:54321` |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Local email viewer | `http://127.0.0.1:54324` |

Stop the local services when finished:

```powershell
npm run supabase:stop
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Express port; defaults to `4000`. |
| `SUPABASE_URL` | For Supabase routes | Local or hosted Supabase project URL. |
| `SUPABASE_SECRET_KEY` | For Supabase routes | Server-only secret/service-role key used by the admin client. |
| `SUPABASE_PUBLISHABLE_KEY` | Not yet used | Public/anon key reserved for non-admin Supabase access. |
| `DATABASE_URL` | Not yet used | Direct PostgreSQL connection string reserved for database tooling or a future SQL client. |

Never expose `SUPABASE_SECRET_KEY` to the browser or commit `.env`. The admin
client disables session persistence and token refresh because it is intended
for trusted server-side operations only.

The root `.gitignore` excludes local environment files. Still review
`git status` before committing to ensure credentials are not included.

## Run the API with Docker Desktop

With the local Supabase stack running, build and start the Express container:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:4000/api/health
```

The container uses `host.docker.internal` to reach Supabase ports published by
Docker Desktop on Windows. It cannot use `127.0.0.1` for Supabase because that
address refers back to the API container.

See [README.Docker.md](README.Docker.md) for first-time setup, the container
network flow, rebuild/stop commands, ports, and Windows troubleshooting.

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Confirms that the Express process is running. |

JSON request bodies are enabled. CORS currently accepts credentialed requests
only from `http://localhost:3000`; update the allow-list in `src/app.js` when
adding another local or deployed frontend origin.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run `src/app.js` with automatic reloads. |
| `npm run supabase:start` | Start the local Supabase stack. |
| `npm run supabase:status` | Show local service URLs and credentials. |
| `npm run supabase:stop` | Stop the local Supabase stack. |
| `npm run supabase:reset` | Recreate the local database and apply migrations/seed data. |
| `npm test` | Placeholder only; no automated test suite is configured yet. |

## Folder structure

```text
marketplace-api/
|-- src/
|   |-- app.js                 # Express setup, middleware, routes, and listener
|   `-- config/
|       `-- supabase.js        # Validated server-side Supabase admin client
|-- supabase/
|   `-- config.toml            # Local Supabase services and port configuration
|-- .env.example               # Safe host and Docker environment template
|-- .gitignore                 # Dependencies, secrets, and generated files
|-- Dockerfile                 # Production Express image definition
|-- compose.yaml               # Docker Desktop API service and health check
|-- package.json               # Dependencies and npm scripts
`-- README.Docker.md            # Docker Desktop for Windows runbook
```

There are currently no Supabase migrations or seed file in the repository.
Add schema changes under `supabase/migrations/` before relying on
`npm run supabase:reset` to reproduce a database.

## Current development notes

- `src/config/supabase.js` is ready for server-side use but is not yet imported
  by `src/app.js`; the current health route therefore does not test the database.
- Keep route handlers thin as the API grows. Put reusable business logic and
  data access in dedicated `services/` or `repositories/` modules.
- Validate request data and add centralized error handling before exposing
  write endpoints.
- Keep `.env.example` limited to safe placeholders as new required variables
  are introduced; never copy real keys into that tracked template.
- The Docker image is a production-style image and does not include `nodemon`
  or mount the source directory. Rebuild it after code changes.

## Related application

The frontend lives in the separate `marketplace-web` package and runs on
`http://localhost:3000` during development.
