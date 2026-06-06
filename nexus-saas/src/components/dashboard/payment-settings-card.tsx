"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"

type PaymentSettings = {
  paystackPublicKey: string | null
  hasPaystackSecretKey: boolean
  paystackConnected: boolean
  updatedAt: string | null
}

export function PaymentSettingsCard() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [publicKey, setPublicKey] = useState("")
  const [secretKey, setSecretKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const publicKeyLooksValid = publicKey.trim().startsWith("pk_test_") || publicKey.trim().startsWith("pk_live_")
  const secretKeyLooksValid =
    !secretKey.trim() ||
    secretKey.trim().startsWith("sk_test_") ||
    secretKey.trim().startsWith("sk_live_")

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/payment-settings")
        const json = await res.json()
        const data = json?.data ?? json
        setSettings(data)
        setPublicKey(data?.paystackPublicKey ?? "")
      } catch {
        toast({ variant: "destructive", title: "Could not load payment settings" })
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [toast])

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
      setSaving(true)

    try {
      if (!publicKeyLooksValid || !secretKeyLooksValid) {
        throw new Error("Paystack keys should start with pk_test_/pk_live_ and sk_test_/sk_live_.")
      }

      const res = await fetch("/api/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paystackPublicKey: publicKey, paystackSecretKey: secretKey }),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error?.message || "Could not save payment settings")
      }

      const data = json?.data ?? json
      setSettings(data)
      setSecretKey("")
      toast({ title: "Payment settings saved", description: "Storefront payments and wallet top-ups will now settle through this Paystack account." })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save payment settings.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden border border-border bg-card/95 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 break-words">Subscriber Paystack</span>
            </CardTitle>
            <CardDescription className="break-words text-xs">
              Connect your own Paystack account so storefront payments, wallet top-ups, and customer funds settle to your business.
            </CardDescription>
          </div>
          <Badge variant={settings?.paystackConnected ? "secondary" : "destructive"} className={settings?.paystackConnected ? "status-success w-fit border" : "w-fit"}>
            {loading ? "Loading" : settings?.paystackConnected ? "Connected" : "Not connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className={settings?.paystackConnected ? "status-success mb-4 flex min-w-0 gap-3 rounded-md border p-3 text-sm" : "status-warning mb-4 flex min-w-0 gap-3 rounded-md border p-3 text-sm"}>
          {settings?.paystackConnected ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold">{settings?.paystackConnected ? "Paystack is connected" : "Paystack is required for storefront checkout"}</p>
            <p className="break-words">
              {settings?.paystackConnected
                ? `Storefront payments will settle to your Paystack account${settings.updatedAt ? `; last updated ${new Date(settings.updatedAt).toLocaleString()}` : ""}.`
                : "Customers cannot complete storefront payment until both keys are saved."}
            </p>
          </div>
        </div>
        <form onSubmit={saveSettings} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="paystackPublicKey">Paystack public key</Label>
            <Input
              id="paystackPublicKey"
              value={publicKey}
              onChange={(event) => setPublicKey(event.target.value)}
              placeholder="pk_live_..."
              disabled={loading || saving}
              required
            />
            {publicKey && !publicKeyLooksValid ? (
              <p className="break-words text-xs text-destructive">Public key should start with pk_test_ or pk_live_.</p>
            ) : (
              <p className="break-words text-xs text-muted-foreground">Use test keys while testing checkout, then switch to live keys for production.</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="paystackSecretKey">Paystack secret key</Label>
            <Input
              id="paystackSecretKey"
              value={secretKey}
              onChange={(event) => setSecretKey(event.target.value)}
              placeholder={settings?.hasPaystackSecretKey ? "Leave blank to keep saved secret key" : "sk_live_..."}
              disabled={loading || saving}
              type="password"
            />
            {secretKey && !secretKeyLooksValid ? (
              <p className="break-words text-xs text-destructive">Secret key should start with sk_test_ or sk_live_.</p>
            ) : null}
            <p className="break-words text-xs text-muted-foreground">
              The secret key is encrypted before storage. It is used only server-side to initialize and verify storefront and wallet payments.
            </p>
          </div>
          <Button type="submit" disabled={loading || saving} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save Paystack Connection"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
