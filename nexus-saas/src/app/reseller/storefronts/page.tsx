import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { ShareLinksCard } from "@/components/storefront/share-links-card"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { getOrCreateResellerStorefrontLink } from "@/lib/storefront-links"

export default async function ResellerStorefrontsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to view shop links." />
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
      organization: { select: { slug: true } },
    },
  })

  if (!user || user.role !== "RESELLER" || !user.organizationId || !user.organization?.slug) {
    return <PortalAccessMessage title="Shop link unavailable" description="This reseller account is not fully linked to a shop. Ask your agent to complete setup." />
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
      label: "Customer shop",
      path: resellerStorePath,
    },
  ]

  return (
    <div className="portal-page space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Shop link</h1>
        <p className="mt-1 text-sm text-muted-foreground">Share your customer shop.</p>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:max-w-md sm:gap-3">
        <Card className="premium-surface border-0">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Orders</p>
            <p className="mt-1 text-xl font-bold">{resellerOrderCount}</p>
          </CardContent>
        </Card>
        <Card className="premium-surface border-0">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Completed</p>
            <p className="mt-1 text-xl font-bold">{resellerCompletedOrderCount}</p>
          </CardContent>
        </Card>
      </div>

      <ShareLinksCard
        title="Link"
        links={storefrontLinks}
      />

    </div>
  )
}
