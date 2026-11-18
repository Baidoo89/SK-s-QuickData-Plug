import { WithdrawalReviewPanel } from "@/components/admin/withdrawal-review-panel"
import { PageHeader } from "@/components/ui/page-header"

export default function AdminWithdrawalsPage() {
  return (
    <div className="portal-page space-y-4">
      <PageHeader eyebrow="Financial audit" title="Withdrawal oversight" description="Read-only payout visibility across tenants." />
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
