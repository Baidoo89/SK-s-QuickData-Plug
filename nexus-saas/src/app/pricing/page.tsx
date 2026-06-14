import Link from "next/link"
import { auth } from "@/auth"
import { CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { listSaasPlans } from "@/lib/subscription-access"
import { toPublicSaasPlan } from "@/lib/saas-plans"

export const dynamic = "force-dynamic"

export default async function PricingPage() {
  const [session, dbPlans] = await Promise.all([auth(), listSaasPlans()])
  const plans = dbPlans.map((plan) => toPublicSaasPlan(plan))

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="text-xl font-bold text-primary">
            TechDalt
          </Link>
          <nav className="flex items-center gap-4">
            {session?.user ? (
              <>
                <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-primary">
                  Dashboard
                </Link>
                <Button variant="outline" size="sm">
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-primary">
                  Sign in
                </Link>
                <Button size="sm" asChild>
                  <Link href="/register">Get Started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container py-16 md:py-20">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">Pricing</p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
            Choose a plan for your data business
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
            Your plan keeps the software active. Wallet funds are used for data orders.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={`premium-surface relative overflow-hidden rounded-lg ${plan.recommended ? "border-primary shadow-md" : ""}`}>
              {plan.recommended ? (
                <div className="absolute right-4 top-4">
                  <Badge className="bg-primary text-primary-foreground">Recommended</Badge>
                </div>
              ) : null}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div>
                  <p className="text-3xl font-bold text-foreground">GHS {plan.priceGHS}</p>
                  <p>per month</p>
                </div>
                <div className="space-y-2">
                  {plan.features.map((feature) => (
                    <p key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      {feature}
                    </p>
                  ))}
                </div>
                <Button asChild size="sm" variant={plan.recommended ? "default" : "outline"} className="w-full">
                  <Link href={session?.user ? "/dashboard/subscription" : "/register"}>
                    {session?.user ? "Manage plan" : "Get started"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}

          <Card className="premium-surface rounded-lg md:col-span-3">
            <CardHeader>
              <CardTitle>Wallets are separate</CardTitle>
              <CardDescription>
                Subscriptions and order funds are not mixed.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Use wallets for data purchases.</p>
              <p>Use your plan for software access.</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 max-w-2xl mx-auto text-center text-sm text-muted-foreground">
          <p>
            Need help choosing a plan? Contact TechDalt support.
          </p>
        </div>
      </main>
    </div>
  )
}
