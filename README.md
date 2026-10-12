# Marketplace API

Express 5 API for the student marketplace. Supabase provides Auth, PostgreSQL,
and Storage. The API supports catalogue/reference data, buyer and seller
accounts, shops, listings, favourites, orders, reviews, messaging, notifications,
onboarding, verification, and admin moderation.

The frontend is maintained in the separate `marketplace-web` repository.
The versioned API contract is [docs/openapi.yaml](docs/openapi.yaml).
Contributor responsibilities are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## Local setup

Prerequisites: Node.js 22.13 or newer, npm, and Docker Desktop running Linux
containers. From this repository in PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env  # first setup only; keep existing local credentials
npm.cmd run supabase:start
npm.cmd run supabase:status
```

Copy the local publishable/anon and secret/service-role keys from the status
output into `.env`. Then choose one API runner:

```powershell
npm.cmd run dev                 # direct Node runner with built-in watch mode
```

or:

```powershell
docker compose up --build -d    # containerized API
```

Both use port 4000, so run only one at a time. Verify the listener with:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

`/api/health` is a process liveness check. Check a catalogue endpoint as well
when diagnosing Supabase connectivity:

```powershell
Invoke-RestMethod "http://localhost:4000/api/v1/products?limit=1"
```

| Local service             | URL                                                       |
| ------------------------- | --------------------------------------------------------- |
| API                       | `http://localhost:4000`                                   |
| Supabase API/Auth/Storage | `http://localhost:55321`                                  |
| PostgreSQL                | `postgresql://postgres:postgres@127.0.0.1:55322/postgres` |
| Studio                    | `http://localhost:55323`                                  |
| Email viewer              | `http://localhost:55324`                                  |

Supabase uses the 55320 port range because Windows may reserve its original
54320 range. Inspect exclusions with
`netsh interface ipv4 show excludedportrange protocol=tcp` if Docker cannot bind
a port. See [README.Docker.md](README.Docker.md) for Docker operations.

Stop the API with Ctrl+C or `docker compose down`. Stop Supabase with
`npm.cmd run supabase:stop`; its default behavior preserves local data.

## Configuration

Runtime configuration is loaded and validated in `src/config/env.js`.

| Variable                                      | Purpose                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `SUPABASE_URL`                                | Required project API origin.                                         |
| `SUPABASE_PUBLISHABLE_KEY`                    | Required public key for authentication.                              |
| `SUPABASE_SECRET_KEY`                         | Required privileged key for trusted server queries.                  |
| `PORT`                                        | Listener port, default 4000.                                         |
| `CORS_ORIGINS` / `CORS_ORIGIN`                | Comma-separated allowed origins, default `http://localhost:3000`.    |
| `TRUST_PROXY`                                 | Set `true` only behind the trusted single proxy expected by the app. |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`     | Positive integer limits, default 60000 / 120.                        |
| `PASSWORD_RESET_REDIRECT_URL`                 | Web password recovery destination.                                   |
| `BROWSER_SUPABASE_URL`                        | Browser-accessible origin for private signed preview URLs.           |
| `DOCKER_SUPABASE_URL` / `DOCKER_DATABASE_URL` | Compose values using `host.docker.internal`.                         |
| `DATABASE_URL`                                | Direct database tooling connection.                                  |

Never expose the secret/service-role key to the browser. Keep `.env` local.
Compose reads environment values during container creation; recreate the API
container after changing them. Public and privileged Supabase clients remain
separate in `src/config/supabase-auth.js` and `src/config/supabase.js`.

## Structure

```text
src/
  app.js                 Express construction, middleware, and route mounting
  server.js              Listener, signals, and graceful shutdown
  config/                Validated environment and Supabase clients
  routes/                URL/middleware composition, including v1.routes.js
  controllers/           HTTP request validation and response orchestration
  validators/            Pure input checks
  services/              Feature rules, queries, DTOs, and service errors
  http/                  Shared response envelopes and service error handling
  errors/                Base ApiError
  middleware/            Auth, uploads, headers, rate limiting, and logging
tests/
  unit/                  Isolated service/helper tests
  integration/           Express HTTP contracts with mocked services
  setup/                 Test environment
scripts/                 Syntax checks, local acceptance/smoke tests, admin setup
supabase/                Config, immutable migrations, seeds, and SQL tests
docs/                    OpenAPI, operations, and historical implementation reports
```

Routes under `/api/v1` are the primary interface. Legacy `/api/auth` and
`/api/products` mounts remain for compatibility. Responses use `{ data, meta? }`
or `{ error: { code, message, details?, request_id? } }`.

## Quality checks

```powershell
npm.cmd run format       # apply the shared formatting rules
npm.cmd run check        # format check, lint, JavaScript syntax, unit/integration tests
npm.cmd run audit:production
```

The `typecheck` and `build` scripts are JavaScript syntax checks, not static
type checks or bundling. The API runs source modules directly. `npm test` uses
mocked services and does not require a live database. Local smoke commands
exercise the real Supabase stack; see `scripts/acceptance-local.ps1` and
[docs/ADMIN_OPERATIONS.md](docs/ADMIN_OPERATIONS.md).

Database reset commands delete local data. Use new migrations for schema
changes and select the relevant smoke tests without resetting a working stack.
Historical implementation/readiness reports describe earlier snapshots;
current source, OpenAPI, CI results, and live acceptance checks take precedence.
