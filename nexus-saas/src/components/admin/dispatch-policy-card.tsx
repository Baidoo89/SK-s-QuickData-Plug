"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

type DispatchMode = "MANUAL_ONLY" | "API_ONLY" | "HYBRID"

type DispatchPolicy = {
  mode: DispatchMode
  apiEnabledNetworks: string[]
  providerName: string
}

type DispatchPolicyCardProps = {
  endpoint?: string
}

export function DispatchPolicyCard({ endpoint = "/api/admin/dispatch-policy" }: DispatchPolicyCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<DispatchMode>("HYBRID")
  const [providerName, setProviderName] = useState("Primary Provider")
  const [apiNetworksText, setApiNetworksText] = useState("MTN")

  useEffect(() => {
    async function loadPolicy() {
      setLoading(true)
      try {
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error("Could not load policy")
        const payload = await res.json()
        const data: DispatchPolicy = payload.data

        setMode(data.mode)
        setProviderName(data.providerName)
        setApiNetworksText(data.apiEnabledNetworks.join(", "))
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load dispatch policy",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadPolicy()
  }, [endpoint, toast])

  async function savePolicy() {
    setSaving(true)
    try {
      const apiEnabledNetworks = apiNetworksText
        .split(",")
        .map((n) => n.trim().toUpperCase())
        .filter(Boolean)

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          providerName: providerName.trim(),
          apiEnabledNetworks,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error?.message || "Failed to save policy")
      }

      toast({
        title: "Saved",
        description: "Dispatch policy updated successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not save dispatch policy",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <CardTitle className="text-sm font-semibold">Order Dispatch Policy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground">
          Control which networks go through provider API and which stay manual.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Dispatch Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DispatchMode)}
            disabled={loading || saving}
            className="h-9 w-full rounded-md border bg-background px-3 text-xs"
          >
            <option value="MANUAL_ONLY">Manual only</option>
            <option value="HYBRID">Hybrid (recommended)</option>
            <option value="API_ONLY">API only</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Provider Name</label>
          <Input
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="Primary Provider"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">API Enabled Networks</label>
          <Input
            value={apiNetworksText}
            onChange={(e) => setApiNetworksText(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="MTN, AIRTELTIGO, TELECEL"
          />
          <p className="text-[11px] text-muted-foreground">
            Comma-separated. Example: MTN for MTN-only API routing.
          </p>
        </div>

        <Button onClick={savePolicy} disabled={loading || saving} className="w-full text-xs sm:w-auto">
          {saving ? "Saving..." : "Save Dispatch Policy"}
        </Button>
      </CardContent>
    </Card>
  )
}
