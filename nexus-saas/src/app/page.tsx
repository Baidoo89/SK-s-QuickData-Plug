import Link from "next/link"
import { ArrowRight, BadgeCheck, CreditCard, Layers3, ShieldCheck, Store, UsersRound, WalletCards } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WhatsAppSupportButton } from "@/components/support/whatsapp-support-button"

const features = [
  {
    title: "Branded shop links",
    description: "Give every subscriber, agent, and reseller a clean customer link for data bundles and service requests.",
    icon: Store,
  },
  {
    title: "Simple team control",
    description: "Manage subscribers, agents, resellers, prices, approvals, customers, and earnings in the right order.",
    icon: UsersRound,
  },
  {
    title: "Subscriber-owned payments",
    description: "Connect each subscriber's own Paystack so customer payments go directly to the business owner.",
    icon: CreditCard,
  },
  {
    title: "Easy order processing",
    description: "Pick pending orders, copy batches, send through API, or process manually when needed.",
    icon: Layers3,
  },
]

const rows = [
  ["MTN 10GB", "0557581711", "Pending", "Manual"],
  ["Telecel 5GB", "0502334421", "Processing", "API"],
  ["AT 2GB", "0274119028", "Paid", "Queue"],
]

const steps = [
  "Create a subscriber workspace and approve the account.",
  "Connect Paystack, products, prices, and shop links.",
  "Invite agents and resellers with controlled pricing.",
  "Receive paid orders and fulfill them from one operations workspace.",
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background pt-16 text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/75 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold text-foreground" aria-label="TechDalt home">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 text-sm font-black text-primary shadow-sm">
              TD
            </span>
            <span className="truncate text-sm sm:text-base">TechDalt</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href="/pricing">Pricing</Link>
            </Button>
            <WhatsAppSupportButton label="WhatsApp" className="hidden h-9 px-3 sm:inline-flex" />
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="border-b border-border/75">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <div className="max-w-2xl space-y-6">
            <Badge variant="outline" className="w-fit rounded-md border-primary/30 bg-primary/10 px-3 py-1 text-primary">
              VTU SaaS for Ghanaian data sellers
            </Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-extrabold leading-tight tracking-normal text-foreground sm:text-5xl lg:text-6xl">
                Run a cleaner data bundle business with TechDalt.
              </h1>
              <p className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
                Manage sellers, agents, resellers, shop links, Paystack payments, wallets, API delivery, and manual order processing from one clean workspace.
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
              <WhatsAppSupportButton label="Talk to TechDalt" className="h-11 px-5" />
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <p className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Owner controlled
              </p>
              <p className="flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-success" />
                Wallet separated
              </p>
              <p className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-warning" />
                Paystack ready
              </p>
            </div>
          </div>

          <div className="premium-surface overflow-hidden rounded-lg">
            <div className="border-b border-border/75 bg-muted/30 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Orders workspace</p>
                  <p className="text-xs text-muted-foreground">Paid customer orders ready to process.</p>
                </div>
                <Badge variant="outline" className="rounded-md border-success/30 bg-success/10 text-success">
                  Live
                </Badge>
              </div>
            </div>
            <div className="grid gap-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Revenue", "GHS 4,280", "Today"],
                  ["Pending", "18", "To pick"],
                  ["API health", "Ready", "SKDataPlug"],
                ].map(([label, value, detail]) => (
                  <div key={label} className="rounded-lg border border-border/70 bg-background/55 p-4">
                    <p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
                    <p className="mt-2 text-xl font-extrabold text-foreground">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-hidden rounded-lg border border-border/75">
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 border-b border-border/75 bg-muted/35 px-4 py-3 text-[11px] font-bold uppercase text-muted-foreground">
                  <span>Bundle</span>
                  <span>Number</span>
                  <span>Status</span>
                  <span>Route</span>
                </div>
                {rows.map(([bundle, phone, status, route]) => (
                  <div key={`${bundle}-${phone}`} className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 border-b border-border/50 px-4 py-3 text-xs last:border-b-0">
                    <span className="font-semibold text-foreground">{bundle}</span>
                    <span className="text-muted-foreground">{phone}</span>
                    <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-primary">{status}</span>
                    <span className="rounded-md border border-border bg-background/70 px-2 py-1 text-muted-foreground">{route}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-success/25 bg-success/10 p-4 text-sm text-success">
                  Customer payments settle through each seller's own Paystack account.
                </div>
                <div className="rounded-lg border border-warning/25 bg-warning/10 p-4 text-sm text-warning">
                  Manual processing keeps orders moving when a provider API is paused.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-bold uppercase text-primary">Built for operator-led launch</p>
          <h2 className="text-3xl font-extrabold tracking-normal">Everything you need to run the platform clearly.</h2>
          <p className="leading-7 text-muted-foreground">
            TechDalt keeps subscription billing separate from seller wallets while giving each business the shop links and order tools needed to sell professionally.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <article key={feature.title} className="premium-surface rounded-lg p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="border-y border-border/75 bg-muted/15">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase text-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-normal">From setup to paid customer orders.</h2>
          </div>
          <div className="grid gap-3">
            {steps.map((step, index) => (
              <div key={step} className="premium-surface flex gap-4 rounded-lg p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-6 text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-normal">Ready to test TechDalt?</h2>
          <p className="mt-2 leading-7 text-muted-foreground">
            Create a workspace, connect payments, configure products, and start with a clean shop link.
          </p>
        </div>
        <Button size="lg" asChild>
          <Link href="/register">Create account</Link>
        </Button>
      </section>
    </main>
  )
}
