"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"

type Props = {
  orderId: string
  initialStatus: string
  endpointBase?: string
}

const STATUS_OPTIONS = ["COMPLETED", "PROCESSING", "PENDING", "FAILED", "CANCELLED", "REFUNDED"] as const
const PAYMENT_LOCKED_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAYMENT_INIT_FAILED"])

function getStatusLabel(status: string) {
  if (status === "COMPLETED") return "DELIVERED"
  if (status === "PENDING_PAYMENT") return "AWAITING PAYMENT"
  if (status === "PAYMENT_FAILED") return "PAYMENT FAILED"
  if (status === "PAYMENT_INIT_FAILED") return "PAYMENT SETUP FAILED"
  return status
}

function getStatusBadgeClass(status: string) {
  if (status === "COMPLETED") return "border-primary bg-primary/10 text-primary hover:bg-primary/10"
  if (status === "PENDING") return "border-accent bg-accent/60 text-accent-foreground hover:bg-accent/60"
  if (status === "PROCESSING") return "border-primary bg-primary/10 text-primary hover:bg-primary/10"
  if (status === "PENDING_PAYMENT") return "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10"
  if (status === "FAILED" || status === "CANCELLED" || status === "REFUNDED") {
    return "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/10"
  }
  if (status === "PAYMENT_FAILED" || status === "PAYMENT_INIT_FAILED") {
    return "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/10"
  }
  return "border-border bg-muted text-muted-foreground hover:bg-muted"
}

export function OrderStatusSelect({ orderId, initialStatus, endpointBase = "/api/admin/orders" }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const previous = status
    setStatus(next)
    setSaving(true)
    try {
      const response = await fetch(`${endpointBase}/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })

      if (!response.ok) {
        throw new Error(`Failed to update order status (${response.status})`)
      }

      router.refresh()
    } catch (error) {
      console.error("Failed to update order status", error)
      setStatus(previous)
    } finally {
      setSaving(false)
    }
  }

  const badgeClassName = getStatusBadgeClass(status)
  const lockedByPayment = PAYMENT_LOCKED_STATUSES.has(status)

  if (lockedByPayment) {
    return (
      <Badge variant="outline" className={`w-full min-w-0 justify-center border px-2 py-1.5 text-center text-[11px] font-semibold ${badgeClassName}`}>
        {getStatusLabel(status)}
      </Badge>
    )
  }

  return (
    <div className="w-full min-w-0">
      <select
        value={status}
        onChange={handleChange}
        disabled={saving}
        aria-label={`Change order status from ${getStatusLabel(status)}`}
        className={`h-8 w-full min-w-0 rounded-full border px-2 text-center text-[11px] font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 ${badgeClassName}`}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {getStatusLabel(s)}
          </option>
        ))}
      </select>
    </div>
  )
}

