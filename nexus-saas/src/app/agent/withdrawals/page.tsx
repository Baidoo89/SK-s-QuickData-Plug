import { WithdrawalRequestPanel } from "@/components/wallet/withdrawal-request-panel"
import { ResellerWithdrawalReviewPanel } from "@/components/agent/reseller-withdrawal-review-panel"

export default function AgentWithdrawalsPage() {
  return (
    <div className="portal-page space-y-4">
      <div className="space-y-1 max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">
          Review reseller profit payouts, then submit your own agent profit withdrawal separately from wallet top-ups.
        </p>
      </div>
      <ResellerWithdrawalReviewPanel />
      <WithdrawalRequestPanel />
    </div>
  )
}
