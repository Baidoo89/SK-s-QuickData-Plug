import { BadgeCheck, Code2, KeyRound, ShoppingCart, Wallet } from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { getOrCreateResellerStorefrontLink } from "@/lib/storefront-links"

export default async function ResellerApiDocsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to view integration details." />
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
      organizationId: true,
      parentAgentId: true,
      organization: { select: { slug: true, apiKeys: { select: { id: true } } } },
    },
  })

  if (!user || user.role !== "RESELLER" || !user.organizationId) {
    return <PortalAccessMessage title="Reseller access required" description="This documentation is only available to approved reseller accounts." />
  }

  const [orderCount, completedOrderCount, walletCount] = await Promise.all([
    db.order.count({ where: { organizationId: user.organizationId, userId: user.id } }),
    db.order.count({ where: { organizationId: user.organizationId, userId: user.id, status: "COMPLETED" } }),
    db.walletTransaction.count({ where: { userId: user.id, status: "success" } }),
  ])

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"
  const storePath = user.organization?.slug && user.parentAgentId
    ? await getOrCreateResellerStorefrontLink({
        organizationId: user.organizationId,
        organizationSlug: user.organization.slug,
        resellerId: user.id,
        resellerName: user.name || user.email || "Store",
      })
    : null
  const active = user.active && user.signupStatus === "APPROVED"

  return (
    <div className="portal-page space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">API Docs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Reseller integration guide for wallet-backed VTU ordering. Server-to-server API keys remain organization-managed, so current reseller calls use the normal logged-in session.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Access" value={active ? "Active" : "Restricted"} description={`Signup status: ${user.signupStatus}`} icon={BadgeCheck} tone={active ? "success" : "warning"} />
        <MetricCard label="Orders" value={orderCount} description={`${completedOrderCount} completed orders`} icon={ShoppingCart} tone="info" />
        <MetricCard label="Wallet Records" value={walletCount} description="Successful wallet movements" icon={Wallet} tone="success" />
        <MetricCard label="API Keys" value={user.organization?.apiKeys.length ?? 0} description="Managed by subscriber admin" icon={KeyRound} tone="primary" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>Current reseller integrations use the normal portal session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            API calls made from a browser where you are logged in automatically include the required session cookies.
            Organization-level API keys can be issued by the subscriber admin for trusted backend integrations.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Cookie-based auth</Badge>
            <Badge variant="outline">Role-scoped access</Badge>
            <Badge variant="outline">Wallet debit checks</Badge>
            <Badge variant="outline">Manual fulfillment</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Core Endpoints</CardTitle>
          <CardDescription>These endpoints support reseller sales without bypassing agent/admin governance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-4 text-xs">
            <li><span className="font-medium text-foreground">POST /api/vtu/order</span> - Create a wallet-backed VTU order.</li>
            <li><span className="font-medium text-foreground">GET /api/agent/wallet</span> - Read your own wallet balance and recent credits.</li>
            <li><span className="font-medium text-foreground">GET /api/reseller/orders/export</span> - Export your reseller orders.</li>
            <li><span className="font-medium text-foreground">GET /api/reseller/analytics/export</span> - Export reseller performance analytics.</li>
            <li><span className="font-medium text-foreground">GET /api/shop/{user.organization?.slug ?? "tenant"}/agent/{user.parentAgentId ?? "agentId"}/products</span> - Fetch products in your parent-agent storefront context.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Example VTU Order
          </CardTitle>
          <CardDescription>Use the same order body that the reseller buy screens submit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <pre className="table-scroll rounded-md border bg-muted/50 p-3">
{`{
  "productId": "prod_xxx",
  "phoneNumber": "0244000000",
  "quantity": 1
}`}
          </pre>
          {storePath ? (
            <pre className="table-scroll rounded-md border bg-muted/50 p-3">
{`curl "${baseUrl}${storePath}"`}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
