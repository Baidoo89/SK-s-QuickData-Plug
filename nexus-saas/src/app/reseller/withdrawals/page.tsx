import { WithdrawalRequestPanel } from "@/components/wallet/withdrawal-request-panel"

export default function ResellerWithdrawalsPage() {
  return (
    <div className="portal-page space-y-4">
      <div className="space-y-1 max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">
          Submit payout requests from completed customer-sale profit. Wallet top-ups remain for buying data only.
        </p>
      </div>
      <WithdrawalRequestPanel />
    </div>
  )
}
