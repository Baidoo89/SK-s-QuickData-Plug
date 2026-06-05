"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

export function PhoneVerificationCard({
  initialPhoneNumber,
  verified,
}: {
  initialPhoneNumber?: string | null
  verified: boolean
}) {
  const { toast } = useToast()
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber || "")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(verified)

  const requestCode = async () => {
    setIsSending(true)
    try {
      const response = await fetch("/api/auth/phone/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error?.message || "Could not send verification code")
      setCodeSent(true)
      setIsVerified(false)
      toast({ title: "Code sent", description: "Enter the verification code to confirm your phone number." })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not send code",
        description: error instanceof Error ? error.message : "Try again later.",
      })
    } finally {
      setIsSending(false)
    }
  }

  const verifyCode = async () => {
    setIsVerifying(true)
    try {
      const response = await fetch("/api/auth/phone/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error?.message || "Could not verify code")
      setIsVerified(true)
      setCodeSent(false)
      setCode("")
      toast({ title: "Phone verified", description: "Your phone number has been confirmed." })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Try again later.",
      })
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Phone Verification
        </CardTitle>
        <CardDescription className="text-xs">
          Confirm a phone number for account recovery and security notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isVerified ? (
          <div className="status-success flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Phone number verified.
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            type="tel"
            value={phoneNumber}
            onChange={(event) => {
              setPhoneNumber(event.target.value)
              setIsVerified(false)
            }}
            placeholder="0240000000"
            inputMode="tel"
          />
          <Button type="button" variant="outline" onClick={requestCode} disabled={isSending || !phoneNumber.trim()}>
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send Code
          </Button>
        </div>
        {codeSent ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
            />
            <Button type="button" onClick={verifyCode} disabled={isVerifying || code.length < 6}>
              {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          In development, the code is printed in the server console until an SMS provider is connected.
        </p>
      </CardContent>
    </Card>
  )
}
