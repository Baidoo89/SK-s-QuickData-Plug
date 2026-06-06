"use client"

import { useEffect, useState } from "react"
import { Copy, KeyRound, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"

type ApiAccessState = {
  hasRequest: boolean
  status?: string
  note?: string | null
  issuedApiKey?: string | null
}

export function ApiAccessRequestCard({ roleLabel }: { roleLabel: "Agent" | "Reseller" }) {
  const { toast } = useToast()
  const [state, setState] = useState<ApiAccessState | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function loadStatus() {
    setLoading(true)
    try {
      const res = await fetch("/api/api-access/request")
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error?.message || "Could not load API access status")
      setState(payload.data)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "API access",
        description: error instanceof Error ? error.message : "Could not load API access status",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function requestAccess() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/api-access/request", { method: "POST" })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error?.message || "Could not submit API access request")
      toast({ title: "Request submitted", description: "Your API access request is now pending approval." })
      await loadStatus()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "API access",
        description: error instanceof Error ? error.message : "Could not submit API access request",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function copyKey() {
    if (!state?.issuedApiKey) return
    await navigator.clipboard.writeText(state.issuedApiKey)
    toast({ title: "Copied", description: "API key copied to clipboard." })
  }

  const status = state?.status || "NOT_REQUESTED"

  return (
    <Card className="border border-border bg-card/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />
          External API Access
        </CardTitle>
        <CardDescription className="text-xs">
          Request a seller-scoped API key for your own website. Orders created with this key are attributed to this {roleLabel.toLowerCase()} account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-semibold">{loading ? "Loading" : status.replaceAll("_", " ")}</p>
          </div>
          <Badge variant={status === "APPROVED" ? "secondary" : status === "PENDING" ? "outline" : "default"} className="rounded-md">
            {status === "APPROVED" ? "Approved" : status === "PENDING" ? "Pending" : "Not requested"}
          </Badge>
        </div>

        {state?.note ? <p className="text-xs text-muted-foreground">{state.note}</p> : null}

        {state?.issuedApiKey ? (
          <div className="space-y-2">
            <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
              {state.issuedApiKey}
            </p>
            <Button type="button" size="sm" onClick={copyKey}>
              <Copy className="mr-2 h-4 w-4" />
              Copy API key
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" onClick={requestAccess} disabled={loading || submitting || status === "PENDING"}>
            <Send className="mr-2 h-4 w-4" />
            {status === "PENDING" ? "Request pending" : submitting ? "Submitting..." : "Request API access"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
