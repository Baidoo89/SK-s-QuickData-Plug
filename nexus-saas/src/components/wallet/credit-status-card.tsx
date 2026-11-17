import Link from "next/link"
import { CreditCard, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatGhanaCedis } from "@/lib/currency"
import { moneyToMinor, minorToMoney } from "@/lib/money"

type Props = {
  href: string
  enabled: boolean
  limit: number
  balance: number
  dueAt: Date | null
}

function dueDate(value: Date) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeZone: "UTC" }).format(value) + " GMT"
}

export function CreditStatusCard({ href, enabled, limit, balance, dueAt }: Props) {
  const balanceMinor = moneyToMinor(balance)
  const owed = minorToMoney(Math.max(-balanceMinor, 0))
  const limitMinor = moneyToMinor(limit)
  const overdue = owed > 0 && Boolean(dueAt && dueAt <= new Date())
  const available = minorToMoney(Math.max(balanceMinor + (enabled ? limitMinor : 0), 0))

  return (
    <Card className="premium-surface overflow-hidden rounded-lg" data-testid="dashboard-credit-status">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" />Credit &amp; debt</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Your wallet, approved spending limit and current debt.</p>
          </div>
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href={href}>Open credit details <ExternalLink className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Amount owed</p><p className={overdue ? "mt-1 font-semibold text-destructive" : "mt-1 font-semibold"}>{formatGhanaCedis(owed)}</p></div>
          <div><p className="text-xs text-muted-foreground">Available to spend</p><p className="mt-1 font-semibold">{formatGhanaCedis(available)}</p></div>
          <div><p className="text-xs text-muted-foreground">Approved limit</p><p className="mt-1 font-semibold">{formatGhanaCedis(limit)}</p></div>
          <div><p className="text-xs text-muted-foreground">Wallet balance</p><p className="mt-1 font-semibold">{formatGhanaCedis(balance)}</p></div>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium">{overdue ? "Overdue: repay before borrowing again" : enabled ? "Credit approved" : "Prepaid only"}</p>
          {owed > 0 && dueAt && <p className="mt-1 text-muted-foreground">Payment due: {dueDate(dueAt)}</p>}
          {owed === 0 && enabled && <p className="mt-1 text-muted-foreground">Borrowed purchases are due at the end of the day in GMT.</p>}
        </div>
      </CardContent>
    </Card>
  )
}
