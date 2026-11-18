import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog"
import { formatGhanaCedis } from "@/lib/currency"

type MobileOrderCardProps = {
  orderId: string
  code: string
  date: string
  customer: string
  phone?: string
  bundle?: string
  amount: number
  profit?: number
  status: string
  payment?: string
  paymentReference?: string
  source?: string
  seller?: string
  endpointBase?: string
  selected?: boolean
  selectable?: boolean
  disabled?: boolean
  onSelect?: () => void
  action?: ReactNode
}

function statusVariant(status: string): "secondary" | "destructive" | "outline" {
  if (status === "COMPLETED" || status === "DELIVERED") return "secondary"
  if (status.includes("FAILED") || status === "FAILED") return "destructive"
  return "outline"
}

export function MobileOrderCard({
  orderId,
  code,
  date,
  customer,
  phone,
  bundle,
  amount,
  profit,
  status,
  payment,
  paymentReference,
  source,
  seller,
  endpointBase,
  selected = false,
  selectable = false,
  disabled = false,
  onSelect,
  action,
}: MobileOrderCardProps) {
  return (
    <details className={`group rounded-lg border bg-card/95 shadow-sm ${selected ? "border-primary bg-primary/5" : "border-border/70"}`}>
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={onSelect}
            onClick={(event) => event.stopPropagation()}
            className="h-4 w-4 shrink-0 rounded border-border disabled:opacity-40"
            aria-label={`Select order ${code}`}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate font-mono text-xs font-semibold">{code}</p>
            <Badge variant={statusVariant(status)} className="shrink-0 rounded-md text-[10px]">{status}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{customer} · {date}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">{formatGhanaCedis(amount)}</p>
          {profit !== undefined ? <p className={profit > 0 ? "text-[10px] font-medium text-primary" : "text-[10px] text-muted-foreground"}>{formatGhanaCedis(profit)} profit</p> : null}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid grid-cols-2 gap-2 border-t border-border/60 px-3 pb-3 pt-2 text-xs">
        {bundle ? <div className="min-w-0"><p className="text-muted-foreground">Bundle</p><p className="truncate font-medium">{bundle}</p></div> : null}
        {phone ? <div className="min-w-0"><p className="text-muted-foreground">Phone</p><p className="truncate font-medium">{phone}</p></div> : null}
        {source ? <div className="min-w-0"><p className="text-muted-foreground">Source</p><p className="truncate font-medium">{source}</p></div> : null}
        {seller ? <div className="min-w-0"><p className="text-muted-foreground">Seller</p><p className="truncate font-medium">{seller}</p></div> : null}
        {payment ? <div className="min-w-0"><p className="text-muted-foreground">Payment</p><p className="truncate font-medium">{payment}</p></div> : null}
        {paymentReference ? <div className="min-w-0"><p className="text-muted-foreground">Reference</p><p className="truncate font-mono text-[10px]">{paymentReference}</p></div> : null}
        {action ? <div className="col-span-2 flex items-center gap-2 pt-1">{action}</div> : null}
        {endpointBase ? <div className="col-span-2 pt-1"><OrderTimelineDialog orderId={orderId} endpointBase={endpointBase} /></div> : null}
      </div>
    </details>
  )
}
