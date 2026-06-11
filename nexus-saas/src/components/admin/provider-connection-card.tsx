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
  templateKey: string
  active: boolean
}

type ProviderTemplateSummary = {
  templateKey: string
  name: string
  description: string | null
  authType: string
}

const PROVIDER_PRESETS: Record<string, { providerName: string; providerOrderUrl: string }> = {
  skplug: {
    providerName: "SKDataPlug",
    providerOrderUrl: "https://skdataplug.com/api/v1/order/",
  },
}

export function ProviderConnectionCard({ endpoint = "/api/admin/provider-connection" }: ProviderConnectionCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [providerKey, setProviderKey] = useState("primary")
  const [providerName, setProviderName] = useState("Primary Provider")
  const [providerOrderUrl, setProviderOrderUrl] = useState("")
  const [providerApiKey, setProviderApiKey] = useState("")
  const [templateKey, setTemplateKey] = useState("generic-json")
  const [active, setActive] = useState(true)
  const [connections, setConnections] = useState<ProviderConnectionSummary[]>([])
  const [templates, setTemplates] = useState<ProviderTemplateSummary[]>([])
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
        if (!res.ok) throw new Error("Could not load delivery account")
        const payload = await res.json()
        const data = payload.data

        setProviderKey(data.providerKey || "primary")
        setProviderName(data.providerName || "Primary Provider")
        setProviderOrderUrl(data.providerOrderUrl || "")
        setTemplateKey(data.templateKey || "generic-json")
        setActive(data.active !== false)
        setHasApiKey(Boolean(data.hasApiKey))
        setUpdatedAt(data.updatedAt || null)
        setConnections(Array.isArray(data.connections) ? data.connections : [])
        setTemplates(Array.isArray(data.templates) ? data.templates : [])
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load delivery account",
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
        description: "You appear to be on a production host with test/sandbox delivery credentials. Tick the confirmation box to continue.",
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
          templateKey,
          active,
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Failed to save delivery account")
      }

      setHasApiKey(Boolean(payload?.data?.hasApiKey))
      setUpdatedAt(payload?.data?.updatedAt || null)
      setProviderKey(payload?.data?.providerKey || providerKey)
      setTemplateKey(payload?.data?.templateKey || templateKey)
      setActive(payload?.data?.active !== false)
      setConnections(Array.isArray(payload?.data?.connections) ? payload.data.connections : [])
      setTemplates(Array.isArray(payload?.data?.templates) ? payload.data.templates : templates)
      setProviderApiKey("")
      setAllowTestInProd(false)
      toast({
        title: "Saved",
        description: "Delivery account updated successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not save delivery account",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  function applyProviderPreset(nextTemplateKey = templateKey) {
    const preset = PROVIDER_PRESETS[nextTemplateKey]
    if (!preset) return

    setProviderName((current) => current.trim() && current !== "Primary Provider" && current !== "Backup Provider" ? current : preset.providerName)
    setProviderOrderUrl(preset.providerOrderUrl)
    setTemplateKey(nextTemplateKey)
  }

  const envGuess = inferProviderEnvironment(providerOrderUrl, providerApiKey)
  const prodHost = isLikelyProductionHost(hostname)
  const showRiskWarning = prodHost && envGuess === "TEST"

  return (
    <Card className="premium-surface min-w-0 overflow-hidden rounded-lg">
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
        <CardTitle className="break-words text-sm font-semibold">Automatic Delivery Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="break-words text-xs text-muted-foreground">
          Save the delivery API details securely. This is used only when orders are sent for automatic delivery.
        </p>

        {connections.length > 0 ? (
          <div className="min-w-0 space-y-2 rounded-lg border border-border/70 bg-muted/25 p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Saved delivery accounts</p>
              <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px]"
                  onClick={() => applyProviderPreset("skplug")}
                >
                  Use SKDataPlug
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px]"
                  onClick={() => {
                    setProviderKey("backup")
                    setProviderName("Backup Provider")
                    setProviderOrderUrl("")
                    setProviderApiKey("")
                    setTemplateKey("generic-json")
                    setHasApiKey(false)
                    setActive(true)
                    setUpdatedAt(null)
                  }}
                >
                  New account
                </Button>
              </div>
            </div>
            <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap">
              {connections.map((connection) => (
                <button
                  key={connection.providerKey}
                  type="button"
                  className="min-w-0 max-w-full rounded-md border border-border/70 bg-background/80 px-2.5 py-1 text-left text-[11px] shadow-sm transition hover:border-primary sm:max-w-[240px]"
                  onClick={() => {
                    setProviderKey(connection.providerKey)
                    setProviderName(connection.providerName)
                    setProviderOrderUrl(connection.providerOrderUrl || "")
                    setTemplateKey(connection.templateKey || "generic-json")
                    setHasApiKey(connection.hasApiKey)
                    setActive(connection.active)
                    setProviderApiKey("")
                  }}
                >
                  <span className="break-all font-semibold text-foreground">{connection.providerKey}</span>
                  <span className="ml-1 break-words text-muted-foreground">{connection.providerName}</span>
                  <span className={connection.active ? "ml-1 break-words text-primary" : "ml-1 break-words text-destructive"}>
                    {connection.active ? "Active" : "Paused"}
                  </span>
                  <span className="ml-1 break-all text-muted-foreground">{connection.templateKey || "generic-json"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Detected delivery environment:</span>
          <Badge
            variant="secondary"
            className={envGuess === "TEST" ? "bg-accent/70 text-accent-foreground" : envGuess === "LIVE" ? "bg-primary/15 text-foreground" : "bg-muted text-foreground"}
          >
            {envGuess}
          </Badge>
          {hostname ? (
            <span className="break-all text-[11px] text-muted-foreground">Host: {hostname}</span>
          ) : null}
        </div>

        {showRiskWarning ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-accent/60 px-3 py-2 shadow-sm">
            <p className="break-words text-[11px] text-foreground">
              Warning: this looks like a production host, but the delivery URL/key looks like test or sandbox credentials.
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
          <label className="text-xs font-medium">Delivery Account Key</label>
          <Input
            value={providerKey}
            onChange={(e) => setProviderKey(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="primary"
          />
          <p className="break-words text-[11px] text-muted-foreground">
            Use short keys like primary, backup, mtn-main. Network delivery rules use this key.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Delivery Account Name</label>
          <Input
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="Primary Provider"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Order API URL</label>
          <Input
            value={providerOrderUrl}
            onChange={(e) => setProviderOrderUrl(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder="https://provider.example.com/orders"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">API Token / Secret</label>
          <Input
            type="password"
            value={providerApiKey}
            onChange={(e) => setProviderApiKey(e.target.value)}
            disabled={loading || saving}
            className="text-xs"
            placeholder={hasApiKey ? "Leave blank to keep saved key" : "Enter API token or secret"}
          />
          <p className="break-words text-[11px] text-muted-foreground">
            {hasApiKey ? "An API token is already saved on the server." : "No API token saved yet."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="break-words">{updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : "Not configured yet"}</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">API Type</label>
          <select
            value={templateKey}
            onChange={(e) => {
              const nextTemplateKey = e.target.value
              setTemplateKey(nextTemplateKey)
              if (PROVIDER_PRESETS[nextTemplateKey]) {
                applyProviderPreset(nextTemplateKey)
              }
            }}
            disabled={loading || saving}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(templates.length > 0 ? templates : [{ templateKey: "generic-json", name: "Generic JSON Provider", description: null, authType: "BEARER" }]).map((template) => (
              <option key={template.templateKey} value={template.templateKey}>
                {template.name} ({template.authType})
              </option>
            ))}
          </select>
          <p className="break-words text-[11px] text-muted-foreground">
            The API type tells TechDalt how to authenticate, send orders, and read responses.
          </p>
          {templateKey === "skplug" ? (
            <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] text-primary shadow-sm">
              SKDataPlug only needs your API token here. This preset sends orders to /api/v1/order/ with recipient, network, and gb_size.
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Delivery Account Status</label>
          <div className="grid grid-cols-2 rounded-md border border-border bg-muted/30 p-1">
            <button
              type="button"
              disabled={loading || saving}
              onClick={() => setActive(true)}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Active
            </button>
            <button
              type="button"
              disabled={loading || saving}
              onClick={() => setActive(false)}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition ${!active ? "bg-destructive text-destructive-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Paused
            </button>
          </div>
          <p className="break-words text-[11px] text-muted-foreground">
            Paused delivery accounts are skipped when orders are sent automatically.
          </p>
        </div>

        <Button onClick={saveConnection} disabled={loading || saving} className="w-full text-xs sm:w-auto">
          {saving ? "Saving..." : "Save Delivery Account"}
        </Button>
      </CardContent>
    </Card>
  )
}

