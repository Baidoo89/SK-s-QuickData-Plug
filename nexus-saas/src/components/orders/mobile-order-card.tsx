import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog"
import { formatGhanaCedis } from "@/lib/currency"
import { getOrderStatusBadgeClass, getOrderStatusLabel } from "@/lib/order-status"

export const MOBILE_ORDER_GRID_CLASS = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.55fr)_auto_auto_auto] items-center gap-2"

type MobileOrderTableProps = {
  children: ReactNode
  label?: string
}

export function MobileOrderTable({ children, label = "Orders table" }: MobileOrderTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/95" aria-label={label}>
      <div className={`${MOBILE_ORDER_GRID_CLASS} border-b border-border/70 bg-muted/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground`}>
        <span>Order</span>
        <span>Customer / bundle</span>
        <span>Status</span>
        <span className="text-right">Total</span>
        <span aria-hidden="true" />
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  )
}

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
    <details className={`group ${selected ? "bg-primary/5" : "bg-card/95"}`}>
      <summary className={`${MOBILE_ORDER_GRID_CLASS} min-w-0 cursor-pointer list-none px-3 py-3 text-xs outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/25 [&::-webkit-details-marker]:hidden`}>
        <div className="flex min-w-0 items-center gap-2">
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
          <div className="min-w-0">
            <p className="break-all font-mono text-[10px] font-semibold leading-tight">{code}</p>
            <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{date}</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{customer}</p>
          {bundle || phone ? <p className="truncate text-[10px] text-muted-foreground">{[bundle, phone].filter(Boolean).join(" · ")}</p> : null}
        </div>
        <Badge variant="outline" className={`max-w-[5.5rem] truncate rounded-md px-1.5 text-[10px] ${getOrderStatusBadgeClass(status)}`}>{getOrderStatusLabel(status)}</Badge>
        <div className="min-w-0 text-right">
          <p className="text-xs font-bold">{formatGhanaCedis(amount)}</p>
          {profit !== undefined ? <p className={profit > 0 ? "truncate text-[10px] font-medium text-primary" : "truncate text-[10px] text-muted-foreground"}>{formatGhanaCedis(profit)} profit</p> : null}
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
