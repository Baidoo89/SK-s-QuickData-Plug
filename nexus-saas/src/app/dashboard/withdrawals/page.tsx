import { WithdrawalReviewPanel } from "@/components/admin/withdrawal-review-panel"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Banknote, CheckCircle2, WalletCards } from "lucide-react"

export default function DashboardWithdrawalsPage() {
  return (
    <div className="portal-page space-y-6">
      <PageHeader title="Withdrawals" description="Review seller profit payouts." />
      <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardContent className="grid min-w-0 gap-3 p-4 md:grid-cols-3">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-primary/10 text-primary">
              <Banknote className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Profit based</p>
              <p className="mt-1 text-xs text-muted-foreground">Withdrawable balance comes from completed-order profit.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
              <WalletCards className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Separate from wallet</p>
              <p className="mt-1 text-xs text-muted-foreground">Wallet top-ups are operational funds for buying VTU bundles.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-success/10 text-success">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Manual payout control</p>
              <p className="mt-1 text-xs text-muted-foreground">Approve, reject, then mark paid after external payout is done.</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <WithdrawalReviewPanel
        apiBase="/api/dashboard/withdrawals"
        description="Review agent payout requests inside your organization. Reseller payout requests are reviewed by their parent agent."
      />
    </div>
  )
}
