import { redirect } from "next/navigation"
import { Code2, KeyRound, PackageSearch, UploadCloud } from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { ApiKeys } from "@/components/dashboard/api-keys"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links"

export default async function ApiDocsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    redirect("/login")
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: {
      organization: {
        include: {
          apiKeys: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  })

  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization, so API credentials cannot be loaded yet." />
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"
  const storePath = user.organization.slug
    ? await getOrCreateSubscriberStorefrontLink({
        organizationId: user.organization.id,
        organizationName: user.organization.name,
        organizationSlug: user.organization.slug,
      })
    : null

  return (
    <div className="flex max-w-5xl flex-col gap-6 px-4 py-6 md:gap-8 md:p-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">API Docs</h1>
        <p className="max-w-2xl text-muted-foreground">
          Integrate programmatic access to your store. Use API keys to authenticate external websites, including subscriber-owned keys and approved agent/reseller keys.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <MetricCard label="API Keys" value={user.organization.apiKeys.length} description="Subscriber and approved seller credentials" icon={KeyRound} tone="primary" />
        <MetricCard label="Store Slug" value={user.organization.slug} description="Tenant context for public APIs" icon={PackageSearch} tone="info" />
        <MetricCard label="Order Tools" value="CSV Ready" description="Export and import fulfillment updates" icon={UploadCloud} tone="success" />
      </div>

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle>Base URL</CardTitle>
          <CardDescription>Your tenant-specific public endpoints.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="break-all rounded-lg border border-border/70 bg-background/80 px-3 py-2 font-mono shadow-sm">
              {storePath ? `${baseUrl}${storePath}` : "Storefront not available yet"}
            </p>
            <p className="mt-1 text-muted-foreground">
              This is your public storefront URL. You can share it with customers or call it from your systems.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold">Example API endpoints</p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>
                <span className="font-mono">GET /api/shop/{"{tenantSlug}"}/products</span> - list available products and bundles.
              </li>
              <li>
                <span className="font-mono">GET /api/shop/{"{tenantSlug}"}/agent/{"{agentId}"}/products</span> - list products with agent pricing.
              </li>
              <li>
                <span className="font-mono">POST /api/v1/orders</span> - create a paid fulfillment order from your backend.
              </li>
              <li>
                <span className="font-mono">GET /api/v1/orders?externalReference=...</span> - check an API order status safely.
              </li>
              <li>
                <span className="font-mono">GET /api/dashboard/orders/manual/export</span> - export manual fulfillment CSV from the dashboard portal.
              </li>
              <li>
                <span className="font-mono">POST /api/dashboard/orders/manual/import</span> - import manual processing results with orderId and status.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Example Product Request
          </CardTitle>
          <CardDescription>Use this pattern from your backend or a trusted integration.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="table-scroll rounded-lg border border-border/70 bg-background/80 p-3 text-xs shadow-sm">
{`curl "${baseUrl}/api/shop/${user.organization.slug}/products"`}
          </pre>
        </CardContent>
      </Card>

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Example API Order
          </CardTitle>
          <CardDescription>
            Use this only from a trusted backend after your website has collected payment with your own Paystack or payment flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="table-scroll rounded-lg border border-border/70 bg-background/80 p-3 text-xs shadow-sm">
{`curl -X POST "${baseUrl}/api/v1/orders" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "productId": "PRODUCT_ID",
    "phoneNumber": "0240000000",
    "quantity": 1,
    "customerName": "Customer Name",
    "customerEmail": "customer@example.com",
    "externalReference": "website-order-1001",
    "callbackUrl": "https://your-site.com/nexus-order-webhook",
    "amountPaid": 99
  }'`}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Use a unique externalReference from your website. Retrying with the same reference returns the same order instead of creating a duplicate.
            Agent and reseller keys are scoped to the key owner, so the same reference can be reused safely by different sellers.
          </p>
        </CardContent>
      </Card>

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Example Status Check
          </CardTitle>
          <CardDescription>Use this when your website needs to reconcile an order after a retry or timeout.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="table-scroll rounded-lg border border-border/70 bg-background/80 p-3 text-xs shadow-sm">
{`curl "${baseUrl}/api/v1/orders?externalReference=website-order-1001" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
          </pre>
        </CardContent>
      </Card>

      <ApiKeys apiKeys={user.organization.apiKeys} />
    </div>
  )
}
