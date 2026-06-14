import Link from "next/link"
import { Package2, ShieldCheck, WalletCards, Workflow } from "lucide-react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="app-shell-bg relative min-h-screen w-full overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-background/18 backdrop-blur-sm" />
      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl min-w-0 items-center gap-8 lg:grid-cols-[0.9fr_minmax(0,1fr)]">
        <section className="premium-surface hidden h-full min-h-[560px] flex-col justify-between rounded-lg p-8 lg:flex">
          <div className="space-y-8">
            <Link href="/" className="inline-flex items-center gap-3 text-2xl font-extrabold tracking-normal text-primary">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-sm">
                <Package2 className="h-6 w-6" />
              </span>
              TechDalt
            </Link>

            <div className="max-w-md space-y-4">
              <p className="text-xs font-bold uppercase text-info">Data business software</p>
              <h1 className="text-4xl font-extrabold leading-tight text-foreground">
                Sell bundles, manage sellers, and process orders clearly.
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Built for data businesses that need shop links, wallets, payments, and simple order tools.
              </p>
            </div>

            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/50 px-4 py-3 shadow-sm">
                <WalletCards className="h-4 w-4 text-success" />
                <span className="text-muted-foreground">Keep subscriptions and wallets separate</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/50 px-4 py-3 shadow-sm">
                <Workflow className="h-4 w-4 text-info" />
                <span className="text-muted-foreground">Copy, claim, and deliver orders</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/50 px-4 py-3 shadow-sm">
                <ShieldCheck className="h-4 w-4 text-warning" />
                <span className="text-muted-foreground">Give each user the right access</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-border/70 bg-background/40 p-3 shadow-sm">
              <p className="text-lg font-extrabold text-foreground">4</p>
              <p className="text-muted-foreground">Portals</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/40 p-3 shadow-sm">
              <p className="text-lg font-extrabold text-foreground">3</p>
              <p className="text-muted-foreground">Plan tiers</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/40 p-3 shadow-sm">
              <p className="text-lg font-extrabold text-foreground">24/7</p>
              <p className="text-muted-foreground">Order intake</p>
            </div>
          </div>
        </section>

        <section className="flex w-full min-w-0 flex-col items-center justify-center gap-5">
          <Link href="/" className="flex items-center gap-2 self-start text-xl font-extrabold tracking-normal text-primary lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <Package2 className="h-5 w-5" />
            </span>
            TechDalt
          </Link>
          <div className="w-full max-w-xl min-w-0">
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}
