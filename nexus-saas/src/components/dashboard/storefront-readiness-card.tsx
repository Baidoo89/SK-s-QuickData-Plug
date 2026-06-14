import Link from "next/link"
import type { ComponentType } from "react"
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Package, Settings, Store } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type ReadinessItem = {
  label: string
  complete: boolean
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
}

type Props = {
  storePath: string | null
  organizationActive: boolean
  subscriptionActive: boolean
  paystackConnected: boolean
  productCount: number
  basePriceCount: number
}

export function StorefrontReadinessCard({
  storePath,
  organizationActive,
  subscriptionActive,
  paystackConnected,
  productCount,
  basePriceCount,
}: Props) {
  const productsReady = productCount > 0
  const pricingReady = basePriceCount > 0
  const ready = Boolean(organizationActive && subscriptionActive && paystackConnected && productsReady && pricingReady)

  const items: ReadinessItem[] = [
    {
      label: "Store active",
      complete: organizationActive,
      description: organizationActive ? "Active." : "Needs reactivation.",
      href: "/dashboard/settings",
      icon: Store,
    },
    {
      label: "Subscription",
      complete: subscriptionActive,
      description: subscriptionActive ? "Active." : "Activate a plan.",
      href: "/dashboard/subscription",
      icon: CreditCard,
    },
    {
      label: "Paystack",
      complete: paystackConnected,
      description: paystackConnected ? "Connected." : "Connect Paystack.",
      href: "/dashboard/settings",
      icon: CreditCard,
    },
    {
      label: "Products",
      complete: productsReady,
      description: productsReady ? `${productCount} active.` : "Add a product.",
      href: "/dashboard/products",
      icon: Package,
    },
    {
      label: "Pricing",
      complete: pricingReady,
      description: pricingReady ? `${basePriceCount} set.` : "Set prices.",
      href: "/dashboard/products",
      icon: Settings,
    },
  ]

  return (
    <Card className="premium-surface min-w-0 overflow-hidden rounded-lg">
      <CardHeader className="border-b border-border/70 bg-muted/20">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-center gap-2">
              {ready ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <AlertCircle className="h-5 w-5 shrink-0 text-warning" />}
              <span className="min-w-0 break-words">Shop setup</span>
            </CardTitle>
            <CardDescription className="break-words">
              Finish these before sharing your shop.
            </CardDescription>
          </div>
          <Badge variant={ready ? "secondary" : "outline"} className={ready ? "status-success w-fit rounded-md border" : "status-warning w-fit rounded-md border"}>
            {ready ? "Ready to sell" : "Checkout blocked"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.label} href={item.href} className="group block min-w-0 rounded-lg border border-border/75 bg-background/55 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/40">
                <div className="flex min-w-0 gap-3">
                  <div className={item.complete ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-success/25 bg-success/10 text-success" : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-warning/25 bg-warning/10 text-warning"}>
                    {item.complete ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                      <span className="min-w-0 break-words">{item.label}</span>
                    </p>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <div className={ready ? "status-success break-words rounded-lg border p-3 text-sm shadow-sm" : "status-warning break-words rounded-lg border p-3 text-sm shadow-sm"}>
          {ready
            ? "Your shop can accept paid orders."
            : "Finish the missing items before sharing your shop."}
        </div>

        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {storePath ? (
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href={storePath} target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open shop
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant={ready ? "secondary" : "default"} className="w-full sm:w-auto">
            <Link href="/dashboard/products">Products</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
