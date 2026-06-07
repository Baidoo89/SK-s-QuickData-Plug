import { AlertCircle, CreditCard, Mail, MessageSquare, PackageCheck, ShieldCheck, Store } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DashboardSupportPage() {
  const supportEmail = "support@techdalt.com"
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent("Techdalt support request")}`

  return (
    <div className="portal-page space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Help desk</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Support</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Get help with subscriptions, storefront setup, Paystack connection, wallet activity, orders, agents, and resellers.
          </p>
        </div>
        <Card className="premium-surface rounded-lg">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <Mail className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Primary support email</p>
                <p className="break-all text-xs text-muted-foreground">{supportEmail}</p>
              </div>
            </div>
            <Button asChild className="w-full">
              <a href={mailto}>
                <Mail className="mr-2 h-4 w-4" />
                Open Email
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-primary" />
              Email Support
            </CardTitle>
            <CardDescription className="text-xs">
              Use this for account, billing, storefront, and setup issues.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="break-all text-sm font-medium">{supportEmail}</p>
            <Button asChild variant="outline" className="w-full">
              <a href={mailto}>
                <Mail className="mr-2 h-4 w-4" />
                Send Request
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-primary" />
              What To Include
            </CardTitle>
            <CardDescription className="text-xs">
              Clear details help support resolve issues faster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">Organization name or storefront link.</p>
            <p className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">Order ID, phone number, or Paystack reference if payment/order related.</p>
            <p className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">A short description of what happened and what you expected.</p>
          </CardContent>
        </Card>

        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security Note
            </CardTitle>
            <CardDescription className="text-xs">
              Keep credentials and customer funds safe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">Do not send passwords, secret keys, or full Paystack secret keys.</p>
            <p className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">Only share references, screenshots, and masked identifiers when possible.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="h-4 w-4 text-primary" />
            Common Support Areas
          </CardTitle>
          <CardDescription className="text-xs">
            Use these categories when describing the issue so support can route it faster.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Store, title: "Storefront", copy: "Links, branding, checkout, customer payments." },
            { icon: PackageCheck, title: "Orders", copy: "Pending, processing, failed, delivered, API dispatch." },
            { icon: CreditCard, title: "Payments", copy: "Paystack, wallet top-ups, settlement references." },
            { icon: ShieldCheck, title: "Access", copy: "Login, email verification, approvals, roles." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted/50 text-primary">
                  <item.icon className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold">{item.title}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{item.copy}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
