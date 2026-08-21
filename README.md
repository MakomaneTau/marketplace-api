# Marketplace API

Express and Supabase API for the Marketplace application. It currently exposes
health and authenticated-user endpoints together with public product discovery
and seller-owned product management.

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

### Run the API directly on Windows

The application initializes its Supabase clients at startup. Create `.env` with
the local Supabase URL, publishable key, and server-only secret key before
starting Express:

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
  "service": "marketplace-api"
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
   CORS_ORIGIN=http://localhost:3000
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
| `CORS_ORIGIN` | No | Allowed browser origin; defaults to `http://localhost:3000`. |
| `SUPABASE_URL` | For Supabase routes | Local or hosted Supabase project URL. |
| `SUPABASE_SECRET_KEY` | For Supabase routes | Server-only secret/service-role key used by the admin client. |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Public key used by the server to validate caller access tokens. |
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
| `GET` | `/api/v1/auth/me` | Returns the Supabase user for a valid bearer access token. |
| `GET` | `/api/v1/products` | Searches, filters, sorts, and paginates active products from open shops. |
| `GET` | `/api/v1/products/:id` | Returns one publicly visible product. |
| `POST` | `/api/v1/products` | Creates a product for an authenticated seller's shop. |
| `PATCH` | `/api/v1/products/:id` | Updates an authenticated seller-owned product. |
| `DELETE` | `/api/v1/products/:id` | Deletes an authenticated seller-owned product. |
| `GET` | `/api/v1/seller/products` | Lists the authenticated seller's inventory, including non-public statuses. |
| `POST` | `/api/v1/seller/products` | Creates a draft product in the authenticated seller's shop. |
| `PATCH` | `/api/v1/seller/products/:id` | Updates an authenticated seller-owned product. |
| `DELETE` | `/api/v1/seller/products/:id` | Deletes an owned product and its managed images. |
| `POST` | `/api/v1/seller/products/:id/images` | Appends one managed public product image. |
| `DELETE` | `/api/v1/seller/products/:id/images/:index` | Removes one managed product image by ordered index. |
| `GET` | `/api/v1/favourites` | Lists the authenticated user's currently public saved products. |
| `PUT` | `/api/v1/favourites/:productId` | Idempotently saves a public product. |
| `DELETE` | `/api/v1/favourites/:productId` | Removes a saved product. |
| `GET` | `/api/v1/orders` | Lists the authenticated buyer's orders. |
| `POST` | `/api/v1/orders` | Atomically creates a single-shop order and reserves stock. |
| `GET` | `/api/v1/orders/:id` | Returns an order to its buyer or seller. |
| `PATCH` | `/api/v1/orders/:id/status` | Cancels a new buyer order or applies a seller-controlled transition. |
| `GET` | `/api/v1/seller/orders` | Lists orders placed with the authenticated seller's shop. |
| `GET` | `/api/v1/seller/orders/:id` | Returns a seller-participating order. |
| `PATCH` | `/api/v1/seller/orders/:id/status` | Advances or cancels a seller order. |
| `GET/POST` | `/api/v1/conversations` | Lists conversations or starts an idempotent product conversation. |
| `GET` | `/api/v1/conversations/:id` | Returns a participant-scoped conversation and messages. |
| `POST` | `/api/v1/conversations/:id/messages` | Sends a message and notifies the other participant. |
| `PATCH` | `/api/v1/conversations/:id/read` | Marks incoming conversation messages read. |
| `GET` | `/api/v1/notifications` | Lists authenticated user notifications with unread filtering. |
| `PATCH` | `/api/v1/notifications/:id/read` | Marks one owned notification read. |
| `PATCH` | `/api/v1/notifications/read-all` | Marks all owned notifications read. |
| `POST` | `/api/v1/orders/:id/reviews` | Creates one verified review per completed-order product. |
| `GET` | `/api/v1/products/:id/reviews` | Lists public reviews for a product. |
| `GET` | `/api/v1/shops/:slug/reviews` | Lists public reviews for a shop. |
| `GET` | `/api/v1/categories` | Lists categories with public active-product counts. |
| `GET` | `/api/v1/categories/:slug` | Returns one category by slug. |
| `GET` | `/api/v1/universities` | Lists searchable universities with campus counts. |
| `GET` | `/api/v1/universities/:slug` | Returns a university and its campuses. |
| `GET` | `/api/v1/universities/:slug/campuses` | Lists campuses for a university. |
| `POST` | `/api/v1/auth/signup` | Creates a buyer or seller account. |
| `POST` | `/api/v1/auth/login` | Exchanges credentials for a Supabase session. |
| `POST` | `/api/v1/auth/refresh` | Rotates a valid refresh token. |
| `POST` | `/api/v1/auth/logout` | Revokes the authenticated user's sessions. |
| `POST` | `/api/v1/auth/forgot-password` | Requests password recovery without revealing account existence. |
| `POST` | `/api/v1/auth/reset-password` | Changes the password using a recovery access token. |
| `GET` | `/api/v1/profile` | Returns the authenticated marketplace profile. |
| `PATCH` | `/api/v1/profile` | Updates user-managed profile fields. |
| `GET` | `/api/v1/verifications/seller` | Returns the seller's latest verification state. |
| `POST` | `/api/v1/verifications/seller` | Uploads private `selfie` and `sellerId` verification images. |
| `GET` | `/api/v1/shops/:slug` | Returns an open public shop and pickup areas. |
| `GET` | `/api/v1/seller/shop` | Returns the authenticated seller's shop. |
| `POST` | `/api/v1/seller/shop` | Creates the seller's single shop. |
| `PATCH` | `/api/v1/seller/shop` | Updates shop identity and open state. |
| `PUT` | `/api/v1/seller/shop/pickup-areas` | Atomically replaces campus pickup areas. |
| `POST` | `/api/v1/seller/shop/logo` | Replaces the public shop logo image. |
| `POST` | `/api/v1/seller/shop/banner` | Replaces the public shop banner image. |

Protected endpoints require `Authorization: Bearer <Supabase access token>`.
The product write endpoints also verify the seller role and shop ownership.
Verification uploads accept JPEG, PNG, or WebP files up to 5 MB each. Their
content signatures are checked before storage in a private bucket, and API
responses never expose the stored object paths.
The former unversioned auth and product paths remain temporary compatibility
aliases. New consumers should use `/api/v1`.

Successful versioned responses use a top-level `data` member. Errors use an
`error` object with a stable code, message, and request ID. The same request ID
is returned in the `X-Request-Id` response header. See
[`docs/openapi.yaml`](docs/openapi.yaml) for the machine-readable contract.

JSON request bodies are enabled. CORS currently accepts credentialed requests
only from `http://localhost:3000`; update the allow-list in `src/app.js` when
adding another local or deployed frontend origin.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run `src/server.js` with automatic reloads. |
| `npm run typecheck` | Check the API JavaScript files for syntax errors. |
| `npm run build` | Run the API validation required for the production image. |
| `npm run supabase:start` | Start the local Supabase stack. |
| `npm run supabase:status` | Show local service URLs and credentials. |
| `npm run supabase:stop` | Stop the local Supabase stack. |
| `npm run supabase:reset` | Recreate the local database and apply migrations/seed data. |
| `npm run supabase:lint` | Lint the currently running local database schema. |
| `npm run smoke:local` | Exercise seeded authentication and product CRUD against running local services. |
| `npm run smoke:products` | Exercise the live seller catalogue workflow with disposable local records. |
| `npm run smoke:favourites` | Exercise the catalogue plus idempotent saved-product workflow. |
| `npm run smoke:orders` | Validate totals, transitions, and stock changes inside a rolled-back SQL transaction. |
| `npm run smoke:messaging` | Validate conversations, messages, and notification creation inside a rollback. |
| `npm test` | Run the Vitest integration test suite. |

## Folder structure

```text
marketplace-api/
|-- src/
|   |-- app.js                 # Express setup, middleware, and routes
|   |-- server.js              # Environment loading and HTTP listener
|   `-- config/
|       `-- supabase.js        # Validated server-side Supabase admin client
|-- supabase/
|   |-- config.toml            # Local Supabase services and ordered seeds
|   |-- migrations/            # Reproducible schema, RLS, grants, and functions
|   `-- seeds/                 # Local-only accounts and marketplace sample data
|-- scripts/
|   |-- smoke-local.js         # Live local Auth and product CRUD check
|   `-- smoke-products.js      # Disposable seller catalogue workflow check
|-- .env.example               # Safe host and Docker environment template
|-- .gitignore                 # Dependencies, secrets, and generated files
|-- Dockerfile                 # Production Express image definition
|-- compose.yaml               # Docker Desktop API service and health check
|-- tests/                     # Vitest/Supertest integration tests
|-- package.json               # Dependencies and npm scripts
`-- README.Docker.md            # Docker Desktop for Windows runbook
```

`npm run supabase:reset` replaces all current local rows, reapplies the ordered
migrations, and imports the configured local seeds. Do not run it when the
current local data must be preserved.

## Current development notes

- The health endpoint verifies only the Express process. Use
  `npm run smoke:local` to verify seeded Auth/product CRUD, or
  `npm run smoke:products` to verify seller-owned catalogue discovery and
  managed image storage. The product smoke test requires at least one seeded
  category and removes the user, shop, product, and image it creates.
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
