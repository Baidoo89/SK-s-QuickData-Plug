# Making QuickData Plug easier to use

Reviewed on 6 November 2026. Source: `Baidoo89/SK-s-QuickData-Plug`, baseline commit `dc5a0f4`, app directory `nexus-saas`. Local working branch: `ux/simpler-setup-and-buying`.

## Who we are improving it for

The owner identified all three groups as needing help: store owners setting up and managing sales, agents/resellers buying and selling data, and customers buying through a shared shop link.

The product already contains substantial functionality: tenant accounts, price groups, wallets, payment settings, delivery integrations, team management, storefronts, and order timelines. The first priority is making common tasks easier to find and finish. This review identifies likely friction from source inspection; it is not a substitute for observing people use the product.

## Comparison with existing platforms

These observations come from public pages, not paid accounts or completed purchases. Private dashboards, actual delivery speeds, refund performance, and support quality were not independently tested. Marketing promises are treated as claims rather than verified capabilities. Prices change and were not used to rank these services.

| Platform | Publicly visible approach | Lesson for QuickData Plug |
| --- | --- | --- |
| [GHNetPlug](https://www.ghnetplug.com/) | Shows network choices, bundle prices, Paystack checkout, and a prominent order-status link. Also displays a notice that delivery is not instant. | Make buying and order tracking obvious, and communicate delivery status without promising immediate delivery. |
| [GHNetPlug agent registration](https://www.ghnetplug.com/become-agent) | Explains registration requirements, agent pricing, and a personal store link. Registration includes administrator contact. | Explain what agents need to do next and what a shop link is. Reduce the need to ask support how to begin. |
| [DataPrimo](https://dataprimo.org/) | Offers guest buying and links for number checking and order tracking. Describes choosing a package, confirming the recipient, then paying and tracking. | Use clear stages and show the recipient and total before payment. Saved recipients and public tracking are candidates for later work. |
| [GhDatastores](https://www.ghdatastores.com/) | Advertises direct MoMo or wallet payments, order tracking, agent pricing, an API, and automated wallet refunds. | Clearly distinguish paying, delivery, and refund states. Validate our own reconciliation and refund behavior before making similar promises. |

QuickData Plug's existing strength is its store-owner and team-management functionality. The opportunity is to present that depth without requiring users to understand every feature before their first sale.

## Friction found and changes in this first pass

| User | Before | First improvement |
| --- | --- | --- |
| Store owner | “Continue Setup” always linked to Products, regardless of the missing requirement. | The main action leads to the first unfinished requirement. If everything is complete, it opens the shop preview when available. |
| Store owner | Required setup and recommended tools appear together as many cards. | A numbered essentials list and progress indicator lead the page; optional team/wallet/API tools are expandable. |
| Store owner | Settings links include `?tab=api` and `?tab=system`, but the settings page does not implement those tabs. | Business, payments, delivery and API sections have real anchor targets. Navigation and the setup payment link use them. |
| All signed-in roles | Daily tasks are mixed with expandable menus. Three layouts repeat similar navigation code. | One shared navigation shell keeps daily tasks visible and puts secondary tools in expandable sections. Mobile and desktop use the same links. |
| Agent / reseller | Network buttons and a dropdown repeat the same choice. | One accessible set of network buttons, followed by a labelled bundle selector and recipient input. |
| Agent / reseller | Failed network/bundle requests can silently produce an empty selection. Switching networks can allow a stale response to overwrite the latest bundles. | Explicit loading, empty, error and retry states; previous bundle requests are aborted and old selections are cleared on a network change. |
| Agent / reseller | A browser confirmation interrupts the purchase; the success view includes provider/dispatch jargon. | An inline review shows network, bundle, normalized recipient and wallet total. Confirmation submits to the existing role-specific API. The receipt uses plain delivery status and links to Orders. |
| Customer | A browser confirmation interrupts storefront checkout. Recipient controls have labels that are not linked to inputs. | An inline review with an edit action precedes Paystack checkout, with labelled inputs and a visible checkout error. Bulk/service flows remain available. |

The shared purchase UI uses the existing server-calculated effective price and existing APIs. The UI does not recalculate pricing, authorize users, charge wallets, or dispatch orders itself. The authenticated server layouts and API authorization checks remain in place. An in-flight submission guard prevents repeated confirmation clicks from submitting twice within the same mounted page.

## Owner catalog: second improvement pass

The default `/dashboard/products` screen now focuses on data bundles. Owners can search across networks, filter bundles needing a price review, and add or edit a bundle in a labelled form. Changes are sent only after pressing **Save bundle**; canceling or leaving a field does not save it. A bundle can be hidden using the same explicit save, without deleting its records.

The form asks for a base price and a shop price. The existing backend uses the base price both in cost calculations and as the fallback charge for team purchases. Assigned price groups and individual prices can override that charge. The form explains this relationship and preserves the legacy product default price on edits. It does not rewrite team pricing rules.

The price difference is calculated in cents and labelled **Difference before fees**. Missing base/shop-price records, zero shop prices, and below-base shop prices are flagged for review. The products response includes additive `hasBasePrice` and `hasStorefrontPrice` fields so an inherited default does not look like a deliberately configured price. Shop readiness enforcement still uses the existing rules; a warning does not change transaction authorization.

Existing price groups remain at `?tab=pricing_profiles`; services and the existing catalog tools remain at `?tab=advanced#service-forms`. Those advanced screens need further simplification in a later pass.

The [products preview](http://127.0.0.1:3016/?view=products) supports temporary sample edits. Restarting the preview server resets these edits. Screenshots: [bundle list](previews/owner-products.png), [editor on a phone](previews/bundle-editor-mobile.png). Browser testing and the visible preview use separate build directories so testing does not interrupt the preview.

## Product permissions and transaction safety

The next backend pass restricts product creation, editing and deletion to organization managers, saves product/base/shop-price writes in one transaction, preserves omitted prices on updates, validates input, and protects products with order history from deletion. See [the product-write review](product-write-safety.md) for the rules, tests and remaining PostgreSQL integration work.

## Validation

The [full local testing environment](local-testing.md) now uses real PostgreSQL and actual sign-in on port 3017. It adds seven passing database integration checks and authenticated browser checks for all roles. Test payment credentials must still be configured before verifying checkout.

Run from `nexus-saas`:

```text
npm ci
npx tsc --noEmit
npm run test:api
npm run test:ux
npm run build
```

Playwright uses an isolated fixture app that imports the production UI and intercepts its requests. It does not add a test bypass to the real app, connect to a database, or send real payments/provider requests. It exercises owner setup, both purchase roles, recipient validation, failed requests and retries, stale network responses, selling restrictions, mobile navigation, repeat confirmation clicks, and customer review/edit/payment-error behavior.

The fixture is for developer testing. Running the full product requires a PostgreSQL connection and authentication configuration from `.env.example`. Payment and delivery validation needs test credentials and a disposable organization. A checked-in `prisma/dev.db` does not supply the PostgreSQL service required by the schema. Existing scripts that reset accounts should only run against a disposable database.

On this checkout, 74 API/environment tests and all 15 fixture-browser tests passed, along with TypeScript checking and the production build. Catalog checks cover missing-price diagnostics, filters, explicit saving, repeat submission clicks, price validation, error recovery, canceling, hiding, phone layouts and blocked-deletion feedback. The local-database stage adds seven passing real PostgreSQL integration tests and full-app browser checks using actual sign-in. The earlier build check logged missing-database errors with `DATABASE_URL` unset; the new local runtime launcher supplies its generated, isolated database configuration. Paystack authentication/checkout remains pending saved test credentials.

Sample-data previews from the isolated fixture app: [owner setup](previews/owner-setup.png) and [customer review on a phone](previews/customer-review-mobile.png). These show the production UI components with fixture data, rather than a configured live business.

## Next work, in priority order

1. **Run task-based sessions with real users.** Ask a new owner to publish a shop, an agent to buy a bundle and find its status, and a customer to pay through a shop link. Record completion, wrong turns, time, and requests for help. These observations determine the next changes.
2. **Reduce the remaining owner setup work.** Review whether the plan/payment/product requirements reflect the actual business rules; simplify service forms and advanced pricing; align shop-readiness messages with per-bundle diagnostics. Current readiness checks count any active product and any base-price record and do not prove every displayed product is ready.
3. **Make owner operations actionable.** Put orders needing attention first, clarify the difference between storefront revenue and wallet funds, and explain delivery exceptions and withdrawal outcomes in everyday language.
4. **Strengthen payment and order recovery.** Add server-side idempotency, verify transaction/refund consistency and tenant boundaries, and test delayed callbacks and interrupted checkouts. Product permissions and shared transactions now have API and real PostgreSQL rollback/concurrency coverage. Next, configure Paystack test credentials and verify payment/order behavior. A client submission guard does not provide transaction-level idempotency across reloads, tabs, or retries.
5. **Improve customer follow-up.** Review the existing Paystack return flow and order references; design privacy-preserving guest tracking and support handoff. Avoid exposing recipient numbers or tenant orders through a public lookup.
6. **Improve repeat purchases.** Consider saved recipients, previous bundle shortcuts and clear wallet-balance guidance once the first purchase is easy.
7. **Review accessibility and slow connections.** Test keyboard/screen-reader navigation, low-end phones, and unreliable network behavior across the remaining product, bulk-order, settings and support screens.

## How we will judge improvement

Measure first-shop setup completion, completed purchases, time to locate an order, payment-abandonment rates, and support requests per order. Establish a baseline with the existing flows, then compare the revised flows with the same tasks. “Best” should mean demonstrably easier and reliable for these users, not simply having more features.
