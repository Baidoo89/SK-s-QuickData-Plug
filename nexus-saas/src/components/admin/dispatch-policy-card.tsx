"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"

type DispatchMode = "MANUAL_ONLY" | "API_ONLY" | "HYBRID"

type DispatchPolicy = {
  mode: DispatchMode
  apiEnabledNetworks: string[]
  providerKey: string
  providerName: string
  networkProviderMap: Record<string, string>
}

type DispatchPolicyCardProps = {
  endpoint?: string
}

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"]

export function DispatchPolicyCard({ endpoint = "/api/admin/dispatch-policy" }: DispatchPolicyCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<DispatchMode>("HYBRID")
  const [providerKey, setProviderKey] = useState("primary")
  const [providerName, setProviderName] = useState("Primary Provider")
  const [apiNetworksText, setApiNetworksText] = useState("MTN")
  const [networkProviderText, setNetworkProviderText] = useState("")

  useEffect(() => {
    async function loadPolicy() {
      setLoading(true)
      try {
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error("Could not load policy")
        const payload = await res.json()
        const data: DispatchPolicy = payload.data

        setMode(data.mode)
        setProviderKey(data.providerKey || "primary")
        setProviderName(data.providerName)
        setApiNetworksText(data.apiEnabledNetworks.join(", "))
        setNetworkProviderText(
          Object.entries(data.networkProviderMap || {})
            .map(([network, key]) => `${network}=${key}`)
            .join(", "),
        )
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
      const networkProviderMap = networkProviderText
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, entry) => {
          const [network, key] = entry.split("=").map((part) => part?.trim())
          if (network && key) acc[network.toUpperCase()] = key.toLowerCase()
          return acc
        }, {})

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          providerKey: providerKey.trim(),
          providerName: providerName.trim(),
          apiEnabledNetworks,
          networkProviderMap,
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

  const enabledNetworks = apiNetworksText
    .split(",")
    .map((network) => network.trim().toUpperCase())
    .filter(Boolean)

  function toggleNetwork(network: string) {
    const current = new Set(enabledNetworks)
    if (current.has(network)) {
      current.delete(network)
    } else {
      current.add(network)
    }
    setApiNetworksText(Array.from(current).join(", "))
  }

  return (
    <Card className="premium-surface min-w-0 overflow-hidden rounded-lg">
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
        <CardTitle className="break-words text-sm font-semibold">Order Dispatch Policy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="break-words text-xs text-muted-foreground">
          Control which networks go through provider API and which stay manual.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Dispatch Mode</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { value: "HYBRID", label: "Hybrid", detail: "API + manual fallback" },
              { value: "MANUAL_ONLY", label: "Manual", detail: "No provider API" },
              { value: "API_ONLY", label: "API only", detail: "Strict automation" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={loading || saving}
                onClick={() => setMode(item.value as DispatchMode)}
                className={`min-w-0 rounded-md border px-3 py-2 text-left shadow-sm transition ${mode === item.value ? "border-primary bg-primary/10 text-foreground" : "border-border/70 bg-background/80 text-muted-foreground hover:text-foreground"}`}
              >
                <span className="block break-words text-xs font-semibold">{item.label}</span>
                <span className="mt-0.5 block break-words text-[10px]">{item.detail}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Default Provider Slot</label>
          <Input
            value={providerKey}
            onChange={(e) => setProviderKey(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="primary"
          />
          <p className="break-words text-[11px] text-muted-foreground">
            This must match a saved provider slot key. Example: primary, backup, mtn-main.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Provider Display Name</label>
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
          <div className="grid gap-2 sm:grid-cols-3">
            {NETWORKS.map((network) => {
              const enabled = enabledNetworks.includes(network)
              return (
                <button
                  key={network}
                  type="button"
                  disabled={loading || saving}
                  onClick={() => toggleNetwork(network)}
                  className={`min-w-0 rounded-md border px-3 py-2 text-left text-xs font-semibold shadow-sm transition ${enabled ? "border-primary bg-primary/10 text-foreground" : "border-border/70 bg-background/80 text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 break-words">{network === "AIRTELTIGO" ? "AirtelTigo" : network.charAt(0) + network.slice(1).toLowerCase()}</span>
                    <Badge variant={enabled ? "secondary" : "outline"} className="shrink-0 rounded-md px-2 py-0 text-[10px]">
                      {enabled ? "API on" : "Manual"}
                    </Badge>
                  </span>
                </button>
              )
            })}
          </div>
          <Input
            value={apiNetworksText}
            onChange={(e) => setApiNetworksText(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="MTN, AIRTELTIGO, TELECEL"
          />
          <p className="break-words text-[11px] text-muted-foreground">
            Comma-separated. Example: MTN for MTN-only API routing.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Network Provider Routing</label>
          <Input
            value={networkProviderText}
            onChange={(e) => setNetworkProviderText(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="MTN=primary>backup, TELECEL=backup, AIRTELTIGO=primary"
          />
          <p className="break-words text-[11px] text-muted-foreground">
            Optional. Use &gt; for fallback order. Example: MTN tries primary first, then backup.
          </p>
        </div>

        <Button onClick={savePolicy} disabled={loading || saving} className="w-full text-xs sm:w-auto">
          {saving ? "Saving..." : "Save Dispatch Policy"}
        </Button>
      </CardContent>
    </Card>
  )
}
