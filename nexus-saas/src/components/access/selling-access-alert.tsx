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
      <div className="status-success flex gap-3 rounded-md border px-4 py-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Selling access is active</p>
          {!compact ? <p>Checkout, agent sales, reseller sales, and wallet-backed VTU ordering are available.</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="status-warning flex flex-col gap-3 rounded-md border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Selling is blocked</p>
          <p>{reason || "Complete the required setup steps before selling can resume."}</p>
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
