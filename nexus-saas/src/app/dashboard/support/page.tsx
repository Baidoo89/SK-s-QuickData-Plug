import { Mail, MessageSquare, ShieldCheck } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DashboardSupportPage() {
  const supportEmail = "support@techdalt.com"
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent("Techdalt support request")}`

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Help desk</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Support</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Get help with subscriptions, storefront setup, Paystack connection, wallet activity, orders, agents, and resellers.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
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
            <Button asChild className="w-full">
              <a href={mailto}>Open Email</a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-primary" />
              What To Include
            </CardTitle>
            <CardDescription className="text-xs">
              Clear details help support resolve issues faster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Organization name or storefront link.</p>
            <p>Order ID, phone number, or Paystack reference if payment/order related.</p>
            <p>A short description of what happened and what you expected.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security Note
            </CardTitle>
            <CardDescription className="text-xs">
              Keep credentials and customer funds safe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Do not send passwords, secret keys, or full Paystack secret keys.</p>
            <p>Only share references, screenshots, and masked identifiers when possible.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
