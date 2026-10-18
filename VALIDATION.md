# Validation record

Validated in the supplied workspace on 18 October 2026. These results describe the source implementation; they are not evidence of a live deployment or a completed payment transaction.

| Check | Observed result |
| --- | --- |
| Backend integration suite | **19 passed**, **2 skipped** |
| Frontend cart/money tests | **4 passed** |
| Next.js production build | **Passed** on Next.js **16.4.2**, including TypeScript checks and route generation |
| Alembic upgrade | Both migrations applied successfully to the local SQLite development database |
| Alembic model drift | `alembic check`: **No new upgrade operations detected** |
| API smoke checks | `/health`, product list, delivery check, and public reviews returned HTTP **200** |
| Production JavaScript dependency audit | `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities reported** at check time |
| Lockfiles | npm and Python dependency lockfiles included |

The backend tests cover server-side pricing, coupons, PIN serviceability, price tampering rejection, idempotent retry, gateway timeouts, insufficient stock rollback, raw-byte webhook HMAC, duplicate/out-of-order notifications, mismatched payment amounts/currency/status, callback verification via provider fetch, private tracking, expiration reconciliation, authorized payment holds, late captures without stock, duplicate capture handling, protected inventory updates, sequential fulfilment, and verified-purchase review moderation.

The two skipped cases require a disposable PostgreSQL instance: simultaneous buyers competing for the last pack, and simultaneous identical checkout retries converging to one order. PostgreSQL was not available in this execution environment. `.github/workflows/ci.yml` provisions PostgreSQL 16 and runs the same suite, including these cases. That workflow has been prepared but has not been executed in a remote repository during this task.

The test dependency emits a Starlette deprecation warning about its current httpx test-client integration; the tests complete successfully. The application's HTTP client remains httpx and no payment request was sent to Razorpay during these tests.

No browser automation capability was available for this managed workspace. Responsive CSS, keyboard/focus patterns, and the compiled application are implemented, but screenshot/device QA was not performed. Docker image execution and actual Railway/Vercel deployments were not performed here. Perform a staging browser checkout against Razorpay Test Mode, including the payment methods you enable, before opening live orders.

Go-live inputs are deliberately external to the bundle: real API/payment credentials, independent secrets, carrier-confirmed serviceable PINs, real stock and product labels, verified certifications, business/support details, complete store policies, and deployment accounts. See the README for exact configuration and commands.
