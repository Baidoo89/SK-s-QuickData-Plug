"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Mail } from "lucide-react"

type SubscriptionStatus = {
  status: "NONE" | "ACTIVE" | "EXPIRED"
  subscription?: {
    status: string
    nextBillingAt: string | null
    plan: {
      id: string
      name: string
      priceGHS: number
      maxProducts: number
      maxAgents: number
    }
    payments?: Array<{
      id: string
      amount: number
      status: string
      paystackRef: string
      paidAt: string | null
      createdAt: string
    }>
  }
}

type PublicPlan = {
  id: string
  name: string
  description: string
  priceGHS: number
  maxProducts: number
  maxAgents: number
  includedSubscribers: number
  features: string[]
  recommended: boolean
}

export default function SubscriptionPage() {
  const { toast } = useToast()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [welcomeMode, setWelcomeMode] = useState(false)

  useEffect(() => {
    async function loadStatus() {
      try {
        const [statusRes, plansRes] = await Promise.all([
          fetch("/api/subscription/status"),
          fetch("/api/plans"),
        ])
        const [statusJson, plansJson] = await Promise.all([statusRes.json(), plansRes.json()])
        setStatus(statusJson?.data ?? statusJson)
        setPlans(plansJson?.data ?? [])
      } catch {
        toast({ variant: "destructive", title: "Could not load subscription plans" })
      } finally {
        setLoading(false)
      }
    }

    loadStatus()
    setWelcomeMode(new URLSearchParams(window.location.search).get("welcome") === "1")
  }, [toast])

  async function startCheckout(planId: string) {
    setCheckingOut(planId)
    try {
      const res = await fetch("/api/paystack/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })
      const json = await res.json()
      const authorizationUrl = json?.data?.authorizationUrl
      const redirectUrl = json?.data?.redirectUrl

      if (!res.ok || (!authorizationUrl && !redirectUrl)) {
        throw new Error(json?.error?.message || "Could not start checkout")
      }

      window.location.href = authorizationUrl || redirectUrl
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: error instanceof Error ? `${error.message} You can also contact support for manual activation.` : "Could not start Paystack checkout. Contact support for manual activation.",
      })
      setCheckingOut(null)
    }
  }

  function contactSupport(planName?: string) {
    const subject = planName ? `Subscription request: ${planName}` : "Subscription activation request"
    window.location.href = `mailto:support@techdalt.com?subject=${encodeURIComponent(subject)}`
  }

  const active = status?.status === "ACTIVE"
  const plan = status?.subscription?.plan
  const payments = status?.subscription?.payments ?? []
  const nextBilling = status?.subscription?.nextBillingAt ? new Date(status.subscription.nextBillingAt) : null
  const daysToRenewal = nextBilling ? Math.ceil((nextBilling.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Subscription</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Your SaaS subscription controls storefront checkout, API ordering, agent sales, and reseller sales.
        </p>
      </div>

      {welcomeMode ? (
        <div className="status-info rounded-md border px-4 py-3 text-sm">
          <p className="font-semibold">Welcome. Your business account is ready.</p>
          <p className="mt-1">
            Choose a plan when you are ready to sell. You can still access setup screens, but checkout, API orders,
            agent sales, reseller sales, and VTU ordering stay blocked until subscription is active.
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              Current Access
              <Badge variant={active ? "secondary" : "destructive"} className={active ? "status-success border" : ""}>
                {loading ? "Loading" : active ? "Active" : "Action required"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {active ? (
              <>
                <p>
                  You are subscribed to <span className="font-semibold text-foreground">{plan?.name ?? "Operator Plan"}</span>.
                </p>
                <p>
                  Next billing:{" "}
                  <span className="font-medium text-foreground">
                    {status?.subscription?.nextBillingAt ? new Date(status.subscription.nextBillingAt).toLocaleDateString() : "Not scheduled"}
                  </span>
                </p>
                <p>
                  Renewal status:{" "}
                  <span className="font-medium text-foreground">
                    {daysToRenewal === null
                      ? "No renewal date set"
                      : daysToRenewal > 1
                        ? `${daysToRenewal} days remaining`
                        : daysToRenewal === 1
                          ? "Renews tomorrow"
                          : "Renewal due today"}
                  </span>
                </p>
                {plan?.id ? (
                  <Button onClick={() => startCheckout(plan.id)} disabled={Boolean(checkingOut)} className="w-full sm:w-auto">
                    {checkingOut === plan.id ? "Opening..." : "Renew current plan"}
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <p>Your organization does not currently have active selling access.</p>
                <p>Choose a plan to pay online, or contact support for manual activation after payment confirmation.</p>
                <Button type="button" variant="outline" onClick={() => contactSupport()} className="w-full sm:w-auto">
                  <Mail className="mr-2 h-4 w-4" />
                  Contact for manual activation
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((planOption) => {
            const current = active && plan?.name === planOption.name
            return (
              <Card key={planOption.id} className={`min-w-0 overflow-hidden ${planOption.recommended ? "border-primary" : ""}`}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    {planOption.name}
                    {planOption.recommended && <Badge variant="secondary">Popular</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-2xl font-bold">GHS {planOption.priceGHS}</div>
                    <p className="text-xs text-muted-foreground">per month</p>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{planOption.description}</p>
                  <div className="grid gap-2 text-xs text-muted-foreground">
                    {planOption.features.map((feature) => (
                      <p key={feature}>{feature}</p>
                    ))}
                  </div>
                  <Button
                    onClick={() => startCheckout(planOption.id)}
                    disabled={Boolean(checkingOut)}
                    className="w-full"
                    variant={planOption.recommended ? "default" : "outline"}
                  >
                    {checkingOut === planOption.id
                      ? "Opening..."
                      : current
                        ? "Renew plan"
                        : active
                          ? "Change plan"
                          : "Choose plan"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => contactSupport(planOption.name)}
                  >
                    Contact support instead
                  </Button>
                </CardContent>
              </Card>
            )
          })}
          {!loading && plans.length === 0 ? (
            <Card className="md:col-span-3">
              <CardContent className="py-8 text-sm text-muted-foreground">
                No SaaS plans are currently available. Contact the platform owner to configure pricing.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscription payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">GHS {payment.amount.toLocaleString()}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{payment.paystackRef}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <Badge variant={payment.status === "SUCCESS" ? "secondary" : "outline"} className={payment.status === "SUCCESS" ? "status-success border" : ""}>
                      {payment.status}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(payment.paidAt ?? payment.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
