"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type DispatchHealth = {
  attempts24h: number
  failedDispatches24h: number
  stalePendingApiOrders: number
  staleMinutes: number
  alert: boolean
}

export function DispatchHealthCard() {
  const [data, setData] = useState<DispatchHealth | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/dispatch-health")
        const payload = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(payload?.error?.message || "Failed to load dispatch health")
        }
        setData(payload.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load dispatch health")
      }
    }

    load()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          Dispatch Health
          {data ? (
            <Badge className={data.alert ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
              {data.alert ? "Alert" : "Healthy"}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">Loading dispatch health...</p>
        ) : (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span>Attempts (24h):</span><span className="font-semibold">{data.attempts24h}</span></div>
            <div className="flex justify-between"><span>Failed dispatches (24h):</span><span className="font-semibold">{data.failedDispatches24h}</span></div>
            <div className="flex justify-between"><span>Stale API pending:</span><span className="font-semibold">{data.stalePendingApiOrders}</span></div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Stale means API-routed orders pending longer than {data.staleMinutes} minutes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
