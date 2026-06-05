import { WithdrawalReviewPanel } from "@/components/admin/withdrawal-review-panel"

export default function AdminWithdrawalsPage() {
  return (
    <div className="portal-page space-y-4">
      <div className="space-y-1 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Financial audit</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Withdrawal Oversight</h1>
        <p className="text-sm text-muted-foreground">
          Read-only visibility into agent payout requests across tenants. Subscriber admins own approval and payout operations inside their organization.
        </p>
      </div>
      <div className="status-info rounded-md border px-4 py-3 text-sm">
        Superadmin does not approve or mark tenant payouts as paid here because the platform does not custody subscriber revenue.
      </div>
      <WithdrawalReviewPanel
        readOnly
        title="Agent withdrawal audit"
        description="Monitor payout pressure, liability, and status across tenants without operating tenant funds."
      />
    </div>
  )
}
