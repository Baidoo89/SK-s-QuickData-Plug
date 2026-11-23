import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { ShareLinksCard } from "@/components/storefront/share-links-card"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { getOrCreateAgentStorefrontLink } from "@/lib/storefront-links"

export default async function AgentStorefrontsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved agent account to view shop links." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      role: true,
      organizationId: true,
      agentId: true,
      name: true,
      email: true,
      organization: { select: { slug: true } },
    },
  })

  if (!user || user.role !== "AGENT" || !user.organizationId || !user.organization?.slug) {
    return <PortalAccessMessage title="Shop link unavailable" description="This agent account is not fully linked to a business shop. Ask the business owner to complete setup." />
  }

  let agentId = user.agentId
  let agentName = user.name || user.email || "Agent Store"
  if (!agentId) {
    const candidates = await db.agent.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, user: { select: { id: true } } },
      take: 2,
    })

    if (candidates.length === 1) {
      const candidate = candidates[0]
      // Read-only fallback: do not auto-write user.agentId here to avoid unique conflicts.
      if (!candidate.user || candidate.user.id === user.id) {
        agentId = candidate.id
        agentName = candidate.name
      }
    }
  }

  if (agentId) {
    const agent = await db.agent.findFirst({
      where: { id: agentId, organizationId: user.organizationId },
      select: { name: true },
    })
    agentName = agent?.name || agentName
  }

  const [agentOrderCount, pendingResellerApprovals] = agentId
    ? await Promise.all([
        db.order.count({ where: { organizationId: user.organizationId, agentId } }),
        db.user.count({ where: { organizationId: user.organizationId, role: "RESELLER", parentAgentId: agentId, signupStatus: "PENDING" } }),
      ])
    : [0, 0]

  const agentStorePath = agentId
    ? await getOrCreateAgentStorefrontLink({
        organizationId: user.organizationId,
        organizationSlug: user.organization.slug,
        agentId,
        agentName,
      })
    : null

  const storefrontLinks = [
    ...(agentStorePath
      ? [
          {
            label: "Customer shop",
            path: agentStorePath,
          },
          {
            label: "Reseller invite",
            path: `/register/reseller?agentId=${agentId}`,
          },
        ]
      : []),
  ]

  return (
    <div className="portal-page mx-auto w-full max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Shop links</h1>
        <p className="mt-1 text-sm text-muted-foreground">Share your shop or invite resellers.</p>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:max-w-md sm:gap-3">
        <Card className="premium-surface border-0">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Link orders</p>
            <p className="mt-1 text-xl font-bold">{agentOrderCount}</p>
          </CardContent>
        </Card>
        <Card className="premium-surface border-0">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pending invites</p>
            <p className="mt-1 text-xl font-bold">{pendingResellerApprovals}</p>
          </CardContent>
        </Card>
      </div>

      <ShareLinksCard
        title="Links"
        links={storefrontLinks}
      />

    </div>
  )
}
