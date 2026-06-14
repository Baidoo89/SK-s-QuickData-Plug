import Link from "next/link"
import { BadgeCheck, ShieldCheck, ShoppingCart, Users, Wallet } from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { Badge } from "@/components/ui/badge"
import { getOrCreateAgentStorefrontLink } from "@/lib/storefront-links"
import { PhoneVerificationCard } from "@/components/auth/phone-verification-card"

export default async function AgentAccountPage() {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved agent account to manage your profile." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      signupStatus: true,
      phoneNumber: true,
      phoneVerified: true,
      createdAt: true,
      organizationId: true,
      agentId: true,
      organization: { select: { name: true, slug: true } },
      agent: { select: { id: true, name: true, active: true, commissionPercent: true, createdAt: true } },
    },
  })

  if (!user || user.role !== "AGENT" || !user.organizationId) {
    return <PortalAccessMessage title="Agent profile unavailable" description="This account is not linked to an approved agent profile. Ask the business owner to review the account." />
  }

  const agentId = user.agentId ?? user.agent?.id ?? null
  const [walletAgg, orderCount, resellerCount, pendingResellers] = await Promise.all([
    db.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, status: "success" },
    }),
    agentId ? db.order.count({ where: { organizationId: user.organizationId, agentId } }) : Promise.resolve(0),
    agentId ? db.user.count({ where: { organizationId: user.organizationId, parentAgentId: agentId, role: "RESELLER" } }) : Promise.resolve(0),
    agentId ? db.user.count({ where: { organizationId: user.organizationId, parentAgentId: agentId, role: "RESELLER", signupStatus: "PENDING" } }) : Promise.resolve(0),
  ])

  const walletBalance = walletAgg._sum.amount ?? 0
  const joined = new Date(user.createdAt).toLocaleDateString()
  const storefrontPath = user.organization?.slug && agentId
    ? await getOrCreateAgentStorefrontLink({
        organizationId: user.organizationId,
        organizationSlug: user.organization.slug,
        agentId,
        agentName: user.agent?.name || user.name || user.email || "Agent Store",
      })
    : null
  const isActive = user.active && user.signupStatus === "APPROVED" && (user.agent?.active ?? true)

  return (
    <div className="portal-page mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Account</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Your profile, business, wallet, and access.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/reset">Change password</Link>
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Wallet Balance" value={formatGhanaCedis(walletBalance)} description="Successful wallet transactions" icon={Wallet} tone="success" />
        <MetricCard label="Orders" value={orderCount} description="Orders attributed to your agent link" icon={ShoppingCart} tone="info" />
        <MetricCard label="Resellers" value={resellerCount} description={`${pendingResellers} pending approval`} icon={Users} tone={pendingResellers > 0 ? "warning" : "primary"} />
        <MetricCard label="Access" value={isActive ? "Active" : "Restricted"} description={`Signup status: ${user.signupStatus}`} icon={ShieldCheck} tone={isActive ? "success" : "warning"} />
      </div>

      <PhoneVerificationCard initialPhoneNumber={user.phoneNumber} verified={Boolean(user.phoneVerified)} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="premium-surface border-0">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Profile</CardTitle>
            <CardDescription className="text-xs">Basic information about your agent account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{user.name ?? user.agent?.name ?? "Unnamed agent"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Email</span>
              <span className="break-all text-right font-medium">{user.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={isActive ? "secondary" : "outline"} className={isActive ? "status-success border" : "status-warning border"}>
                <BadgeCheck className="mr-1 h-3 w-3" />
                {isActive ? "Active" : user.signupStatus}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Joined</span>
              <span className="font-medium">{joined}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-surface border-0">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Business Access</CardTitle>
            <CardDescription className="text-xs">Where this account works.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Business</span>
              <span className="font-medium">{user.organization?.name ?? "Not linked"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Commission</span>
              <span className="font-medium">{user.agent?.commissionPercent ?? 0}%</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Shop link</span>
              <p className="break-all font-mono text-xs">{storefrontPath ?? "Not available yet"}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/agent/storefronts">View shop links</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
