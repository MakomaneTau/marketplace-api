# API Readiness Report

Validated locally on 2026-08-21 from the API-only web-parity integration series.
The web application remains disconnected and was not changed.

## Implemented surface

- Versioned contract, structured errors, request IDs, security headers, CORS,
  throttling, OpenAPI, and temporary legacy auth/product aliases.
- Reference data, authentication, account profiles, seller verification, private
  documents, public marketplace images, shops, and pickup campuses.
- Public catalogue discovery, seller inventory, managed images, favourites,
  transactional orders, stock restoration, conversations, notifications,
  verified reviews, reputation, seller insights, and notification preferences.

## Acceptance evidence

`npm run acceptance:local` passed with:

- 16 Vitest files and 82 tests.
- Syntax and production build checks across 63 JavaScript files.
- Local Supabase schema lint with no errors.
- Live disposable catalogue, inventory, image, and favourites workflows.
- Rollback-based order totals, lifecycle, stock, cancellation, reviews, and
  reputation checks.
- Rollback-based conversation, message, and notification checks.
- Live disposable default and persisted settings checks.

The acceptance command does not reset the database. It removes its temporary
category and each smoke workflow removes or rolls back its own records.

## Local run order

1. Copy `.env.example` to `.env` and populate local Supabase keys.
2. Run `npm install`.
3. Run `npm run supabase:start`.
4. Apply migrations with `npx supabase migration up --local` or use the
   documented destructive reset only when replacing local data is acceptable.
5. Run `npm run acceptance:local`.
6. Run `npm run dev` and call endpoints under `http://localhost:4000/api/v1`.

## Remaining integration boundary

The API contract is ready for frontend integration, but this series deliberately
does not replace the web package's mock data, wire authentication tokens into
the browser, configure hosted Supabase, or perform production deployment.
