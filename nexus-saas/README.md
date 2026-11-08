# Nexus SaaS Platform

A multi-tenant VTU/data bundle SaaS for subscriber organizations, agents, and resellers.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Library:** Shadcn UI
- **Database:** PostgreSQL (via Prisma ORM)
- **Authentication:** NextAuth.js v4 with credentials login

## What This Project Is About

Nexus SaaS is built around a B2B2C sales flow:

- **Subscriber dashboard (`/dashboard`)**: organization owner portal for products, base pricing, agents, resellers, customers, orders, wallet top-ups, withdrawal reviews, storefront links, API keys, and analytics.
- **Agent portal (`/agent`)**: agents buy data, manage reseller accounts, approve reseller signup requests, track agent-linked storefront orders, and manage wallet/withdrawals.
- **Reseller portal (`/reseller`)**: resellers buy data, use storefront/API tools, view their own customers/orders, and request withdrawals.
- **Storefronts (`/store/[subscriberSlug]`)**: public purchase pages for customer checkout against subscriber or agent storefront links.
- **Admin/SUPERADMIN foundation (`/admin`)**: operational screens exist, but the true SUPERADMIN control dashboard that oversees the whole system is planned as a later phase.

Core integrations include Paystack wallet funding, provider dispatch/callback handling, manual order queues, signup approvals, pricing profiles, and withdrawal workflows.

## Usability improvements

See [the usability review and competitor comparison](docs/ux-review.md) for the first improvements to owner setup, navigation, agent/reseller purchases, and customer checkout, plus the next priorities.

Run `npm run preview:ux` and open [the owner setup preview](http://127.0.0.1:3016/?view=setup). Use the preview links to switch to agent buying, reseller buying, or the customer shop. This isolated app uses sample responses; it never charges a wallet, contacts a payment gateway, or delivers data. Full management screens require the configured app described below.

The [products and prices preview](http://127.0.0.1:3016/?view=products) lets you add, edit, and hide sample bundles. Sample catalog edits reset when the preview server restarts. The normal product screen uses an explicit save form; existing price-group and service tools remain under its expandable advanced section.

Run `npm run test:ux` for browser checks using an isolated fixture app and mocked API responses. After installing dependencies, install Chromium with `npx playwright install chromium` if it is not already available. These checks do not require a database or payment keys. They do not replace integration testing with a disposable PostgreSQL database and sandbox payment/provider accounts.

## Getting Started

For an isolated Windows test environment with real PostgreSQL and local owner/agent/reseller/admin accounts, see [full local testing](docs/local-testing.md). Start with `npm.cmd run setup:local`, then `npm.cmd run dev:local`; the app runs at `http://127.0.0.1:3017/login`.

Run `npm run test:api` for server-side permission, tenant-boundary, validation and product-save regression tests. They use real route/guard code with a simulated database transaction. See [product permissions and saving](docs/product-write-safety.md) for behavior and the remaining PostgreSQL integration checks.

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Setup Database:**
    - Ensure you have PostgreSQL running.
    - Update `DATABASE_URL` in `.env` with your connection string.
    - Run migrations:
      ```bash
      npx prisma db push
      ```

3.  **Configure Environment Variables:**
        - Copy `.env.example` to `.env.local` (or update your deployment env settings).
        - Required for invite links and email delivery:
            - `NEXTAUTH_URL`
            - `RESEND_API_KEY`
            - `RESEND_FROM_EMAIL` (must be a verified sender/domain in Resend)

        If `RESEND_FROM_EMAIL` is missing, reseller/agent accounts will still be created and invite links will still be shown in the UI, but email delivery may fail.

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```

5.  **Open App:**
    - Visit [http://localhost:3000](http://localhost:3000)

## Data Fixes

If older reseller rows were created without `parentAgentId`, run the one-time backfill script after confirming the owning agent for each organization:

```bash
node scripts/backfill_reseller_ownership.js
```

This assigns unlinked reseller accounts to the earliest agent in each organization. Use it only when that mapping is correct for your data.

## Features

- **Authentication:** Secure login and registration.
- **Dashboard:** Protected user area.
- **Multi-tenancy:** Organization support (Schema ready).

## Vercel release

See [the Vercel release guide](docs/vercel-release.md) for the app root, production settings, deployment checks, and rollback instructions.
