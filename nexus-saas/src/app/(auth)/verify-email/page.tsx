"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

function VerifyEmailCard() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("Verifying your email address...")

  useEffect(() => {
    let mounted = true

    async function verify() {
      if (!token) {
        setStatus("error")
        setMessage("Verification token is missing.")
        return
      }

      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        const body = await response.json().catch(() => null)

        if (!mounted) return

        if (!response.ok) {
          setStatus("error")
          setMessage(body?.error?.message || body?.message || "Could not verify this email link.")
          return
        }

        setStatus("success")
        setMessage("Your email is verified. You can now sign in.")
      } catch {
        if (!mounted) return
        setStatus("error")
        setMessage("Could not verify your email. Please try again.")
      }
    }

    verify()
    return () => {
      mounted = false
    }
  }, [token])

  const Icon = status === "success" ? CheckCircle2 : status === "error" ? XCircle : Loader2

  return (
    <Card className="premium-surface w-full overflow-hidden rounded-lg backdrop-blur-xl">
      <CardHeader className="border-b border-border/70 bg-muted/20 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-sm">
          <Icon className={status === "loading" ? "h-6 w-6 animate-spin" : "h-6 w-6"} />
        </div>
        <CardTitle>Verify your TechDalt email</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={status === "success" ? "/login" : "/reset"}>
            {status === "success" ? "Go to login" : "Need help signing in?"}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Card className="premium-surface w-full max-w-sm rounded-lg"><CardHeader><CardTitle>Email verification</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card>}>
      <VerifyEmailCard />
    </Suspense>
  )
}
