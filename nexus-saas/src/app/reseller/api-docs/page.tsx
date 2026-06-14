import { BadgeCheck, Code2, KeyRound, ShoppingCart, Wallet } from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { getOrCreateResellerStorefrontLink } from "@/lib/storefront-links"
import { ApiAccessRequestCard } from "@/components/api-access/api-access-request-card"

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

  const [orderCount, completedOrderCount, walletCount, apiKeyCount] = await Promise.all([
    db.order.count({ where: { organizationId: user.organizationId, userId: user.id } }),
    db.order.count({ where: { organizationId: user.organizationId, userId: user.id, status: "COMPLETED" } }),
    db.walletTransaction.count({ where: { userId: user.id, status: "success" } }),
    db.apiKey.count({ where: { organizationId: user.organizationId, ownerType: "RESELLER", ownerUserId: user.id } }),
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
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Website API</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Connect your own website to TechDalt. Orders created with your approved key stay under your reseller account.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Access" value={active ? "Active" : "Restricted"} description={`Signup status: ${user.signupStatus}`} icon={BadgeCheck} tone={active ? "success" : "warning"} />
        <MetricCard label="Orders" value={orderCount} description={`${completedOrderCount} completed orders`} icon={ShoppingCart} tone="info" />
        <MetricCard label="Wallet Records" value={walletCount} description="Successful wallet movements" icon={Wallet} tone="success" />
        <MetricCard label="API Keys" value={apiKeyCount} description="Approved server keys for your own website" icon={KeyRound} tone="primary" />
      </div>

      <ApiAccessRequestCard roleLabel="Reseller" />

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>Dashboard buys use your login session; external website sales use an approved API key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            You can request API access from your portal. After approval, your key can submit paid orders from your own website while keeping the order under your parent agent and subscriber organization.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Cookie-based auth</Badge>
            <Badge variant="outline">Bearer API key</Badge>
            <Badge variant="outline">Role-scoped access</Badge>
            <Badge variant="outline">Parent-agent scoped</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="premium-surface border-0">
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
            <li><span className="font-medium text-foreground">GET /api/shop/{user.organization?.slug ?? "tenant"}/agent/{user.parentAgentId ?? "agentId"}/products</span> - Fetch products from your parent agent shop.</li>
            <li><span className="font-medium text-foreground">POST /api/v1/orders</span> - Create an external paid order with your approved API key.</li>
            <li><span className="font-medium text-foreground">GET /api/v1/orders?externalReference=...</span> - Check an order created by the same API key.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Example VTU Order
          </CardTitle>
          <CardDescription>Use the same order body that the reseller buy screens submit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <pre className="table-scroll rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
{`{
  "productId": "prod_xxx",
  "phoneNumber": "0244000000",
  "quantity": 1
}`}
          </pre>
          {storePath ? (
            <pre className="table-scroll rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
{`curl "${baseUrl}${storePath}"`}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Example External API Sale
          </CardTitle>
          <CardDescription>Use this from your own backend after your website has collected payment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <pre className="table-scroll rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
{`curl -X POST "${baseUrl}/api/v1/orders" \\
  -H "Authorization: Bearer YOUR_APPROVED_RESELLER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "productId": "PRODUCT_ID",
    "phoneNumber": "0244000000",
    "quantity": 1,
    "externalReference": "reseller-site-1001",
    "amountPaid": 120
  }'`}
          </pre>
          <p>
            The order is tagged as RESELLER, profit is calculated from your buy price, and delivery stays under your parent agent and business.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
