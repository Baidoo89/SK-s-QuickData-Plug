"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

const STATUS_OPTIONS = ["PENDING", "COMPLETED", "FAILED"] as const

export function BulkOrderStatusUpdate() {
  const { toast } = useToast()
  const [rawOrderIds, setRawOrderIds] = useState("")
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("COMPLETED")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const orderIds = rawOrderIds
      .split(/[\s,\n]+/)
      .map((id) => id.trim())
      .filter(Boolean)

    if (orderIds.length === 0) {
      toast({ title: "Error", description: "Provide at least one order ID", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/admin/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, status }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Bulk update failed")
      }

      toast({
        title: "Bulk status updated",
        description: `${payload?.data?.updatedCount ?? 0} orders set to ${status}`,
      })
      setRawOrderIds("")
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not update orders",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Bulk Status Update</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={rawOrderIds}
            onChange={(e) => setRawOrderIds(e.target.value)}
            className="w-full min-h-[90px] rounded-md border p-2 text-xs font-mono"
            placeholder="Paste order IDs (comma, space, or new line separated)"
          />
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}
              className="h-9 rounded-md border bg-background px-3 text-xs"
              disabled={saving}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={saving} className="text-xs">
              {saving ? "Updating..." : "Update Orders"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
