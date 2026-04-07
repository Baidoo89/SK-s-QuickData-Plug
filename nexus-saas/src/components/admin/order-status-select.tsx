"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"

type Props = {
  orderId: string
  initialStatus: string
  endpointBase?: string
}

const STATUS_OPTIONS = ["COMPLETED", "PENDING", "FAILED", "CANCELLED", "REFUNDED"] as const

function getStatusLabel(status: string) {
  return status === "COMPLETED" ? "DELIVERED" : status
}

function getStatusBadgeClass(status: string) {
  if (status === "COMPLETED") return "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
  if (status === "PENDING") return "border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-50"
  if (status === "PROCESSING") return "border-sky-500 bg-sky-50 text-sky-700 hover:bg-sky-50"
  if (status === "FAILED" || status === "CANCELLED" || status === "REFUNDED") {
    return "border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-50"
  }
  return "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-50"
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

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={`min-w-24 justify-center border text-[11px] font-medium ${badgeClassName}`}>
        {getStatusLabel(status)}
      </Badge>
      <select
        value={status}
        onChange={handleChange}
        disabled={saving}
        className={`h-7 rounded-md border bg-background px-2 text-[11px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${badgeClassName}`}
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
