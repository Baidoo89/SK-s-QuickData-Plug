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
| `PAYMENT_SETTINGS_ENCRYPTION_KEY` | Preserve the key used for saved organization payment settings. |

Platform billing also needs the appropriate Paystack secret. Shops configure their own customer-payment keys under Settings → Customer Payments. Live checkout requires matching live keys and successful payment verification. Working application pages alone do not prove payments or bundle delivery work.

Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` before relying on verification or password-reset email delivery. Preserve the existing provider/dispatch configuration; this UI release does not change its policy.

## Database migrations

This release introduces no database migration. For a new installation, apply the existing Prisma migrations to its dedicated database using `npx prisma migrate deploy` before opening it to users. Review future schema changes separately and apply production migrations once in a controlled release step. Never run `seed:superadmin` against a live database: it resets existing users and orders.

## Release and verification

Run `npm run test:api`, `npm run test:ux`, `npm run test:db`, `npx tsc --noEmit`, and `npm run build` locally. The database suite uses the isolated local integration database. See [local testing](local-testing.md).

After pushing `main`, check the GitHub Vercel deployment status for that exact commit. Confirm the production hostname is assigned to the completed deployment. Verify `/api/health` and `/api/readiness`, then sign in with an existing production account and review setup, products, orders, and storefront navigation.

Payment verification is a separate release check. `npm run test:paystack` checks saved local test credentials with a read-only Paystack request; a complete checkout, verified callback/webhook, paid order, and fulfillment still need an end-to-end check before claiming payment readiness.

If the deployment fails, keep or restore the previous working Vercel deployment. Reverting a UI release does not require removing database records.

References: [Vercel Git deployments](https://vercel.com/docs/git), [Vercel build settings](https://vercel.com/docs/builds/configure-a-build).
