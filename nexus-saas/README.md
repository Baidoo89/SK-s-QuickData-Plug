# Nexus SaaS Platform

A modern B2B2C SaaS platform built with the best tech stack.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Library:** Shadcn UI
- **Database:** PostgreSQL (via Prisma ORM)
- **Authentication:** NextAuth.js v5

## Getting Started

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
