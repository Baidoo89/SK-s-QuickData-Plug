import { BadgeCheck, Code2, KeyRound, ShoppingCart, Wallet } from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { getOrCreateAgentStorefrontLink } from "@/lib/storefront-links"

export default async function AgentApiDocsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved agent account to view integration details." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      active: true,
      signupStatus: true,
      organizationId: true,
      agentId: true,
      organization: { select: { slug: true, apiKeys: { select: { id: true } } } },
    },
  })

  if (!user || user.role !== "AGENT" || !user.organizationId) {
    return <PortalAccessMessage title="Agent access required" description="This documentation is only available to approved agent accounts." />
  }

  const [orderCount, walletCount, resellerCount] = await Promise.all([
    user.agentId ? db.order.count({ where: { organizationId: user.organizationId, agentId: user.agentId } }) : Promise.resolve(0),
    db.walletTransaction.count({ where: { userId: user.id, status: "success" } }),
    user.agentId ? db.user.count({ where: { organizationId: user.organizationId, role: "RESELLER", parentAgentId: user.agentId } }) : Promise.resolve(0),
  ])

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"
  const agentStorePath = user.organization?.slug && user.agentId
    ? await getOrCreateAgentStorefrontLink({
        organizationId: user.organizationId,
        organizationSlug: user.organization.slug,
        agentId: user.agentId,
        agentName: user.name || user.email || "Agent Store",
      })
    : null
  const active = user.active && user.signupStatus === "APPROVED"

  return (
    <div className="portal-page mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">API Docs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Agent integration guide for creating wallet-backed VTU orders, reading wallet state, and managing reseller operations inside your organization.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Access" value={active ? "Active" : "Restricted"} description={`Signup status: ${user.signupStatus}`} icon={BadgeCheck} tone={active ? "success" : "warning"} />
        <MetricCard label="Agent Orders" value={orderCount} description="Orders attributed to your agent profile" icon={ShoppingCart} tone="info" />
        <MetricCard label="Wallet Records" value={walletCount} description="Successful wallet movements" icon={Wallet} tone="success" />
        <MetricCard label="Resellers" value={resellerCount} description="Accounts under your agent profile" icon={KeyRound} tone="primary" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security Model</CardTitle>
          <CardDescription>Endpoints are protected with authenticated sessions and role guards.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-4 text-xs">
            <li>Only authenticated AGENT and RESELLER users can create VTU orders.</li>
            <li>Requests are organization-scoped; agents cannot place orders for another tenant.</li>
            <li>Wallet balance is validated before order creation and debited transactionally.</li>
            <li>Orders enter the pending manual fulfillment workflow after successful wallet debit.</li>
          </ul>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Session auth</Badge>
            <Badge variant="outline">Role guard</Badge>
            <Badge variant="outline">Org scoped</Badge>
            <Badge variant="outline">Transactional wallet debit</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Core Endpoints</CardTitle>
          <CardDescription>These are the stable operational endpoints your agent portal uses today.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-4 text-xs">
            <li><span className="font-medium text-foreground">POST /api/vtu/order</span> - Create a single wallet-backed VTU order.</li>
            <li><span className="font-medium text-foreground">GET /api/agent/orders</span> - List orders visible to your agent account.</li>
            <li><span className="font-medium text-foreground">GET /api/agent/wallet</span> - Read your wallet balance and recent credits.</li>
            <li><span className="font-medium text-foreground">GET /api/resellers</span> - List resellers owned by the current agent.</li>
            <li><span className="font-medium text-foreground">POST /api/resellers</span> - Create reseller account and invite link.</li>
            <li><span className="font-medium text-foreground">GET /api/shop/{user.organization?.slug ?? "tenant"}/agent/{user.agentId ?? "agentId"}/products</span> - Fetch public products in agent context.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Example VTU Order
          </CardTitle>
          <CardDescription>Use this body from a trusted browser session or internal tool.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <p>Endpoint: <span className="font-mono">POST /api/vtu/order</span></p>
          <pre className="table-scroll rounded-md border bg-muted/50 p-3">
{`{
  "productId": "prod_xxx",
  "phoneNumber": "0244000000",
  "quantity": 1
}`}
          </pre>
          {agentStorePath ? (
            <pre className="table-scroll rounded-md border bg-muted/50 p-3">
{`curl "${baseUrl}${agentStorePath}"`}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
