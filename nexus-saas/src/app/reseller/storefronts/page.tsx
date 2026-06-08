import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShareLinksCard } from "@/components/storefront/share-links-card"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { getOrCreateResellerStorefrontLink } from "@/lib/storefront-links"

export default async function ResellerStorefrontsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to view storefront links." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      role: true,
      organizationId: true,
      parentAgentId: true,
      name: true,
      email: true,
      organization: { select: { name: true, slug: true } },
    },
  })

  if (!user || user.role !== "RESELLER" || !user.organizationId || !user.organization?.slug) {
    return <PortalAccessMessage title="Storefront unavailable" description="This reseller account is not fully linked to an organization storefront. Ask your agent or subscriber admin to complete setup." />
  }

  const resellerOrderCount = await db.order.count({
    where: { organizationId: user.organizationId, userId: user.id },
  })

  const resellerCompletedOrderCount = await db.order.count({
    where: { organizationId: user.organizationId, userId: user.id, status: "COMPLETED" },
  })

  const resellerStorePath = await getOrCreateResellerStorefrontLink({
    organizationId: user.organizationId,
    organizationSlug: user.organization.slug,
    resellerId: user.id,
    resellerName: user.name || user.email || "Store",
  })

  const storefrontLinks = [
    {
      label: "Your customer storefront",
      path: resellerStorePath,
      description: user.parentAgentId
        ? "Share this link with customers. Your own customer prices and profit tracking are applied here."
        : "Your customer storefront needs parent-agent linkage before it can be shared confidently.",
    },
  ]

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Storefronts</h1>
        <p className="text-sm text-muted-foreground">
          Share clean customer links like techdalt.com/shop/your-name and track how your reseller orders are performing.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <Card className="premium-surface border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{user.organization.name}</p>
          </CardContent>
        </Card>
        <Card className="premium-surface border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{resellerOrderCount}</p>
          </CardContent>
        </Card>
        <Card className="premium-surface border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{resellerCompletedOrderCount}</p>
          </CardContent>
        </Card>
      </div>

      <ShareLinksCard
        title="Shareable storefront links"
        description="Customers only see your clean storefront handle. Technical API URLs stay in API Docs."
        links={storefrontLinks}
      />

    </div>
  )
}
