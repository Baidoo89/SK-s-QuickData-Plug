"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Building2, CheckCircle2, Mail, ShieldCheck, UserRound, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

type AccountType = "SUBSCRIBER" | "AGENT" | "RESELLER"

function getContent(type: AccountType) {
  if (type === "AGENT") {
    return {
      title: "Agent request submitted",
      description: "Verify your email, then wait for the subscriber to approve your agent account.",
      icon: UserRound,
      steps: [
        "Open the verification link sent to your email.",
        "The subscriber reviews your request from their approvals page.",
        "After approval, sign in and use the agent dashboard.",
      ],
    }
  }

  if (type === "RESELLER") {
    return {
      title: "Reseller request submitted",
      description: "Verify your email, then wait for your agent to approve your reseller account.",
      icon: UsersRound,
      steps: [
        "Open the verification link sent to your email.",
        "Your parent agent reviews your request.",
        "After approval, sign in and use the reseller dashboard.",
      ],
    }
  }

  return {
    title: "Business account created",
    description: "Verify your email first. After login, choose a subscription plan before selling.",
    icon: Building2,
    steps: [
      "Open the verification link sent to your email.",
      "Sign in to your dashboard.",
      "Choose a subscription plan, then complete products, Paystack, and storefront setup.",
    ],
  }
}

function SignupSuccessCard() {
  const searchParams = useSearchParams()
  const rawType = searchParams.get("type")
  const type: AccountType = rawType === "AGENT" || rawType === "RESELLER" ? rawType : "SUBSCRIBER"
  const content = getContent(type)
  const Icon = content.icon

  return (
    <Card className="premium-surface w-full overflow-hidden rounded-lg backdrop-blur-xl">
      <CardHeader className="space-y-3 border-b border-border/70 bg-muted/20 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-sm">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <CardTitle className="text-2xl">{content.title}</CardTitle>
          <CardDescription className="mt-2">{content.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="status-info flex gap-3 rounded-md border px-3 py-2 text-sm">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Email verification is required before login. In local development, the link is printed in the dev server console.</p>
        </div>
        <div className="space-y-2">
          {content.steps.map((step, index) => (
            <div key={step} className="flex gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm shadow-sm">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </div>
              <p className="text-muted-foreground">{step}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Subscription is separate from account creation. It unlocks selling; it does not replace wallet funds.</p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 sm:flex-row">
        <Button asChild className="w-full">
          <Link href="/login?verify=required">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Continue to login
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/register">Back to signup</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export default function RegisterSuccessPage() {
  return (
    <Suspense fallback={<Card className="premium-surface w-full max-w-lg rounded-lg"><CardHeader><CardTitle>Account created</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card>}>
      <SignupSuccessCard />
    </Suspense>
  )
}
