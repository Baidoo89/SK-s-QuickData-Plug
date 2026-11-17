# QuickData system improvement plan

Baseline verified: 17 November 2026. Working project: restored sk-quickdata-plug/nexus-saas. Local Git main reference: 5d37b877ce487e5bf6579b90076dac0947553306. Existing restored source is preserved; no production deployment or database was changed.

## Stage 1: Recover and verify the baseline — complete

- Installed dependencies from package-lock.json using npm ci.
- Downloaded PostgreSQL 17.11-3 binaries; local setup verified the pinned publisher checksum.
- Recreated empty PostgreSQL runtime directories omitted from the file-only backup. Existing cluster started successfully; all 26 migrations already applied to both local databases.
- Local app database: quickdata_dev. Disposable integration database: quickdata_integration. Both use 127.0.0.1:55432.
- TypeScript: passed (tsc --noEmit --incremental false).
- API/environment suite: 74 passed.
- Fixture browser suite: 15 passed. These use mocked responses, separately from the full application checks.
- Real PostgreSQL integration suite: 7 passed.
- Production build: passed using localEnvironment configuration.
- Real browser smoke check against the production build: owner, agent, reseller, and superadmin sign-in passed; owner product creation/editing persisted after reload; agent/reseller product mutations returned 403. Temporary product cleaned up by the check.
- Local production build is served at http://127.0.0.1:3017/login. Credentials remain in .local/accounts.json; never commit that file.
- No payment or provider requests were made by the verification checks. Checkout, delivery and refunds are not yet verified end to end.

## Stage 2: Financial and order correctness — next

1. Add regression tests for concurrent wallet spending, duplicate refunds and a failed -> refunded -> retried -> failed order.
2. Make wallet spending safe under concurrency. A transaction containing an aggregate balance read alone does not serialize spending.
3. Link refunds to the specific debit/attempt, with a database uniqueness rule and atomic financial writes. Current order-level audit-log refund detection can prevent a second attempt from receiving its refund.
4. Enforce order-state transitions and handle duplicate/late provider events consistently.
5. Review monetary precision and migrate monetary Float fields to an exact representation with a deliberate data migration.
6. Verify checkout and provider handling with sandbox credentials after the internal financial rules pass.

Acceptance: no overspending, no duplicate refunds, every refunded retry is tied to its debit, late callbacks do not silently regress terminal orders, and financial writes remain consistent when a step fails.

## Dependency and tooling work

npm ci reported 23 advisories overall (11 moderate, 8 high, 4 critical). npm audit --omit=dev reported 10 affected production packages (4 moderate, 2 high, 4 critical), including Next.js and authentication packages. These counts identify dependency advisories, not confirmed exploitability in this application. Review affected APIs and supported upgrades, then rerun type, API, database, browser and build checks. Do not apply npm audit fix --force blindly.

The current eslint.config.mjs defines ignores but no application lint rules. A successful build is not evidence of meaningful lint coverage. Configure linting as a separate controlled change.

## Stage 3: Navigation and dashboards

- Define consistent labels: platform admin, store owner, agent, reseller, customer.
- Owner sections: Overview, Orders, Catalog & pricing, Team, Money, Shop settings.
- Agent/reseller sections: Buy data, Orders, Wallet, My shop; agents also have Team.
- Admin sections: Businesses, Plans, Transactions, Operations, Settings.
- Show actionable exceptions and next steps on dashboards; keep optional configuration out of daily workflows.
- Verify existing links and redirects, including legacy settings tab URLs.

## Stage 4: Catalog, pricing and purchasing

- Separate supplier cost, default selling price, team overrides and shop prices.
- Explain price precedence in one shared service and in the interface.
- Split the large product/service/form management page into focused modules.
- Share purchase rules across agent/reseller, bulk and public checkout paths.
- Verify mobile purchase, receipt, tracking and failure recovery.

## Stage 5: Operational readiness

- Finish admin operations and reconciliation views.
- Test tenant and role boundaries across all changed endpoints.
- Test payment and delivery success, failure, timeout, retry and reconciliation in sandbox.
- Document deployment, backups, recovery and rollback; release only after the relevant acceptance checks pass.

## Working rules

Use only the isolated local configuration for automated tests. Preserve production credentials and restored files. Change one domain at a time, add meaningful regression checks for financial logic, and record results here as each stage is completed. The existing passing suites do not cover every business workflow.

## Stage 2 progress — 17 November 2026

First financial correctness pass implemented locally. Stage 2 remains in progress.

### Implemented

- Serialized wallet spending by locking the wallet owner's User row before reading funds in agent, reseller, legacy VTU, and retry charging paths. Invalid negative/non-finite purchase totals are rejected.
- Made retry debits and their audit records transactional; invalid debit amounts and mismatched order ownership are rejected.
- Added unique refundOfTransactionId and a self-reference constraint to WalletTransaction. Each refund links to its actual debit. Concurrent refund requests credit once, and a second failed attempt can receive its own refund.
- Recognized historical refund audit records when their actual credit can be verified; refund amounts come from the debit row rather than the audit amount.
- Added an atomic retry claim with payment/status checks, attempt limits and backoff. Only failed paid orders can be retried. Externally paid orders are not charged against a wallet. A failed attempt is settled before the retry debit is created.
- Unified manual, bulk and imported status updates through a transaction that updates the order, refund/profit reversal and audit together. Bulk/import eligibility is checked again under the order lock. Refunded/failed orders cannot simply be changed back to completed; use the retry flow.
- Provider updates now enforce forward transitions and commit failures/refunds together. Terminal orders do not regress on delayed updates. Callbacks with obsolete references are ignored. Retried-order callbacks require the current provider reference; ambiguous callbacks are logged and ignored for reconciliation rather than applied to another attempt's charge.
- Immediate dispatch results use the same guarded provider status service.
- Added unique paymentReference for newly recorded Paystack wallet credits. Repeated verification credits once. The verified reference, purpose, currency, gross amount, net credit and wallet organization must agree. Checkout specifies GHS and validates cents.
- Applied two additive migrations only to quickdata_dev and quickdata_integration (28 migrations total). No production changes or GitHub push.

### Verification after changes

- TypeScript checking: passed.
- API/environment suite: 74 passed.
- Real PostgreSQL integration suite: 26 passed, including 19 new wallet/payment/status checks.
- Production build: passed.
- Full-app browser smoke check: all four roles signed in; owner product creation/edit persistence passed; agent/reseller mutations denied.
- No real payment/provider calls or financial transactions were made. The Paystack tests use simulated verified responses with real local database writes.

### Remaining before financial readiness

- Replace Float monetary storage with an exact representation and an explicit migration/rounding policy; review historical values before converting.
- Reconcile older Paystack wallet credits before production rollout: old rows have no payment reference, so the new uniqueness constraint cannot identify a previously credited historical reference. Older payment metadata missing gross amounts is deliberately rejected by new verification and requires review.
- Verify sandbox checkout, callback/poll recovery and provider delivery end to end. Callback integrations for retried orders must supply the current provider reference. Ignored ambiguous events need an operator reconciliation workflow.
- Continue the route/tenant-boundary audit. The wallet transaction userId override and manual-credit missing-organization bypass are fixed and covered by real database tests in the second pass below.
- Review export/claim handlers that still write PROCESSING directly; guard their writes against concurrent terminal-status changes.
- Review remaining storefront payment transitions and external API order payment policy. Withdrawal reservation/review concurrency is covered by the second pass below; broader earnings/reconciliation behavior still needs review.
- Assess and upgrade vulnerable dependencies, then repeat relevant checks. The existing ESLint configuration still does not define substantive application lint rules.
- Do not treat these passing tests as proof that all financial workflows or every API route are covered.


## Stage 2 second pass — 17 November 2026

### Implemented

- Wallet transaction userId filters now intersect the authenticated scope instead of replacing it. A reseller cannot read another wallet by changing the URL; self scope remains restricted even for owners. Existing owner tenant filtering and reseller email/search restrictions are covered by real database tests.
- Closed a manual-credit authorization gap: non-superadmins without an organization cannot credit a beneficiary in another business. Manual credits reject fractional-pesewa amounts.
- Withdrawal creation now locks the requester, rechecks the active approved account, checks earnings, creates the reservation and writes the audit record in one transaction. Concurrent requests cannot reserve the same earnings twice. The response reports the remaining available balance and current locked amount after creation.
- Owner/admin agent-withdrawal reviews and agent reseller-withdrawal reviews now use the same transactional review implementation. It locks the requester, rechecks role/organization/parent-agent scope, checks earnings, updates status and writes the audit record together. Repeated approval is idempotent. Audit failure rolls back the reservation or review status.
- Added money.ts for integer-pesewa multiplication/subtraction, input validation and range checks. Agent/reseller/legacy-VTU purchase totals and retry balance checks use these helpers. Wallet spending balances and completed-profit/withdrawal reservation sums cast individual stored values to PostgreSQL numeric before summing; integer-pesewa validation is applied before financial decisions. The individual wallet endpoint returns the exact calculated balance.
- No stored balances or column types were changed. Fractional-pesewa values are rejected for review instead of being silently rounded.

### Monetary storage audit

Run `node scripts/audit-money-storage.mjs`. This read-only helper accepts only the two isolated local databases and emits column names and counts, without monetary values or account identifiers. Results are saved in docs/money-storage-audit.json.

The audit found 19 monetary Float columns in each local database, with zero non-finite, fractional-pesewa or individually out-of-range values. This finding applies only to restored local data. It is not a production-data audit and does not prove that future values or aggregate balances will always fit the integer range.

Next storage migration: select a decimal/integer storage contract, inventory all API serializers and monetary writers, audit the destination database, and verify per-user totals before and after conversion. Float storage remains outstanding; the exact calculation helpers do not complete that migration. Dashboards and other remaining aggregate paths still need the wider monetary audit.

### Verification

- TypeScript checking passed.
- 76 API/environment/money tests passed.
- 39 PostgreSQL integration tests passed (13 additional database tests in this pass).
- Production build passed.
- Full browser smoke checks passed for all four roles, product save persistence and tested mutation restrictions.
- Local app restarted on http://127.0.0.1:3017/login.
- No external payment/provider requests, GitHub pushes or production changes were made.

Stage 2 remains in progress: exact monetary storage migration, export/claim races, remaining storefront/API payment paths, sandbox checkout/delivery, legacy payment reconciliation, dependency security updates and operator reconciliation flows remain.

## Stage 2 third pass — 17 November 2026

### Export and order-access fixes

- Added claimManualOrders: only paid, pending, manually fulfilled orders can be claimed. Eligibility is rechecked under ordered database row locks. The claim and audit rows commit together, and CSV files include only the IDs actually claimed by that request.
- Applied the service to owner/admin manual-queue exports and general owner CSV exports. Plain downloads remain read-only. Concurrent claim downloads do not both export the same newly claimed order, and a completion received while the export waits cannot be overwritten or falsely reported as claimed.
- The general /api/orders endpoint now requires an organization manager. Agents/resellers must use their scoped order endpoints instead of reading the owner's tenant-wide list.
- Added claim rollback coverage and owner/tenant-boundary regression coverage.

### Storefront payment fixes

- Added settleStorefrontPayment. It locks the saved checkout, validates the server-verified reference/currency/purpose/organization/exact amount, and uses the locally saved order/service membership rather than allowing gateway metadata to substitute another order.
- Payment, member-order/service statuses and success/failure audit records now commit together. A verified success is terminal; later failed verification cannot downgrade it. Replays do not duplicate settlement audits.
- A verified late payment can recover the original PAYMENT_FAILED members after timeout cleanup. Invalid amounts, references, currencies or membership leave unpaid records unpaid.
- Durable per-order dispatch-start audit claims prevent repeated verification from initiating the same provider request twice. Replaying verification can recover settlement that committed before dispatch began. An interrupted/uncertain request is logged for reconciliation and is not blindly retried. The operator reconciliation interface/worker remains outstanding.
- Service payments settle to PENDING_REVIEW without initiating a data-bundle dispatch.
- New storefront data checkout totals/profits use the existing exact-pesewa helpers; both checkout initializers explicitly request GHS. Invalid fractional-pesewa prices produce a user-facing validation error.
- Provider dispatch no longer starts for a non-pending/unpaid order. Both manual-fallback branches preserve a completion received while the provider call was in flight instead of resetting it to PENDING.

### Verification

- TypeScript passed.
- 76 API/environment/money tests passed.
- 68 PostgreSQL integration tests passed, including 29 added in this pass.
- All 15 fixture browser tests passed.
- Production build passed.
- Full-app browser smoke checks passed: four role sign-ins, owner product save/edit persistence and agent/reseller mutation restrictions.
- Gateway and provider responses in payment tests were mocked; database operations used only quickdata_integration. No external payment or delivery requests were made.
- Local app rebuilt and restarted at http://127.0.0.1:3017/login. No GitHub push, production deployment or new database migration in this pass.

### Remaining stage-two work

- Exact monetary storage migration is designed in docs/money-storage-migration.md but is not implemented. Prisma Decimal values require coordinated arithmetic and JSON/React boundary adapters; do not apply a schema-only conversion. Existing balances and column types remain unchanged.
- Review external API order payment policy, remaining platform/subscription payment flows and broader tenant boundaries.
- Build operator reconciliation for uncertain dispatches, conflicting payment evidence and legacy credits without stored payment references. A crash after a dispatch-start claim still needs reconciliation.
- Validate real sandbox checkout, payment callbacks and delivery with approved test credentials. Current mocks do not establish live gateway/provider readiness.
- Review and update vulnerable dependencies and meaningful lint rules before production release.

The release guide now identifies the two additive wallet migrations from the first pass and the historical-credit reconciliation requirement; its earlier no-migration statement was stale.

## Stage 2 fourth pass and approved credit feature — 17 November 2026

The owner clarified the payment policy: sellers without sufficient funds should be blocked unless explicitly approved for a limited credit facility, with end-of-day repayment and a debt page.

### Subscription billing

- Added saved subscription checkout quotes with exact integer-pesewa amounts. Gateway reference, currency, amount, purpose, organization and plan must match the quote. Later catalog price edits do not silently change the quoted payment amount.
- Quote settlement serializes per organization and atomically updates the subscription, inserts the payment, marks the quote paid and records the audit. Replaying one reference adds one billing period; two distinct payments credit both periods.
- Removed implicit paid development activation when billing keys are missing. Only organization managers can initialize subscription purchases. Local seeded test access remains available.
- Guarded expiry refresh against concurrent paid renewal, and clamped monthly billing dates to valid UTC calendar dates at month end.

### API policy and wallet charges

- API orders now charge the seller's server-calculated purchase cost to the linked wallet. A lack of prepaid funds or approved credit rejects the order before creation/dispatch. Assigned strict agent price groups apply to API costs as well as dashboard purchases.
- New orders store API-key ownership with a unique key/reference pair. Key-level locking serializes duplicate creation and rate-limit checks; conflicting reuse returns 409. Invalid/inactive holder keys and missing ownership evidence are rejected.
- New owner keys bind to their creator. Unbound legacy keys with ambiguous owner accounts are rejected for review.
- Customer amountPaid remains externally collected, seller-declared sales information. It does not fund a wallet or create withdrawable profit. API profits, including historical externally collected API margins, are excluded from withdrawal entitlement. Reports and historical payments need reconciliation before rollout.
- Retry charging uses the actual previous debit amount, not the external sale total.

### Approved credit and debt pages

- Added CreditAccount with exact integer credit limits, explicit approval notes, an enabled flag and a daily due timestamp. Default remains prepaid, with no automatic enrollments.
- Store owners approve agents/resellers in their business; platform admins approve store-owner credit. Borrowers cannot approve themselves or view other borrowers' debt.
- All wallet purchase paths share locked capacity checks. Borrowed amounts are recorded as negative wallet balances, never skipped charges. Limits cap outstanding debt; overdue borrowing is blocked until debt is cleared. Top-ups/refunds reduce debt, and disabling a limit does not erase it.
- Added /dashboard/credit, /admin/credit, /agent/credit and /reseller/credit with scoped account search, approval controls, amount owed, available capacity, deadline and repayment navigation. GMT end-of-day settlement is explicit in the interface.
- Store-owner repayments verify with platform wallet billing; team repayments verify with their store's merchant. Verification checks funding provenance against the recipient role.
- Agent-to-reseller manual funding is now an atomic cash-backed transfer, not an unbacked credit. Approved borrowing cannot be transferred to manufacture balances or repayments. Owner/admin manual credits are audited.
- Added in-app API payment rules and docs/credit-policy.md. Sample desktop/mobile screenshots are in docs/previews/credit-and-debt*.png.

### Verification

- TypeScript passed.
- 100 PostgreSQL integration tests passed (32 added in this pass).
- 78 API/environment/money/billing-date tests passed.
- All 15 fixture browser tests passed after the new credit navigation was added.
- Production build passed; final in-app documentation build checked separately.
- Full credit browser check passed: manager approval, persisted limit, borrower debt/deadline, self-approval denial, repayment link and phone overflow check.
- Existing full-app browser smoke checks passed for all four roles and product save/permissions. Temporary credit-browser users, approvals and synthetic balances were cleaned up.
- Five financial migrations are now applied only to quickdata_dev and quickdata_integration (31 migrations total). No live gateway/provider calls, GitHub push or production changes.

### Still outstanding

The older Float monetary-storage migration, live/sandbox payment/provider end-to-end validation, operator reconciliation for uncertain dispatches/legacy records, full financial report alignment, safe account closure/deactivation flows with debt history, credit reminders/collections, dependency security updates and meaningful lint rules remain. Subscription quote expiry, plan-change/proration policy and long-term billing-anchor behavior also need an explicit release review. Stage 2 is not yet a production-readiness signoff.

## Financial review and account-history pass — 17 November 2026

- Added durable financial review cases and owner/admin queues for verified payment mismatches, uncertain dispatches and contradictory provider outcomes. Historical interrupted claims import in bounded batches.
- Added tenant/platform boundaries, optimistic version checks, audited review/reopen notes and automatic reopening on new evidence. Reviewing a case does not change an order or wallet.
- Added live overdue debt with links to the corresponding credit account, including disabled credit with unpaid balances and excluding repaid accounts.
- Protected agent/reseller financial history from hard deletion. Deactivation is atomic with its audit record, and disabled/unapproved accounts are blocked from further cash or credit purchases. The manager order timeline endpoint now rejects team roles.
- Added docs/financial-review.md and desktop/mobile screenshots. New migration: 20261117153000_financial_review_cases; 32 migrations applied to both isolated local databases.
- Added borrower credit summaries to store-owner, agent and reseller home dashboards. Each shows wallet balance, approved limit, amount owed, available spending capacity, due date and a link to credit details; overdue balances also appear in the dashboard attention list.
- Reconciled Advanced Analytics labels and totals: gross sales, wallet-backed sales, storefront payments, external/API sales, gross margin, withdrawal-eligible margin and externally collected margin are now shown separately with exact pesewa arithmetic. External/API margin is visibly excluded from withdrawal eligibility.
- Added a 30-minute subscription quote expiry. Stale pending quotes are marked expired, cannot activate or renew access, and verified late gateway payments enter the platform financial-review queue. The quote migration is applied to both isolated databases.
- Verification passed: TypeScript, 118 PostgreSQL integration tests, 78 API tests, 15 browser regression tests, production build, financial-review browser flow, credit browser flow and all four-role/product browser checks. Temporary browser fixtures were removed. No live payment/provider calls, push, deployment or production migration.
- Remaining: exact-money migration for older Float columns; historical financial reconciliation and actual operator resolution of review cases; sandbox/live gateway and provider end-to-end validation; report alignment; credit reminders/collections; dependency security updates and meaningful lint rules; subscription quote expiry/proration/billing-anchor review. This pass does not establish production readiness.

## Subscription quote-safety pass — 17 November 2026

- Added `expiresAt` to saved subscription quotes with a 30-minute lifetime. Creating a new quote marks older pending quotes as expired.
- A successful gateway callback cannot activate or renew a subscription after its quote expires. The quote is marked `EXPIRED`, no `Payment` row or access change is committed, and the verified payment becomes a platform financial-review case.
- Verification passed: 119 PostgreSQL integration tests, 80 API tests, TypeScript, production build, credit/reconciliation/report browser checks and all four-role/product browser checks. Both local databases now have 33 migrations. No live gateway/provider calls, push or deployment.
- Remaining: exact-money storage migration, live/sandbox gateway/provider verification, legacy financial reconciliation, reminders/collections, dependency security updates, lint rules and an explicit plan-change/proration policy.

## Final framework and authentication hardening pass — 17 November 2026

- Upgraded Next.js to `15.5.28`, `eslint-config-next` to `15.5.28`, and Auth.js to patched `next-auth@5.0.0-beta.32` (`@auth/core@0.41.3`). The Auth.js v5 universal `auth()`/handler export is now used for server pages, route handlers and login sessions.
- Applied the official Next async request API codemod to application routes and UI fixtures, then updated the remaining route/test contexts to use Promise-based `params` and `searchParams`.
- Removed the build-time Google font fetch and use a system font stack so production builds are deterministic in offline/isolated environments. Local-only startup now sets `AUTH_TRUST_HOST=true`; production should use the canonical HTTPS origin and an explicitly trusted host policy.
- Verification passed: TypeScript, 119 PostgreSQL integration tests, 80 API tests, 15 UI fixture tests, production build, real four-role login/product smoke, credit/reconciliation/financial-report browser checks, and `npm run lint`.
- `npm audit --omit=dev` now reports 0 critical and 0 low advisories (14 moderate/high advisories remain in the Next/PostCSS and Tailwind/build dependency chain; several require a future major upgrade). Do not treat this as a reason to skip sandbox gateway/provider verification.
- No live payment/provider calls, GitHub push, deployment, or production database migration was performed.
