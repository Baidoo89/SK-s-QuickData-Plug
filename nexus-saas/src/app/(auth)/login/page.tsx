"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isResendingVerification, setIsResendingVerification] = useState(false)
  const [verifyRequiredNotice, setVerifyRequiredNotice] = useState(false)

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setVerifyRequiredNotice(params.get("verify") === "required")
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const normalizedEmail = formData.email.trim().toLowerCase()
      const result = await signIn("credentials", {
        email: normalizedEmail,
        password: formData.password,
        redirect: false,
      })

      if (result?.error) {
        toast({
          variant: "destructive",
          title: "Cannot sign in",
          description: verifyRequiredNotice
            ? "Please verify your email before signing in."
            : "Invalid credentials, unverified email, or account still waiting for approval.",
        })
      } else if (result?.ok) {
        toast({
          title: "Success",
          description: "Logged in successfully",
        })
        // Refresh session and redirect based on role
        router.refresh()
        // Wait a tiny bit for session to update then redirect through tenant-aware landing.
        setTimeout(async () => {
          const landing = await fetch("/api/auth/landing").then((r) => r.json()).catch(() => null)
          router.push(landing?.data?.path || "/dashboard")
        }, 100)
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendVerification = async () => {
    const normalizedEmail = formData.email.trim().toLowerCase()
    if (!normalizedEmail) {
      toast({ variant: "destructive", title: "Email required", description: "Enter your email first." })
      return
    }

    setIsResendingVerification(true)
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error?.message || "Could not send verification email")
      toast({
        title: body?.data?.emailDelivery === "FAILED" ? "Verification token created" : "Check your email",
        description:
          body?.data?.emailDelivery === "FAILED" && body?.data?.devVerificationPath
            ? "Email delivery failed locally. Open /dev/verification to verify this account."
            : "If verification is needed, a new email has been sent.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Could not send verification email",
      })
    } finally {
      setIsResendingVerification(false)
    }
  }

  return (
    <Card className="min-w-0 w-full overflow-hidden border border-border/80 bg-card/95 shadow-xl backdrop-blur-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-center text-2xl font-bold">Sign in to TechDalt</CardTitle>
        <CardDescription className="text-center">
          Access the right portal for your role.
        </CardDescription>
      </CardHeader>
      {verifyRequiredNotice ? (
        <div className="mx-6 mb-4 space-y-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          <p>Check your email and verify your account before signing in.</p>
          <Button type="button" size="sm" variant="outline" className="h-8 bg-background text-xs" onClick={handleResendVerification} disabled={isResendingVerification}>
            {isResendingVerification ? "Sending..." : "Resend verification email"}
          </Button>
        </div>
      ) : null}
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              name="email"
              type="email" 
              placeholder="m@example.com" 
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required 
              value={formData.email}
              onChange={handleChange}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/reset" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="flex flex-col space-y-2">
        <div className="text-sm text-center text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Sign up
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
}
