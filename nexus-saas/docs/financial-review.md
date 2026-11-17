# Financial review

Store owners open `/dashboard/reconciliation`; platform administrators open `/admin/reconciliation`. The navigation calls this Financial review. Owners see their own organization's cases and overdue team balances. Administrators can also see platform-only subscription exceptions. Agents and resellers cannot use this queue or its API.

The queue receives verified customer/subscription payment mismatches, conflicting terminal provider updates, and dispatch attempts with uncertain outcomes. A successful platform payment without a saved subscription quote is visible only to platform administrators. Unverified gateway errors do not create payment-mismatch cases.

Interrupted paid dispatch claims older than five minutes and legacy dispatch review alerts are imported in batches of up to 100 when a manager loads the queue. Completed claims are excluded. Refresh continues the import. Existing reviewed cases are retained; scanning an old claim does not reopen them. New evidence from the payment/provider flows reopens its matching case and increments its version.

Search by record ID, exact public order code or reference. Overdue balances can be searched by name or email. Filter cases by Open, Reviewed or All, and use Timeline to inspect an order's history. Review notes require 10–1000 characters and are saved atomically with an audit entry. Concurrent stale edits return a conflict, requiring a refresh. Previous review notes remain in the audit history when another review or new evidence arrives.

Recording a review changes the case and its audit history only. It does not deliver an order, retry a provider request, mark a payment paid, issue a refund or alter a wallet. Confirm the evidence and apply any resulting action through the existing authorized order/payment workflows. Reviewed means the operator recorded a review; it is not proof that funds or delivery were reconciled.

Overdue debt comes from actual successful wallet entries and the saved due date. It includes disabled credit accounts with outstanding debt and excludes repaid balances. It cannot be dismissed with a review note. Open debt account goes to the credit page with the account search populated.

Agent/reseller deletion now rejects accounts with financial or dependent history and directs operators to deactivate them instead. Deactivation preserves balances, debt and order ownership. Status changes and their audit entries commit together; inactive or unapproved accounts cannot purchase using cash or credit.

## Local verification

With the built app running on localhost port 3017:

```powershell
node.exe scripts/smoke-reconciliation.mjs
```

The check is restricted to `quickdata_dev`. It creates temporary synthetic order/debt records, signs in as the local owner, checks import, timeline, review, reopen, unchanged order/wallet, debt navigation and phone overflow, then removes its fixtures. No gateway/provider requests are made. Screenshots are in `docs/previews/financial-review*.png`.

Database tests separately verify organization/role boundaries, platform-only cases, stale edits, new-evidence reopening, audit rollback, interrupted-claim import, overdue repayment, provider conflict handling, history retention and deactivation rollback.
