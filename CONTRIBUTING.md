# Maintaining Marketplace API

Use Node.js 22.13 or newer and install from the lockfile with `npm.cmd ci`.
Before a pull request, run `npm.cmd run check`. Run the relevant local smoke
tests when changing database queries, authentication, uploads, or transactions.

## Code boundaries

- `src/routes/` maps URLs and applies authentication/upload middleware.
- `src/controllers/` validates requests, calls services, and sends HTTP responses.
- `src/validators/` checks input without accessing the database or HTTP response.
- `src/services/` owns business rules, Supabase queries, and response DTOs.
- `src/config/` owns validated environment configuration and the separate public
  and privileged Supabase clients.
- `src/http/`, `src/errors/`, and `src/middleware/` contain shared HTTP behavior.

Keep one feature per file in each layer, named `feature.controller.js`,
`feature.service.js`, `feature.routes.js`, or `feature.validator.js`. Add a layer
only when it has a real responsibility. Services may share other services;
they must not import controllers, routes, or Express response objects.

Service errors extend `ApiError`. Controllers use `createServiceErrorHandler`
with a predicate for the error classes they own. Unknown exceptions receive a
generic response; do not send raw database errors or credentials to clients.
Preserve the `{ data, meta? }` and `{ error }` envelopes and request IDs.

## Configuration and operations

Read runtime values from `src/config/env.js`. New required values need a safe
placeholder in `.env.example` and documentation in the README. Do not commit
`.env`, copied keys, local SQL scratch files, logs, or generated reports.
The web gateway uses the versioned `/api/v1` API. Keep compatibility routes
until all consumers have migrated.

`src/app.js` constructs the app for tests; `src/server.js` owns the listener and
shutdown. Health is a liveness check, not proof of database/Auth availability.
The in-memory rate limiter expires inactive clients, but a multi-instance
deployment still needs a shared rate-limit store.

## Database changes

Keep existing migrations immutable. Add new migrations for schema or grant
changes, update `docs/openapi.yaml` when the API contract changes, and test both
ownership checks and failure paths. Preserve the local database unless a reset
is explicitly requested. Smoke scripts must clean up their temporary records
without hiding the original test failure.

## Quality and dependencies

Formatting uses a [pinned Prettier version](https://prettier.io/docs/install).
Use `npm.cmd run format` and `npm.cmd run lint:fix`, then run `npm.cmd run check`.
The historical `typecheck` command checks JavaScript syntax; it is not a static
type checker. Unit/integration tests mock external services. Local smoke tests
exercise the real stack and belong in a separate acceptance step.

Review dependency updates separately from feature work. Use the lockfile,
apply compatible security patches, and run the full check suite. Avoid
`npm audit fix --force` because it can downgrade or change framework contracts.
