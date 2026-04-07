"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AgentStorefrontsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Storefronts</h1>
        <p className="text-sm text-muted-foreground">
          Manage the links your customers use to buy data bundles from you.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Your main storefront</CardTitle>
          <CardDescription className="text-xs">
            We&apos;ll show your primary VTU storefront link and any agent-specific variations here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This section will include copy actions, QR codes, and per-agent tracking links.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recommended setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>Use one primary link for social channels and one tracked link per campaign.</p>
          <p>Check order conversion in your Orders and Resellers pages to monitor performance.</p>
        </CardContent>
      </Card>
    </div>
  )
}
