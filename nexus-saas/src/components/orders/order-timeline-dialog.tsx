"use client"

import { useState } from "react"
import { Clock3, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { formatGhanaCedis } from "@/lib/currency"

type TimelinePayload = {
  order: {
    id: string
    status: string
    total: number
    phoneNumber: string | null
    organization: { name: string } | null
    customer: { name: string; email: string; phone: string | null } | null
    agent: { name: string } | null
    items: Array<{ id: string; quantity: number; price: number; profit: number; productName: string }>
  }
  payment: { owner: string; status: string; reference: string; amount: number; paidAt: string | null } | null
  events: Array<{
    id: string
    action: string
    label: string
    actorName: string | null
    createdAt: string
    meta: Record<string, unknown>
  }>
}

type Props = {
  orderId: string
  endpointBase?: string
}

function compactMeta(meta: Record<string, unknown>) {
  const entries = Object.entries(meta).filter(([, value]) => value !== null && value !== undefined && value !== "")
  if (entries.length === 0) return null
  return entries.slice(0, 4).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" | ")
}

export function OrderTimelineDialog({ orderId, endpointBase = "/api/orders" }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState<TimelinePayload | null>(null)
  const [error, setError] = useState("")

  async function loadTimeline(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen || payload || loading) return

    setLoading(true)
    setError("")
    try {
      const response = await fetch(`${endpointBase}/${orderId}/timeline`)
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error?.message || "Could not load timeline")
      }
      setPayload(json?.data ?? json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load timeline")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={loadTimeline}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
          <Clock3 className="h-3.5 w-3.5" />
          Timeline
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order Timeline</DialogTitle>
          <DialogDescription>Audit trail, payment reference, and fulfillment history for this order.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading timeline...
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        ) : payload ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 text-sm shadow-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Order</p>
                <p className="font-mono font-semibold">{payload.order.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline">{payload.order.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="font-medium">{payload.order.customer?.name || "Guest Customer"}</p>
                <p className="text-xs text-muted-foreground">{payload.order.phoneNumber || payload.order.customer?.phone || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold">{formatGhanaCedis(payload.order.total)}</p>
              </div>
              {payload.payment ? (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Payment</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{payload.payment.owner}</Badge>
                    <Badge variant="outline">{payload.payment.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{payload.payment.reference}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/70 bg-background/80 shadow-sm">
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold">Pricing context</p>
                <p className="text-xs text-muted-foreground">
                  Dashboard buys show zero withdrawable profit. Storefront/API customer sales show seller margin where applicable.
                </p>
              </div>
              <div className="divide-y">
                {payload.order.items.map((item) => {
                  const unitProfit = item.quantity > 0 ? item.profit / item.quantity : 0
                  const inferredCost = Math.max(item.price - unitProfit, 0)
                  return (
                    <div key={item.id} className="grid gap-3 px-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                      </div>
                      <div>
                        <p className="font-semibold">{formatGhanaCedis(item.price)}</p>
                        <p className="text-xs text-muted-foreground">Order price</p>
                      </div>
                      <div>
                        <p className="font-semibold">{formatGhanaCedis(inferredCost)}</p>
                        <p className="text-xs text-muted-foreground">Cost basis</p>
                      </div>
                      <div className="sm:text-right">
                        <p className={item.profit > 0 ? "font-semibold text-primary" : "font-semibold text-muted-foreground"}>
                          {formatGhanaCedis(item.profit)}
                        </p>
                        <p className="text-xs text-muted-foreground">Withdrawable profit</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3">
              {payload.events.map((event) => {
                const meta = compactMeta(event.meta)
                return (
                  <div key={event.id} className="grid grid-cols-[20px_1fr] gap-3">
                    <div className="flex flex-col items-center">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                      <div className="h-full min-h-8 w-px bg-border" />
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{event.label}</p>
                        <span className="text-xs text-muted-foreground">{format(new Date(event.createdAt), "MMM d, yyyy HH:mm")}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actorName ? `By ${event.actorName}` : "System event"}
                      </p>
                      {meta ? <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground">{meta}</p> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
