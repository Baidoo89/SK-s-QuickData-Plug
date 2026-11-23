"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

type InviteContext = {
  organizationId: string
  organizationName: string
  organizationSlug: string
}

function getRegisterErrorMessage(data: any) {
  if (data?.error?.details && typeof data.error.details === "object") {
    const firstField = Object.keys(data.error.details)[0]
    const firstMessage = firstField ? data.error.details[firstField]?.[0] : null
    if (firstMessage) return firstMessage
  }

  return data?.error?.message || data?.message || "Something went wrong"
}

export default function AgentInviteRegisterClient({ initialTenant }: { initialTenant: string }) {
  const { toast } = useToast()
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(false)
  const [isVerifyingInvite, setIsVerifyingInvite] = useState(true)
  const [inviteContext, setInviteContext] = useState<InviteContext | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    password: "",
  })

  useEffect(() => {
    let cancelled = false

    async function verifyInvite() {
      if (!initialTenant) {
        setInviteError("Missing invite code. Ask the business owner to resend the agent link.")
        setIsVerifyingInvite(false)
        return
      }

      try {
        setIsVerifyingInvite(true)
        const response = await fetch(`/api/register/agent-context?tenant=${encodeURIComponent(initialTenant)}`)
        const payload = await response.json()

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error?.message || "Invalid invite link")
        }

        if (!cancelled) {
          setInviteContext(payload.data as InviteContext)
          setInviteError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setInviteContext(null)
          setInviteError(error instanceof Error ? error.message : "Invalid invite link")
        }
      } finally {
        if (!cancelled) {
          setIsVerifyingInvite(false)
        }
      }
    }

    verifyInvite()

    return () => {
      cancelled = true
    }
  }, [initialTenant])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!inviteContext) {
      setInviteError("This invite link is not valid. Ask the business owner to resend it.")
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType: "AGENT",
          name: formData.name.trim(),
          orgName: inviteContext.organizationSlug,
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
        title: "Agent request submitted",
        description:
          data?.data?.emailDelivery === "FAILED"
            ? "Your request was created, but verification email delivery failed."
            : "Verify your email, then wait for approval.",
      })
      router.push("/register/success?type=AGENT")
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

  const canSubmit = !isLoading && !isVerifyingInvite && !!inviteContext && !inviteError

  return (
    <Card className="premium-surface w-full overflow-hidden rounded-lg backdrop-blur-xl">
      <CardHeader className="space-y-1 border-b border-border/70 bg-muted/20">
        <CardTitle className="text-2xl font-bold">
          {inviteContext ? `Join ${inviteContext.organizationName}` : "Agent invite"}
        </CardTitle>
        <CardDescription>
          {inviteContext ? "Create your agent account." : "Open this page from your invite link."}
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {isVerifyingInvite && (
            <div className="rounded-lg border border-border/70 bg-muted/50 px-3 py-2 text-sm text-muted-foreground shadow-sm">
              Checking invite...
            </div>
          )}

          {inviteContext ? <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">{inviteContext.organizationName} · approval required</div> : null}

          {inviteError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-sm">
              {inviteError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="John Doe"
              required
              value={formData.name}
              onChange={handleChange}
              disabled={!canSubmit}
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
              disabled={!canSubmit}
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
              disabled={!canSubmit}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={formData.password}
                onChange={handleChange}
                disabled={!canSubmit}
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={!canSubmit}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">8+ characters.</p>
          </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full" type="submit" disabled={!canSubmit}>
            {isLoading ? "Submitting..." : "Submit agent request"}
          </Button>
          <div className="text-center text-sm text-muted-foreground"><Link href="/register" className="underline underline-offset-4 hover:text-primary">Create a business</Link><span className="mx-2">·</span><Link href="/login" className="underline underline-offset-4 hover:text-primary">Log in</Link></div>
        </CardFooter>
      </form>
    </Card>
  )
}
