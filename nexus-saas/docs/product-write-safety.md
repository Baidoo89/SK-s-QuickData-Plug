# Product permissions and saving

Implemented on 6 November 2026 for product creation, updates and deletion.

## Who can change products

`POST /api/products`, `PUT /api/products/[id]`, and `DELETE /api/products/[id]` use the existing `requireOrgManager` guard. An account must be signed in, active, approved, attached to an organization, and have role `SUBSCRIBER` or `SUPERADMIN`. Agents, resellers and unrecognized roles receive HTTP 403. Product ownership is checked against the authenticated account's organization, including for superadmins; a product belonging to another business returns HTTP 404.

Organization and product IDs supplied in the JSON body do not override those checks. The existing product-list authentication is unchanged.

## What saves together

Creation writes the product, its base price and its subscriber shop price through the same Prisma 5 interactive transaction. The shop-price helper now requires a caller-supplied transaction client. Updating a product uses that same transaction boundary for every price supplied in the update. A thrown price-write error aborts the callback rather than returning a partial success.

Partial updates are intentional:

| Update supplied | Changes |
| --- | --- |
| `name` or `active` | Product metadata only; price records remain unchanged. |
| `price` | Legacy product default only. |
| `basePrice` | Explicit base price only. |
| `storefrontPrice` | Explicit shop price only. |
| All three prices | All supplied values save with the product in one transaction. |

An omitted explicit price record remains absent during a metadata-only update. An explicit zero is retained. Existing team-pricing precedence is unchanged. Creation continues to default missing base and shop prices to the required product `price`, and still checks the subscription and product limit.

## Validation and deletion

Both write endpoints validate JSON before changing records. Prices must be finite, nonnegative JSON numbers; strings such as `"12garbage"`, nulls and booleans are rejected as prices. Stock must fit a nonnegative PostgreSQL integer. Names cannot be blank, and `active` must be a boolean. Bad JSON, empty updates and invalid fields return HTTP 400. PUT keeps its existing successful response shape; internal errors now use the standard JSON error response.

Deletion no longer deletes past order items. A product with order history returns HTTP 409 with an instruction to hide it instead. If a database foreign-key constraint prevents deletion after the initial history check, the cleanup transaction is aborted and HTTP 409 is returned. The advanced catalog displays this message. Normal hiding remains available through the explicit bundle save form.

## Evidence and limits

Run `npm run test:api`. The 65 server tests load the production route handlers, real auth guard, validation schemas and shop-price SQL helper. They replace the session provider and database with controlled test doubles. Their stateful transaction stand-in checks rollback paths and detects writes escaping the transaction. Cases cover role/account restrictions, organization boundaries, attempted body-ID overrides, valid creation, partial updates, zero prices, subscription/product limits, invalid input, price-write failures and order-history protection.

The 15 browser checks also passed, including an added check for displaying the blocked-deletion message. TypeScript checking and the production build passed. The build still logs database-dependent page errors with `DATABASE_URL` unset.

The subsequent [local PostgreSQL stage](local-testing.md) applied all 26 migrations to two isolated databases and passed seven integration tests, including real rollback after a failed shop-price write and a controlled purchase/deletion race. Real NextAuth sign-in and authenticated product changes were also checked through the browser. Payment and provider integration tests remain separate.
