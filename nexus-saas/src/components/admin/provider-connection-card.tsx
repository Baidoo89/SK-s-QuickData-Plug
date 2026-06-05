"use client"

import { useEffect, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

function inferProviderEnvironment(providerOrderUrl: string, providerApiKey: string) {
  const combined = `${providerOrderUrl} ${providerApiKey}`.toLowerCase()

  if (!combined.trim()) return "UNKNOWN"
  if (/sandbox|test|staging|demo|dev/.test(combined)) return "TEST"

  return "LIVE"
}

function isLikelyProductionHost(hostname: string) {
  if (!hostname) return false
  const normalized = hostname.toLowerCase()
  return normalized !== "localhost" && normalized !== "127.0.0.1" && !normalized.endsWith(".local")
}

type ProviderConnectionCardProps = {
  endpoint?: string
}

type ProviderConnectionSummary = {
  providerKey: string
  providerName: string
  providerOrderUrl: string | null
  hasApiKey: boolean
  active: boolean
}

export function ProviderConnectionCard({ endpoint = "/api/admin/provider-connection" }: ProviderConnectionCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [providerKey, setProviderKey] = useState("primary")
  const [providerName, setProviderName] = useState("Primary Provider")
  const [providerOrderUrl, setProviderOrderUrl] = useState("")
  const [providerApiKey, setProviderApiKey] = useState("")
  const [active, setActive] = useState(true)
  const [connections, setConnections] = useState<ProviderConnectionSummary[]>([])
  const [hasApiKey, setHasApiKey] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [hostname, setHostname] = useState("")
  const [allowTestInProd, setAllowTestInProd] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostname(window.location.hostname)
    }
  }, [])

  useEffect(() => {
    async function loadConnection() {
      setLoading(true)
      try {
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error("Could not load provider connection")
        const payload = await res.json()
        const data = payload.data

        setProviderKey(data.providerKey || "primary")
        setProviderName(data.providerName || "Primary Provider")
        setProviderOrderUrl(data.providerOrderUrl || "")
        setActive(data.active !== false)
        setHasApiKey(Boolean(data.hasApiKey))
        setUpdatedAt(data.updatedAt || null)
        setConnections(Array.isArray(data.connections) ? data.connections : [])
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load provider connection",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadConnection()
  }, [endpoint, toast])

  async function saveConnection() {
    const envGuess = inferProviderEnvironment(providerOrderUrl, providerApiKey)
    const prodHost = isLikelyProductionHost(hostname)

    if (prodHost && envGuess === "TEST" && !allowTestInProd) {
      toast({
        title: "Confirmation required",
        description: "You appear to be on a production host with test/sandbox provider credentials. Tick the confirmation box to continue.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName,
          providerKey,
          providerOrderUrl,
          providerApiKey,
          active,
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Failed to save provider connection")
      }

      setHasApiKey(Boolean(payload?.data?.hasApiKey))
      setUpdatedAt(payload?.data?.updatedAt || null)
      setProviderKey(payload?.data?.providerKey || providerKey)
      setActive(payload?.data?.active !== false)
      setConnections(Array.isArray(payload?.data?.connections) ? payload.data.connections : [])
      setProviderApiKey("")
      setAllowTestInProd(false)
      toast({
        title: "Saved",
        description: "Provider connection updated successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not save provider connection",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const envGuess = inferProviderEnvironment(providerOrderUrl, providerApiKey)
  const prodHost = isLikelyProductionHost(hostname)
  const showRiskWarning = prodHost && envGuess === "TEST"

  return (
    <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <CardTitle className="text-sm font-semibold">Provider Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground">
          Store the provider endpoint and secret securely on the server. This is used only for API-routed orders.
        </p>

        {connections.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/25 p-3">
            <p className="text-xs font-semibold text-foreground">Saved provider slots</p>
            <div className="flex flex-wrap gap-2">
              {connections.map((connection) => (
                <button
                  key={connection.providerKey}
                  type="button"
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-left text-[11px] transition hover:border-primary"
                  onClick={() => {
                    setProviderKey(connection.providerKey)
                    setProviderName(connection.providerName)
                    setProviderOrderUrl(connection.providerOrderUrl || "")
                    setHasApiKey(connection.hasApiKey)
                    setActive(connection.active)
                    setProviderApiKey("")
                  }}
                >
                  <span className="font-semibold text-foreground">{connection.providerKey}</span>
                  <span className="ml-1 text-muted-foreground">{connection.providerName}</span>
                  {!connection.active ? <span className="ml-1 text-destructive">Paused</span> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Detected provider environment:</span>
          <Badge
            variant="secondary"
            className={envGuess === "TEST" ? "bg-accent/70 text-accent-foreground" : envGuess === "LIVE" ? "bg-primary/15 text-foreground" : "bg-muted text-foreground"}
          >
            {envGuess}
          </Badge>
          {hostname ? (
            <span className="text-[11px] text-muted-foreground">Host: {hostname}</span>
          ) : null}
        </div>

        {showRiskWarning ? (
          <div className="space-y-2 rounded-md border border-border bg-accent/60 px-3 py-2">
            <p className="text-[11px] text-foreground">
              Warning: this looks like a production host, but provider URL/key looks like test or sandbox credentials.
            </p>
            <label className="flex items-center gap-2 text-[11px] text-foreground">
              <input
                type="checkbox"
                checked={allowTestInProd}
                onChange={(e) => setAllowTestInProd(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              I confirm I intentionally want to save test credentials on this host.
            </label>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Provider Slot Key</label>
          <Input
            value={providerKey}
            onChange={(e) => setProviderKey(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="primary"
          />
          <p className="text-[11px] text-muted-foreground">
            Use short keys like primary, backup, mtn-main. Network routing uses this key.
          </p>
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
          <label className="text-xs font-medium">Provider Order URL</label>
          <Input
            value={providerOrderUrl}
            onChange={(e) => setProviderOrderUrl(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="https://provider.example.com/orders"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Provider API Key</label>
          <Input
            type="password"
            value={providerApiKey}
            onChange={(e) => setProviderApiKey(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder={hasApiKey ? "Leave blank to keep saved key" : "Enter provider secret"}
          />
          <p className="text-[11px] text-muted-foreground">
            {hasApiKey ? "A provider secret is already saved on the server." : "No provider secret saved yet."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : "Not configured yet"}</span>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={loading || saving}
            className="h-4 w-4 rounded border-border"
          />
          Provider slot is active
        </label>

        <Button onClick={saveConnection} disabled={loading || saving} className="w-full text-xs sm:w-auto">
          {saving ? "Saving..." : "Save Provider Connection"}
        </Button>
      </CardContent>
    </Card>
  )
}

