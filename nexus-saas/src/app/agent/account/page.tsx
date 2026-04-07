"use client"

import { useEffect, useState } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface SessionUser {
  name?: string | null
  email?: string | null
  role?: string | null
}

export default function AgentAccountPage() {
  const [user, setUser] = useState<SessionUser | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/auth/session")
        if (!res.ok) return
        const data = await res.json()
        setUser(data?.user ?? null)
      } catch {
        // ignore for now
      }
    }
    load()
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile details, password and notification preferences.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Profile</CardTitle>
            <CardDescription className="text-xs">
              Basic information about your agent account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground text-xs">Name:</span> {user?.name ?? "-"}</p>
            <p><span className="text-muted-foreground text-xs">Email:</span> {user?.email ?? "-"}</p>
            <p><span className="text-muted-foreground text-xs">Role:</span> {user?.role ?? "AGENT"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Security</CardTitle>
            <CardDescription className="text-xs">
              Change your password or sign out of all devices.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Button asChild size="sm" variant="outline" className="w-full text-xs sm:w-fit">
              <a href="/reset">Change password</a>
            </Button>
            <p className="text-[11px] text-muted-foreground">
              The password change flow is shared with the main site. In a later phase we can add agent-specific security controls here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
