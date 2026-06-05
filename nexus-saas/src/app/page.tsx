import Link from "next/link"
import { ArrowRight, BadgeCheck, CreditCard, Layers3, ShieldCheck, Store, UsersRound, WalletCards } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const features = [
  {
    title: "Branded storefronts",
    description: "Give every subscriber, agent, and reseller a clean customer checkout link for data bundles and service requests.",
    icon: Store,
  },
  {
    title: "Agent and reseller hierarchy",
    description: "Keep pricing, approvals, orders, customers, and wallet activity organized under the correct business owner.",
    icon: UsersRound,
  },
  {
    title: "Subscriber-owned payments",
    description: "Connect each subscriber's Paystack so customer collections go directly to the business that owns the storefront.",
    icon: CreditCard,
  },
  {
    title: "Manual fulfillment control",
    description: "Use a clean order workspace for picking, copying, processing, and updating orders across MTN, Telecel, and AirtelTigo.",
    icon: Layers3,
  },
]

const steps = [
  "Create a subscriber workspace and connect Paystack.",
  "Add products, services, base prices, and storefront prices.",
  "Invite agents and resellers with verified signup links.",
  "Receive paid storefront orders and fulfill them from the order workspace.",
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background pt-16 text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-foreground" aria-label="TechDalt home">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground">
              TD
            </span>
            <span>TechDalt</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/pricing">Pricing</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="border-b border-border/70">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:py-16">
          <div className="max-w-2xl space-y-6">
            <Badge variant="outline" className="rounded-md">
              VTU SaaS for Ghanaian data sellers
            </Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                TechDalt
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">
                Launch a branded data bundle storefront, manage subscribers, agents, resellers, wallets, customer payments, and manual fulfillment from one clean SaaS platform.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/register">
                  Start your workspace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <p className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Superadmin controlled
              </p>
              <p className="flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-primary" />
                Wallet separated
              </p>
              <p className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-primary" />
                Paystack ready
              </p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card/95 shadow-2xl shadow-black/20">
            <div className="border-b border-border bg-muted/35 px-5 py-4">
              <p className="text-sm font-semibold text-foreground">Operations snapshot</p>
              <p className="text-xs text-muted-foreground">A practical workspace for storefront orders and reseller activity.</p>
            </div>
            <div className="space-y-4 p-5">
              {[
                ["Storefront payments", "Subscriber Paystack", "Ready"],
                ["Manual order queue", "MTN / Telecel / AT", "Active"],
                ["Agent pricing", "Profiles + overrides", "Controlled"],
                ["Reseller earnings", "Profit withdrawals", "Tracked"],
              ].map(([label, detail, status]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border bg-background/55 p-4">
                  <div>
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                  </div>
                  <span className="h-fit rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Built for operator-led launch</p>
          <h2 className="text-3xl font-bold tracking-tight">Everything a VTU SaaS owner needs to control the platform.</h2>
          <p className="text-muted-foreground">
            TechDalt keeps software billing separate from seller wallets, while giving each business the storefront and operations tools needed to sell professionally.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <article key={feature.title} className="rounded-md border border-border bg-card/90 p-5">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/20">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">From setup to paid customer orders.</h2>
          </div>
          <div className="grid gap-3">
            {steps.map((step, index) => (
              <div key={step} className="flex gap-4 rounded-md border border-border bg-card/90 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight">Ready to test TechDalt?</h2>
          <p className="mt-2 text-muted-foreground">
            Create a workspace, connect payments, configure products, and start with a clean storefront link.
          </p>
        </div>
        <Button size="lg" asChild>
          <Link href="/register">Create account</Link>
        </Button>
      </section>
    </main>
  )
}
