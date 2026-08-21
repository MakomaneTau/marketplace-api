# API Web-Parity Implementation Log

This file records the local implementation sequence. Git history is the
authoritative source for exact code changes.

| Task | Status | Branch | Base | Commits | Validation | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | Complete | `feat/api-web-parity` | `b60f5c0` | `1feb7c4` | Diff check | API-only plan and tracking setup |
| 01 | Complete | `fix/api-01-local-foundation` | `1feb7c4` | `0049d7d`, `75ab882`, `ee1a3b0`; merge `1648a2f` | 18 tests; typecheck; build; transactional SQL validation | Full seed sequence produced 25 universities, 79 campuses, 2 users, 1 shop, 12 categories, 2 products, and 1 pickup area before rollback; destructive reset not run |
| 02 | Complete | `feat/api-02-contract` | `1648a2f` | `c28be6e`, `30d6950`; merge `9072980` | 22 tests; syntax check; build; diff check | `/api/v1`, structured responses, request IDs, JSON errors, logging, security headers, in-memory rate limit, and temporary legacy aliases |
| 03 | Complete | `feat/api-03-reference-data` | `9072980` | `5f99788`, `08f853b`; merge `9145ce1` | 29 tests; syntax check; build; database lint; live empty-database service query | Public categories, universities, and campuses with filtering and product/campus counts |
| 04 | Complete | `feat/api-04-auth-accounts` | `9145ce1` | `7189f74`, `7b9880d`; merge `01ae9ab` | 37 tests; syntax check; build; database lint; live disposable signup, login, refresh, profile update, logout, and cleanup | Buyer/student rules, sessions, password recovery, current account, and safe profile updates |
| 05 | Complete | `feat/api-05-verification-media` | `01ae9ab` | `d9aeb99`, `a29009e`, `7895cd7`; merge `75d388e` | 44 tests; syntax check; build; zero audit vulnerabilities; database lint; live disposable private upload, read, cleanup | Private bucket, bounded multipart parsing, content signatures, seller verification, and removal of 910 tracked dependency files |
| 06 | Complete | `feat/api-06-shops` | `75d388e` | `b522450`, `51cde9b`; merge `99fbe1d` | 50 tests; syntax check; build; database lint; live disposable create, update, public read, pickup replacement, logo upload, cleanup | One shop per seller, stable slug, atomic pickup areas, and public logo/banner storage |
| 07 | Complete | `feat/api-07-products-catalog` | `99fbe1d` | `3379773`, `22c4aa5`, `c3a8bcd`; merge `3a3da4b` | 55 tests; syntax check; build; database lint; live disposable seller draft, managed image upload, activation, public filters, seller inventory, cleanup | Paginated discovery, complete seller inventory routes, and six-image lifecycle |
| 08 | Complete | `feat/api-08-favourites` | `e4385fc` | `170e18d`, `5738463`; merge `61ac2b2` | 60 tests; syntax check; build; live disposable save twice, list, remove, cleanup | Authenticated paginated favourites expose only currently public products |
| 09 | Complete | `feat/api-09-orders` | `33fb60d` | `cbb9860`, `80dabd5`; merge `b89ba85` | 67 tests; syntax check; build; database lint; rollback-based totals, seller transitions, stock decrement, buyer cancellation, stock restore; live service-role query | Atomic single-shop checkout, immutable price snapshots, participant reads, and controlled lifecycle |
| 10 | Complete | `feat/api-10-messaging` | `2b7a609` | `c6a1888`, `bc5b7ac`; merge `1bc436a` | 73 tests; syntax check; build; database lint; rollback-based idempotent conversation, message, notification | Participant conversations, unread state, message notifications, and order notifications |
| 11 | Complete | `feat/api-11-reviews` | `4b746dc` | `74a97d2`, `a19a904`; merge `5a715a0` | 76 tests; syntax check; build; database lint; rollback-based completed-order review and reputation refresh | One review per order product, public review lists, derived shop/seller reputation, seller notification |
| 12 | Complete | `feat/api-12-seller-insights` | `217918b` | `2aaa0d0`, `d27c7b0`; merge `ecc5c11` | 79 tests; syntax check; build | Seller dashboard counters, unread state, recent orders, revenue trends, AOV, views, and top products |
| 13 | Complete | `feat/api-13-settings-hardening` | `4a05f0e` | `58d57a4`, `7e969cb`; merge `97e2225` | 82 tests; syntax check; build; database lint; live disposable preference defaults/update/cleanup | Persisted notification settings, multi-origin CORS, opt-in proxy trust, HSTS, and browser capability headers |
| 14 | Complete | `test/api-14-acceptance` | `279173d` | acceptance and documentation pending commit | 82 tests; 63-file syntax/build; database lint; all live smokes; cleanup verified | Repeatable non-destructive acceptance command and API readiness report |

## Boundaries

- Do not edit or connect `marketplace-web` during this series.
- Do not push or merge into `main`, `staging`, or another shared branch without
  explicit authorization.
- Record validation scope accurately; mocked route tests do not prove live
  Supabase behaviour.
- Treat `npm run supabase:reset` as destructive because it replaces local rows.
