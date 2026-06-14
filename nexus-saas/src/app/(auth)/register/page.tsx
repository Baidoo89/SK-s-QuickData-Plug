"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Building2, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react"

function getRegisterErrorMessage(data: any) {
  if (data?.error?.details && typeof data.error.details === "object") {
    const firstField = Object.keys(data.error.details)[0]
    const firstMessage = firstField ? data.error.details[firstField]?.[0] : null
    if (firstMessage) return firstMessage
  }

  return data?.error?.message || data?.message || "Something went wrong"
}

export default function RegisterPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    orgName: "",
    email: "",
    phoneNumber: "",
    password: "",
  })
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const agentId = params.get("agentId")
    const tenant = params.get("tenant")
    if (agentId) {
      router.replace(`/register/reseller?agentId=${encodeURIComponent(agentId)}`)
      return
    }
    if (tenant) {
      router.replace(`/register/agent?tenant=${encodeURIComponent(tenant)}`)
    }
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountType: "SUBSCRIBER",
          name: formData.name.trim(),
          orgName: formData.orgName.trim(),
          email: formData.email.trim().toLowerCase(),
          phoneNumber: formData.phoneNumber.trim() || undefined,
          password: formData.password,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(getRegisterErrorMessage(data))
      }

      toast({
        title: "Account created",
        description:
          data?.data?.emailDelivery === "FAILED"
            ? "Your account was created, but the verification email could not be delivered yet."
            : "Check your email to verify your account before signing in.",
      })
      router.push("/register/success?type=SUBSCRIBER")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="premium-surface min-w-0 w-full overflow-hidden rounded-lg backdrop-blur-xl">
        <CardHeader className="space-y-1 border-b border-border/70 bg-muted/20">
          <CardTitle className="text-2xl font-bold">Create your business account</CardTitle>
          <CardDescription>
            Start your own TechDalt business. You can add agents and resellers later.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground shadow-sm">
              <p className="flex items-center gap-2 font-semibold">
                <Building2 className="h-4 w-4 text-primary" />
                New business account
              </p>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <p className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Own business setup
                </p>
                <p className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Connect your own Paystack
                </p>
                <p className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Invite agents and resellers later
                </p>
              </div>
            </div>

            <div className="flex gap-3 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info-foreground shadow-sm">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>Joining another seller? Use their invite link. This form creates your own business.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                required
                value={formData.name}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgName">Business Name</Label>
              <Input
                id="orgName"
                placeholder="Acme Data Services"
                required
                value={formData.orgName}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

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
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="0240000000"
                autoComplete="tel"
                inputMode="tel"
                value={formData.phoneNumber}
                onChange={handleChange}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Optional for now. Email verification is required before login.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
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
              <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-primary">
                Log in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
  )
}
