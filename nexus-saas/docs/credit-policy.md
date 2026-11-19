# Seller wallet and credit policy

Implemented locally on 17 November 2026 after the owner requested prepaid purchases with explicitly approved overdraft accounts.

## Purchases

API, agent, reseller and legacy dashboard purchases check the same wallet capacity under a database lock. Prepaid is the default: no approved credit means insufficient funds rejects the purchase before charging or dispatching it. API purchases debit the seller cost resolved from server-side prices, including strict assigned pricing profiles. New subscriber API keys bind to the creating store owner. A legacy unbound owner key requires exactly one eligible store owner; ambiguous ownership is rejected for review.

The API caller's amountPaid is a declaration of money the seller collected outside QuickData. It does not prove a platform payment, increase wallet funds or create withdrawable profit. Order sale totals and actual wallet charges are separate concepts; the new-order response includes walletCharged. Externally collected API margins, including historical API margins, are excluded from withdrawal entitlement. Existing historical payouts and financial reports require reconciliation before production rollout.

API orders are scoped to their originating key. Reusing externalReference for another product, recipient, quantity or declared amount returns 409. Per-key database locking protects duplicate requests and rate-limit decisions. A database unique index covers the key/reference pair for newly created orders. Missing ownership evidence does not grant access to historical orders.

## Credit and debt

- Credit is off until explicitly approved with a positive limit and an audit note.
- Store owners can approve agents/resellers in their own business. They cannot approve their own store-owner credit. Platform admins approve store-owner credit.
- Credit is a maximum outstanding debt, not free funds and not a daily limit that resets while debt remains unpaid.
- Each purchase still records a debit. A negative wallet balance is the debt owed. The first use of credit sets its due time to the next midnight GMT, representing end-of-day settlement.
- Further borrowing is blocked after that deadline until debt is fully cleared. Partial payments reduce debt but do not extend the overdue deadline. A cleared account can borrow again within its approved limit.
- Reducing or disabling a limit blocks further borrowing as appropriate and does not erase debt. Refunds reverse the actual linked debit and reduce debt. Retry charging uses the original debit amount, so an externally collected sale total is never accidentally charged as the retry cost.
- No interest, automatic late fee, automatic bank collection, debt forgiveness or manual due-date extension is implemented.

Example: GHS 20 wallet funds plus a GHS 50 credit limit can cover a GHS 30 purchase. The resulting balance is -GHS 10, with GHS 40 still available under the credit limit. A GHS 15 repayment changes the balance to GHS 5 and clears the debt.

## Repayments and funding boundaries

Store-owner wallet payments are verified using platform wallet billing credentials (PAYSTACK_WALLET_SECRET_KEY or the existing platform fallback). Agent/reseller payments use the store owner's connected merchant. Verification checks the expected funding owner against the actual recipient's role, as well as reference, amount, currency and organization. A store owner cannot clear platform debt by verifying a payment received by their own merchant account.

Authorized owner/admin manual credits represent recorded external payments and are audited. Agent-to-reseller manual funding is now a transfer: it debits the agent's available cash and credits their own reseller atomically. Approved credit cannot be transferred to manufacture a repayment or additional wallet balance. Manual payment receipt evidence and operator reconciliation still need a fuller workflow before live release.

## Screens and verification

Credit & debt is available at /dashboard/credit, /admin/credit, /agent/credit and /reseller/credit. Managers see scoped accounts and audited limit controls; borrowers see only their own balance, debt, deadline and repayment link. Agent and reseller home dashboards show the detailed funding state because it directly controls their purchases. The store-owner home shows only a compact funding status when it has an operational balance, active credit or debt; full wallet and credit details remain on the dedicated pages. The list shows up to 100 accounts with name/email search. No existing account is automatically enrolled in credit.

Run node scripts/smoke-credit.mjs for a local-only browser check. It creates and cleans up a temporary agent and synthetic debt display fixture in quickdata_dev, verifies owner approval persistence, borrower dashboard and credit-page visibility, self-approval denial, repayment navigation and phone layout, and saves sample screenshots under docs/previews. It makes no real payment or delivery request.

## Remaining release work

Live/sandbox gateway tests, reconciliation of legacy API/payment records, matching cost-versus-sale labels across older exports and admin summaries, safe account closure/deactivation with financial history, debt notifications/collection reminders and exact storage migration of older Float fields remain. Advanced Analytics now labels the channel split explicitly, but historical records still need a controlled reconciliation before production. Credit and quote limits already use exact integer minor units. Credit history is protected by database foreign keys; do not remove those guards to force account deletion. This local implementation is not a production credit rollout.
