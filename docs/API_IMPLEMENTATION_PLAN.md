# API Web-Parity Implementation Plan

This plan brings `marketplace-api` to feature parity with the checked-in
`marketplace-web` user journeys while deliberately leaving the web application
on its current mock data.

## Baseline

- API source branch: `feat/products-api`
- API baseline commit: `b60f5c0`
- Web reference branch: `backend-connect`
- Web reference commit: `8dd9099`
- Integration branch: `feat/api-web-parity`

The API and web packages are independent repositories. API implementation does
not authorize changes to the web package, frontend integration, remote pushes,
or merges into shared branches.

## Workflow

Each task is implemented on a branch created from the latest accepted
`feat/api-web-parity` state. Completed task branches are merged locally into the
integration branch only after their tests pass. The implementation log records
the actual commit hashes and validation results.

## Tasks

| Task | Branch | Scope |
| --- | --- | --- |
| 00 | `feat/api-web-parity` | Plan, workflow, and implementation log |
| 01 | `fix/api-01-local-foundation` | Seeds, grants, profile security, local smoke validation, and setup docs |
| 02 | `feat/api-02-contract` | `/api/v1`, shared responses, errors, validation, logging, security, and OpenAPI |
| 03 | `feat/api-03-reference-data` | Categories, universities, and campuses |
| 04 | `feat/api-04-auth-accounts` | Signup, login, sessions, password recovery, and profiles |
| 05 | `feat/api-05-verification-media` | Private media and seller verification |
| 06 | `feat/api-06-shops` | Shop profiles, imagery, open state, and pickup areas |
| 07 | `feat/api-07-products-catalog` | Public discovery and complete seller inventory management |
| 08 | `feat/api-08-favourites` | Authenticated saved products |
| 09 | `feat/api-09-orders` | Transactional checkout and buyer/seller order workflows |
| 10 | `feat/api-10-messaging` | Conversations, messages, unread state, and notifications |
| 11 | `feat/api-11-reviews` | Completed-order reviews and derived reputation |
| 12 | `feat/api-12-seller-insights` | Dashboard and analytics summaries |
| 13 | `feat/api-13-settings-hardening` | Preferences, security limits, coverage, and authorization audit |
| 14 | `test/api-14-acceptance` | Real-Supabase acceptance suite and API-only readiness report |

## Web contract normalization

The API contract uses database-safe canonical values and maps them to the web's
display labels later during frontend integration.

| Web concept | API representation |
| --- | --- |
| `name` | Product `title` |
| `categorySlug` / category label | `category_id`, with category slug in public DTOs |
| `location` | `pickup_location` |
| `quantity` / `stock` | `stock_quantity` |
| `New`, `Like new`, `Good`, `Fair` | `new`, `like_new`, `good`, `fair` |
| `Active`, `Draft`, `Sold`, `Paused` | `active`, `draft`, `sold`, `paused` |
| `Campus pickup`, `Delivery` | `campus_pickup`, `delivery` |
| Product images | Maximum six ordered images |
| University/campus names | Stable UUIDs and slugs |

The versioned API base is `/api/v1`. `/api/health` remains unversioned for
container and infrastructure checks.

## Completion standard

Every vertical slice includes request validation, authorization tests, service
tests, integration tests, syntax/build validation, database lint where schema
changes occur, documentation, and a clean Git worktree at handoff.
