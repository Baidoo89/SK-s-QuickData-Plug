import Link from "next/link"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"

type SellingAccessAlertProps = {
  canSell: boolean
  reason?: string | null
  nextActionHref?: string | null
  nextActionLabel?: string | null
  compact?: boolean
}

export function SellingAccessAlert({
  canSell,
  reason,
  nextActionHref,
  nextActionLabel,
  compact = false,
}: SellingAccessAlertProps) {
  if (canSell) {
    return (
      <div className="status-success flex gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-success/25 bg-success/10">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">Selling access is active</p>
          {!compact ? <p className="break-words opacity-90">Checkout, agent sales, reseller sales, and wallet-backed VTU ordering are available.</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="status-warning flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-warning/25 bg-warning/10">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">Selling is blocked</p>
          <p className="break-words opacity-90">{reason || "Complete the required setup steps before selling can resume."}</p>
        </div>
      </div>
      {nextActionHref && nextActionLabel ? (
        <Button asChild size="sm" variant="outline" className="shrink-0 bg-background">
          <Link href={nextActionHref}>{nextActionLabel}</Link>
        </Button>
      ) : null}
    </div>
  )
}
