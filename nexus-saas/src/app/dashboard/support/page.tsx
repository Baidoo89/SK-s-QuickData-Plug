import { AlertCircle, CreditCard, Mail, MessageSquare, PackageCheck, ShieldCheck, Store } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supportEmail } from "@/lib/support-contact"
import { WhatsAppSupportButton } from "@/components/support/whatsapp-support-button"
import { WhatsAppIcon } from "@/components/support/whatsapp-icon"

export default function DashboardSupportPage() {
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent("Techdalt support request")}`

  return (
    <div className="portal-page space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Get help</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Help & Support</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Message TechDalt for subscription help, software development, account setup, payments, orders, agents, and reseller issues.
          </p>
        </div>
        <Card className="premium-surface rounded-lg">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#25D366]/25 bg-[#25D366]/10 text-[#168a43]">
                <WhatsAppIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Fast support on WhatsApp</p>
                <p className="text-xs text-muted-foreground">Subscriptions, setup, software, and urgent help.</p>
              </div>
            </div>
            <WhatsAppSupportButton className="w-full" />
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <WhatsAppIcon className="h-4 w-4 text-[#168a43]" />
              WhatsApp Support
            </CardTitle>
            <CardDescription className="text-xs">
              Best for quick questions, subscription activation, setup guidance, and software work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Send one clear message and include your business name if you already have an account.</p>
            <WhatsAppSupportButton className="w-full" />
          </CardContent>
        </Card>

        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-primary" />
              Email Support
            </CardTitle>
            <CardDescription className="text-xs">
              Use this for account, billing, shop link, and setup issues.
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
            <p className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">Business name or shop link.</p>
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
            { icon: Store, title: "Shop Link", copy: "Links, branding, checkout, customer payments." },
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
