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

export function ProviderConnectionCard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [providerName, setProviderName] = useState("Primary Provider")
  const [providerOrderUrl, setProviderOrderUrl] = useState("")
  const [providerApiKey, setProviderApiKey] = useState("")
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
        const res = await fetch("/api/admin/provider-connection")
        if (!res.ok) throw new Error("Could not load provider connection")
        const payload = await res.json()
        const data = payload.data

        setProviderName(data.providerName || "Primary Provider")
        setProviderOrderUrl(data.providerOrderUrl || "")
        setHasApiKey(Boolean(data.hasApiKey))
        setUpdatedAt(data.updatedAt || null)
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
  }, [toast])

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
      const res = await fetch("/api/admin/provider-connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName,
          providerOrderUrl,
          providerApiKey,
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Failed to save provider connection")
      }

      setHasApiKey(Boolean(payload?.data?.hasApiKey))
      setUpdatedAt(payload?.data?.updatedAt || null)
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
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Provider Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Store the provider endpoint and secret securely on the server. This is used only for API-routed orders.
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Detected provider environment:</span>
          <Badge
            variant="secondary"
            className={envGuess === "TEST" ? "bg-amber-100 text-amber-800" : envGuess === "LIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}
          >
            {envGuess}
          </Badge>
          {hostname ? (
            <span className="text-[11px] text-muted-foreground">Host: {hostname}</span>
          ) : null}
        </div>

        {showRiskWarning ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-900">
              Warning: this looks like a production host, but provider URL/key looks like test or sandbox credentials.
            </p>
            <label className="flex items-center gap-2 text-[11px] text-amber-900">
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

        <Button onClick={saveConnection} disabled={loading || saving} className="text-xs">
          {saving ? "Saving..." : "Save Provider Connection"}
        </Button>
      </CardContent>
    </Card>
  )
}
