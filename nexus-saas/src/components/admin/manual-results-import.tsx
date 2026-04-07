"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

type Row = { orderId: string; status: "PENDING" | "COMPLETED" | "FAILED" }

type ManualResultsImportProps = {
  importEndpoint?: string
}

export function ManualResultsImport({ importEndpoint = "/api/admin/orders/manual/import" }: ManualResultsImportProps) {
  const { toast } = useToast()
  const [csvText, setCsvText] = useState("orderId,status")
  const [loading, setLoading] = useState(false)

  function parseCsv(text: string): Row[] {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)

    if (lines.length < 2) return []

    const header = lines[0].toLowerCase().split(",").map((h) => h.trim())
    const orderIdIdx = header.indexOf("orderid")
    const statusIdx = header.indexOf("status")

    if (orderIdIdx === -1 || statusIdx === -1) {
      throw new Error("CSV must include orderId,status headers")
    }

    const rows: Row[] = []
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim())
      const orderId = cols[orderIdIdx]
      const status = cols[statusIdx]?.toUpperCase() as Row["status"]

      if (!orderId || !["PENDING", "COMPLETED", "FAILED"].includes(status)) continue
      rows.push({ orderId, status })
    }

    return rows
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()

    let rows: Row[] = []
    try {
      rows = parseCsv(csvText)
    } catch (error) {
      toast({
        title: "Invalid CSV",
        description: error instanceof Error ? error.message : "Could not parse CSV",
        variant: "destructive",
      })
      return
    }

    if (rows.length === 0) {
      toast({ title: "No rows", description: "No valid rows found to import", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(importEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Import failed")
      }

      toast({
        title: "Import complete",
        description: `${payload?.data?.updated ?? 0} updated, ${payload?.data?.failed ?? 0} failed`,
      })

      window.location.reload()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not import statuses",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Import Manual Results (CSV)</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleImport} className="space-y-3">
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full min-h-[110px] rounded-md border p-2 text-xs font-mono"
            placeholder="orderId,status"
          />
          <p className="text-[11px] text-muted-foreground">Format: orderId,status with status as PENDING, COMPLETED, or FAILED.</p>
          <Button type="submit" disabled={loading} className="text-xs">
            {loading ? "Importing..." : "Import Results"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
