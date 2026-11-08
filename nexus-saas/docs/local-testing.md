# Full local testing on Windows

The full app runs at [http://127.0.0.1:3017/login](http://127.0.0.1:3017/login), using a project-local PostgreSQL 17 cluster on `127.0.0.1:55432`. The earlier [sample screen preview](http://127.0.0.1:3016/?view=products) is separate and uses temporary fixture data.

## Setup and start

From the `nexus-saas` directory in PowerShell:

```powershell
npm.cmd run setup:local
npm.cmd run dev:local
```

Setup downloads a portable PostgreSQL archive into `.local`, verifies its publisher checksum, initializes the cluster, and applies the project migrations to two databases: `quickdata_dev` for the app and `quickdata_integration` for database tests. It does not register a Windows service, change PATH, or connect to an existing database. The first download is approximately 326 MiB before extraction.

The versioned source is EDB's [PostgreSQL binaries distribution](https://www.enterprisedb.com/download-postgresql-binaries); the pinned archive's checksum is documented in [the publisher's checksum response](https://github.com/EnterpriseDB/edb-installers/issues/682). The helper uses PostgreSQL's documented [initialization](https://www.postgresql.org/docs/17/app-initdb.html) and [server-control commands](https://www.postgresql.org/docs/17/app-pg-ctl.html).

Local seed data contains one test shop, an active local test plan, four sample bundles, and these accounts:

| Role | Email |
| --- | --- |
| Store owner | `owner@quickdata.test` |
| Agent | `agent@quickdata.test` |
| Reseller | `reseller@quickdata.test` |
| Admin | `admin@quickdata.test` |

Passwords are generated locally and saved in `.local/accounts.json`. Database/auth/encryption secrets are in `.local/environment.json`. These files, the database files and downloaded binaries are ignored by Git. Do not publish or share `.local`.

Re-running setup applies only pending migrations, preserves sample product edits, and does not add duplicate seed wallet credits. It refreshes the local test accounts and plan. It does not reset/delete users or overwrite saved payment settings. Wallet seed balances are artificial test funds.

## Checks

```powershell
npm.cmd run test:api
npm.cmd run test:ux
npm.cmd run test:db
npm.cmd run test:local:browser
```

`test:db` uses the generated connection for `quickdata_integration` only. Its seven checks use real PostgreSQL queries, production product routes and production authorization checks with a controlled session provider. They verify successful saves, rollback after a deliberately failed shop-price insert/update, preservation of omitted prices, role/tenant restrictions, order-history protection, and rollback when a concurrent purchase arrives during deletion. Cleanup removes only records/triggers created by that test run.

`test:local:browser` needs the full app running on port 3017. It uses actual NextAuth sign-in for all four roles, creates/edits a temporary product through the owner UI, confirms persistence after reload, and verifies HTTP 403 for agent/reseller product mutations. It removes its temporary product afterward.

Verified on 6 November 2026: both fresh databases applied all 26 migrations; all seven database tests passed; real sign-in and authenticated product checks passed; repeat setup left four users and four seed products in the app database and zero test users/products in the integration database after cleanup.

The API/environment test suite has 74 passing checks, including rejection of external database destinations and inherited external-service credentials. The 15 fixture-browser checks remain separate from the actual local-app browser smoke check.

## Paystack sandbox

Sign in as the owner and open [Customer Payments](http://127.0.0.1:3017/dashboard/settings#payments). Save a `pk_test_...` public key and `sk_test_...` secret key through that form. The secret is encrypted by the existing application code. Keep secret keys out of chat and source files.

```powershell
npm.cmd run test:paystack
```

This separate check reads the saved configuration from the local app database, uses the application's decryption helper, and requires both keys to be in test mode before any external request. It then makes a read-only authenticated request to Paystack's [balance endpoint](https://paystack.com/docs/api/transfer/#check-balance). It does not charge, transfer, initialize a payment or display balances/keys. A successful key check does not establish completed checkout, refunds or delivery; those are the next tests. Paystack documents sandbox payment details in [Test Payments](https://paystack.com/docs/payments/test-payments/).

The local launcher clears inherited payment/mail/provider credentials and starts with manual dispatch. Seeded payment keys are not provided or marked connected. Entering actual test keys is required before checkout can be tested. Store-owner Paystack settings cover shop payments; wallet funding and platform-subscription payments use separately configured keys in the existing app.

## Stop and restart

Stop the app with Ctrl+C, then stop this database only:

```powershell
npm.cmd run db:local:stop
```

`npm.cmd run dev:local` starts the local database again before launching the app. Keep `.local` if you want to preserve test data and keys.
