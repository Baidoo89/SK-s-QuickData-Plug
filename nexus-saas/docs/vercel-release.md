# QuickData on Vercel

The application is in `nexus-saas`, not the repository root. Keep the existing Vercel project connected to `Baidoo89/SK-s-QuickData-Plug`.

## Project settings

- Framework: Next.js.
- Root directory: `nexus-saas`.
- Install command: `npm ci`.
- Build command: `npm run build` (includes Prisma client generation).
- Production branch: `main`.
- Preview branches should use their own database and test payment credentials.

Do not point a preview deployment at the production database. The local `.local` database, accounts and environment files are ignored and must stay on the development machine. Local wallet balances are fictional test data.

## Required production configuration

Preserve the existing production database, auth signing secret and payment encryption key. Changing the encryption key without a migration makes saved shop payment keys unreadable.

Set these in Vercel's production environment, never in Git:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The existing dedicated production PostgreSQL URL, with the provider's recommended serverless connection settings. |
| `NEXTAUTH_URL` | The canonical production HTTPS origin. |
| `APP_URL` | The same production origin. |
| `NEXT_PUBLIC_APP_URL` | The same production origin. |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | Preserve the current strong signing secret. |
| `AUTH_TRUST_HOST` | Set `true` only when the deployment host is explicitly trusted (Vercel normally supplies the trusted-host signal). |
| `PAYMENT_SETTINGS_ENCRYPTION_KEY` | Preserve the key used for saved organization payment settings. |

Platform subscription billing uses `PAYSTACK_SUBSCRIPTION_SECRET_KEY` (or its existing platform fallback). Stores configure one Paystack account under Settings for customer checkout and owner/agent/reseller wallet funding. `PAYSTACK_WALLET_SECRET_KEY` remains an optional platform-only fallback for superadmin wallet operations. Live checkout requires matching live keys and successful payment verification. Working application pages alone do not prove payments or bundle delivery work.

Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` before relying on verification or password-reset email delivery. Preserve the existing provider/dispatch configuration; this UI release does not change its policy.

## Database migrations

The local financial-correctness work adds seven migrations: `20261117003000_wallet_refund_link`, `20261117004500_wallet_payment_reference`, `20261117090000_subscription_checkout_quote`, `20261117091500_api_order_ownership`, `20261117093000_credit_accounts`, `20261117153000_financial_review_cases`, and `20261117170000_subscription_quote_expiry`. They add refund/payment links, exact subscription quotes, per-key order ownership, opt-in credit accounts, durable financial review cases and a 30-minute expiry for saved subscription quotes. Before a release, review and apply pending migrations using `npx prisma migrate deploy` against the intended database, with a tested backup and rollback plan. Older Paystack wallet credits without saved references require reconciliation before rollout; the new constraint cannot retroactively identify those historical references. An expired quote never activates access; a successful late gateway payment goes to the platform review queue. The separate exact-money storage migration is still planned; see [the migration design](money-storage-migration.md). For a new installation, apply the existing Prisma migrations before opening it to users. Review future schema changes separately and apply production migrations once in a controlled release step. Never run `seed:superadmin` against a live database: it resets existing users and orders.

## Release and verification

Run `npm run test:api`, `npm run test:ux`, `npm run test:db`, `npx tsc --noEmit`, and `npm run build` locally. The database suite uses the isolated local integration database. See [local testing](local-testing.md).

After pushing `main`, check the GitHub Vercel deployment status for that exact commit. Confirm the production hostname is assigned to the completed deployment. Verify `/api/health` and `/api/readiness`, then sign in with an existing production account and review setup, products, orders, and storefront navigation.

Payment verification is a separate release check. `npm run test:paystack` checks saved local test credentials with a read-only Paystack request; a complete checkout, verified callback/webhook, paid order, and fulfillment still need an end-to-end check before claiming payment readiness.

If the deployment fails, keep or restore the previous working Vercel deployment. Reverting a UI release does not require removing database records.

References: [Vercel Git deployments](https://vercel.com/docs/git), [Vercel build settings](https://vercel.com/docs/builds/configure-a-build).



## Financial policy rollout

Review [wallet and credit policy](credit-policy.md) before release. API purchases now require seller wallet funds or approved credit; existing integrations that assumed uncharged external orders need migration. Subscription verification requires a locally saved quote, so pre-release pending gateway references must be reconciled rather than trusted from metadata alone. No users are automatically enrolled in credit. New credit and quote amounts use integer minor units; the older monetary Float migration remains separate.

## Framework hardening note

The current release uses Next.js `15.5.28` and Auth.js `5.0.0-beta.32` (`@auth/core@0.41.3`). The app has been migrated to Promise-based route parameters/search parameters and the universal Auth.js v5 `auth()` handler. Before production rollout, confirm the deployment's canonical HTTPS host and trusted-host setting, then run the full API/database/UI/build checks. The final local audit has no critical or low production advisories; moderate/high findings remain in the framework's PostCSS/Tailwind build chain and should be reviewed before a future major dependency upgrade.

