import Link from "next/link"
import { auth } from "@/auth"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function PricingPage() {
  const session = await auth()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="text-xl font-bold text-primary">
            TeChDalt
          </Link>
          <nav className="flex items-center gap-4">
            {session?.user ? (
              <>
                <Link href="/dashboard" className="text-sm hover:text-primary">
                  Dashboard
                </Link>
                <Button variant="outline" size="sm">
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm hover:text-primary">
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

      <main className="container py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Wallet-based pricing
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            No monthly SaaS subscription. Resellers and storefronts simply fund a wallet
            and pay as they go for VTU and other services.
          </p>
        </div>

        <div className="max-w-3xl mx-auto grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>For storefront owners</CardTitle>
              <CardDescription>
                Use your organization dashboard wallet to pay for orders and VTU.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Top up your wallet via Paystack or record manual credits.</p>
              <p>Your spend is exactly what you load; no fixed plans.</p>
              <Button asChild size="sm" className="mt-2">
                <Link href={session?.user ? "/dashboard/wallet" : "/login"}>
                  {session?.user ? "Go to wallet" : "Sign in to view wallet"}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>For resellers & agents</CardTitle>
              <CardDescription>
                Each reseller and agent has their own wallet balance.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Fund wallets via Paystack or receive manual credits from admins.</p>
              <p>Every VTU purchase debits the correct wallet automatically.</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 max-w-2xl mx-auto text-center text-sm text-muted-foreground">
          <p>
            Need a different setup or large-volume arrangement? Reach out to us and we&apos;ll configure
            custom pricing using the same wallet-based flow.
          </p>
        </div>
      </main>
    </div>
  )
}
