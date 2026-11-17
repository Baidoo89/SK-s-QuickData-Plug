# Exact monetary storage migration

Prepared 17 November 2026. This document describes the next migration; it has not changed any column type or stored amount.

## Contract

Use PostgreSQL NUMERIC(18,2) and Prisma Decimal for monetary storage. Keep commissionPercent as a percentage, not a monetary column. Retain integer-pesewa domain calculations where practical. Enforce the current JavaScript safe-integer limit in pesewas before returning numeric API values. Do not silently round fractional-pesewa historical values.

The 19 columns inventoried by scripts/audit-money-storage.mjs are Product.price; Order.total; ServiceRequest.total/profit; StorefrontPayment.amount; CustomPrice.price; BasePrice.price; AgentPrice.price; OrderItem.price/profit; Plan.priceGHS; Payment.amount; WalletTransaction.amount; WithdrawalRequest.amount; ResellerPrice.price; AgentStorefrontPrice.price; ResellerStorefrontPrice.price; SubscriberStorefrontPrice.price; PricingProfileItem.price.

## Compatibility work required before ALTER COLUMN

Prisma currently returns numbers for these Float columns. Changing them to Decimal changes runtime objects, TypeScript arithmetic and JSON serialization. A schema-only conversion would change some JSON monetary values to strings and break number arithmetic or component props.

1. Inventory consumers of the 19 columns: route responses, server page props, pricing services, wallet/withdrawal summaries, payment verification, provider dispatch, email templates and CSV exports.
2. Add explicit money adapters at these boundaries. Decimal storage values must convert to validated integer pesewas for calculations; existing numeric API fields must remain JSON numbers through deliberate serialization. Avoid unvalidated Number(decimal) conversions in financial decisions.
3. Add API contract tests for numeric monetary fields and component/server boundaries, along with cent-level arithmetic tests. Include zero, negative ledger entries, maximum supported values and rejected fractional-pesewa input.
4. Update the read-only audit to recognize Float and Decimal columns during the transition.
5. Switch the Prisma fields and fix all type errors; regenerate the client with the local application stopped so Windows does not lock its engine DLL.

## Data migration and verification

- Re-run the audit against the intended database. The existing audit is deliberately local-only; do not change its safety guard to point at production.
- Capture per-user successful wallet totals, individual ledger amounts, per-user withdrawal reservations/payments, completed-profit totals, and per-checkout expected amounts using exact decimal sums. Compare before and after inside a controlled migration rehearsal.
- Abort if there are non-finite, fractional-pesewa or unsupported-range values. Review such rows individually; do not round them automatically.
- Rehearse the ALTER COLUMN ... TYPE NUMERIC(18,2) USING ... migration on a disposable clone. An exact preflight and snapshot comparison must prevent conversion from changing any existing cent value or aggregate balance.
- Run TypeScript, API contract checks, all PostgreSQL integration tests, browser tests and production build with the converted schema.
- Keep the application and Prisma client schema synchronized with the database type change. Do not add hidden/unmodeled money columns to bypass serialization or typing work.

## Rollout and rollback

The storage migration is a separate release from the completed permission/payment fixes. Take a restorable backup, rehearse rollback on the clone, and coordinate writes during the production change. Preserve payment/auth encryption keys. Do not use reset/seed scripts against production.

Converting back to floating point is not a lossless rollback strategy. Prefer restoring a verified database snapshot and the matching application version, with an explicit policy for writes made after the snapshot. No production migration or deployment has been authorized or performed by these local development steps.
