# API Web-Parity Implementation Log

This file records the local implementation sequence. Git history is the
authoritative source for exact code changes.

| Task | Status | Branch | Base | Commits | Validation | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | Complete | `feat/api-web-parity` | `b60f5c0` | `1feb7c4` | Diff check | API-only plan and tracking setup |
| 01 | Complete | `fix/api-01-local-foundation` | `1feb7c4` | `0049d7d`, `75ab882`, documentation commit | 18 tests; typecheck; build; transactional SQL validation | Full seed sequence produced 25 universities, 79 campuses, 2 users, 1 shop, 12 categories, 2 products, and 1 pickup area before rollback; destructive reset not run |
| 02 | Pending | `feat/api-02-contract` | Task 01 | Pending | Pending | Versioned contract and shared middleware |
| 03 | Pending | `feat/api-03-reference-data` | Task 02 | Pending | Pending | Categories, universities, campuses |
| 04 | Pending | `feat/api-04-auth-accounts` | Task 03 | Pending | Pending | Auth and profiles |
| 05 | Pending | `feat/api-05-verification-media` | Task 04 | Pending | Pending | Private media and verification |
| 06 | Pending | `feat/api-06-shops` | Task 05 | Pending | Pending | Shops and pickup areas |
| 07 | Pending | `feat/api-07-products-catalog` | Task 06 | Pending | Pending | Product discovery and seller inventory |
| 08 | Pending | `feat/api-08-favourites` | Task 07 | Pending | Pending | Saved products |
| 09 | Pending | `feat/api-09-orders` | Task 08 | Pending | Pending | Transactional orders |
| 10 | Pending | `feat/api-10-messaging` | Task 09 | Pending | Pending | Messaging and notifications |
| 11 | Pending | `feat/api-11-reviews` | Task 10 | Pending | Pending | Reviews and reputation |
| 12 | Pending | `feat/api-12-seller-insights` | Task 11 | Pending | Pending | Dashboard and analytics |
| 13 | Pending | `feat/api-13-settings-hardening` | Task 12 | Pending | Pending | Preferences and hardening |
| 14 | Pending | `test/api-14-acceptance` | Task 13 | Pending | Pending | API-only acceptance |

## Boundaries

- Do not edit or connect `marketplace-web` during this series.
- Do not push or merge into `main`, `staging`, or another shared branch without
  explicit authorization.
- Record validation scope accurately; mocked route tests do not prove live
  Supabase behaviour.
- Treat `npm run supabase:reset` as destructive because it replaces local rows.
