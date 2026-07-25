# Running Marketplace API with Docker Desktop for Windows

This guide runs the Express API in its own Linux container while the Supabase
CLI manages the local database, Auth, Storage, Studio, and supporting
containers. Both sets of containers appear in Docker Desktop.

The Compose project is named `marketplace-api-service`, keeping the Express
container separate from the Supabase CLI group named `marketplace-api`. This
also ensures `docker compose down` targets only the Express service.

## How the containers connect

```text
Windows browser / PowerShell
        |
        | http://localhost:4000
        v
Marketplace API container
        |
        | http://host.docker.internal:54321
        v
Docker Desktop host bridge
        |
        v
Supabase API container
```

Inside the API container, `localhost` and `127.0.0.1` refer to the API
container itself. Docker Desktop provides `host.docker.internal` so the API can
reach Supabase through the ports published on Windows.

## Prerequisites

- Docker Desktop for Windows running Linux containers
- Docker Compose v2 (`docker compose`)
- Node.js 20 or newer and npm, used to run the local Supabase CLI

Verify Docker Desktop from PowerShell:

```powershell
docker version
docker compose version
```

## First-time setup

Run these commands from `marketplace-api`:

```powershell
npm ci
Copy-Item .env.example .env
npm run supabase:start
npm run supabase:status
```

Copy the publishable/anon and secret/service-role keys printed by
`npm run supabase:status` into `.env`:

```dotenv
PORT=4000
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<local publishable or anon key>
SUPABASE_SECRET_KEY=<local secret or service_role key>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Values used only from inside the API container on Docker Desktop.
DOCKER_SUPABASE_URL=http://host.docker.internal:54321
DOCKER_DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres
```

The normal URLs use `127.0.0.1` for commands running directly on Windows. The
`DOCKER_*` URLs use `host.docker.internal` for the containerized API. Compose
reads `.env` automatically for variable substitution; the file is not copied
into the image.

## Build and run the API container

Start or rebuild the API:

```powershell
docker compose up --build -d
```

Inspect its state and logs:

```powershell
docker compose ps
docker compose logs -f api
```

Press `Ctrl+C` to stop following logs; this does not stop the container.

Verify the API from Windows:

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

The service health should change to `healthy` in `docker compose ps` and Docker
Desktop.

## Everyday workflow

Start Supabase first, then the API:

```powershell
npm run supabase:start
docker compose up -d
```

Rebuild after changing source code or dependencies:

```powershell
docker compose up --build -d
```

The production container intentionally does not mount the source tree or run
`nodemon`. Use `npm run dev` directly on Windows when you want automatic
reloads.

Stop only the Express API container:

```powershell
docker compose down
```

Stop the Supabase CLI stack separately:

```powershell
npm run supabase:stop
```

`docker compose down` does not remove the Supabase containers or their data.
Do not delete Supabase volumes in Docker Desktop unless you intend to remove
the local database.

## Ports

| Windows port | Service |
| --- | --- |
| `3000` | Marketplace web app when run locally |
| `4000` | Containerized Express API |
| `54321` | Supabase Data/Auth API |
| `54322` | Supabase PostgreSQL |
| `54323` | Supabase Studio |
| `54324` | Supabase local email viewer |

## Configuration

The Compose service sets:

- `PORT=4000` inside the API container.
- `SUPABASE_URL` from `DOCKER_SUPABASE_URL`, defaulting to
  `http://host.docker.internal:54321`.
- `DATABASE_URL` from `DOCKER_DATABASE_URL`, defaulting to the local Supabase
  PostgreSQL port through `host.docker.internal`.
- Supabase keys from `.env`.

For a hosted Supabase project, set `DOCKER_SUPABASE_URL` and the keys to that
project's values. Do not commit `.env`, secret/service-role keys, or production
database credentials.

## Troubleshooting on Windows

### Docker commands cannot connect

Open Docker Desktop and wait until the lower-left status reports that the
engine is running. Confirm Docker Desktop is using Linux containers.

### Port 4000 is already in use

Stop the process or container using port `4000`, or change the host side of the
mapping in `compose.yaml`, for example `"4001:4000"`. The health URL would then
be `http://localhost:4001/api/health`.

### The API cannot reach Supabase

Check that the Supabase stack is running and that its API is published:

```powershell
npm run supabase:status
Invoke-RestMethod http://localhost:54321
```

For the containerized API, do not set `DOCKER_SUPABASE_URL` to `localhost` or
`127.0.0.1`; use `http://host.docker.internal:54321`.

### Environment changes are not applied

Recreate the API container after editing `.env`:

```powershell
docker compose up -d --force-recreate
```

### Review the resolved Compose configuration

This shows the configuration after `.env` substitution. It can include secret
values, so do not paste its output into tickets or commit it:

```powershell
docker compose config
```

## Build the image without Compose

```powershell
docker build -t marketplace-api:local .
docker run --rm -p 4000:4000 --env-file .env `
  --env SUPABASE_URL=http://host.docker.internal:54321 `
  --env DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres `
  marketplace-api:local
```

The explicit `--env` values override the Windows-host URLs in `.env`. Compose
handles this host/container URL difference automatically and is the
recommended Docker Desktop workflow.
