import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShareLinksCard } from "@/components/storefront/share-links-card"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { getOrCreateAgentStorefrontLink } from "@/lib/storefront-links"

export default async function AgentStorefrontsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved agent account to view storefront links." />
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
      organization: { select: { name: true, slug: true } },
    },
  })

  if (!user || user.role !== "AGENT" || !user.organizationId || !user.organization?.slug) {
    return <PortalAccessMessage title="Storefront unavailable" description="This agent account is not fully linked to an organization storefront. Ask the subscriber admin to complete setup." />
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
            label: "Your customer storefront",
            path: agentStorePath,
            description: "Share this link with customers. Your own customer prices and profit tracking are applied here.",
          },
          {
            label: "Reseller signup invite",
            path: `/register/reseller?agentId=${agentId}`,
            description: "Invite new resellers directly under your account. The signup page shows your name and organization, with TechDalt as the secure platform.",
          },
        ]
      : []),
  ]

  return (
    <div className="portal-page mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Storefronts</h1>
        <p className="text-sm text-muted-foreground">
          Share clean customer links like techdalt.com/shop/your-name, invite resellers, and monitor storefront activity from one place.
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Orders via agent link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{agentOrderCount}</p>
          </CardContent>
        </Card>
        <Card className="premium-surface border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending reseller approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{pendingResellerApprovals}</p>
          </CardContent>
        </Card>
      </div>

      <ShareLinksCard
        title="Shareable storefront links"
        description="Customers only see clean brand links like techdalt.com/shop/your-name. Technical API URLs stay in API Docs."
        links={storefrontLinks}
      />

    </div>
  )
}
