import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getOrCreateAgentStorefrontLink } from "@/lib/storefront-links"

export async function GET(_req: Request, { params }: { params: { agentId: string } }) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      role: true,
      organizationId: true,
      organization: { select: { slug: true } },
    },
  })

  if (!user || user.role !== "SUBSCRIBER" || !user.organizationId || !user.organization?.slug) {
    return NextResponse.json({ success: false, error: "Subscriber access required" }, { status: 403 })
  }

  const agent = await db.agent.findFirst({
    where: { id: params.agentId, organizationId: user.organizationId },
    select: { id: true, name: true },
  })

  if (!agent) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 })
  }

  const path = await getOrCreateAgentStorefrontLink({
    organizationId: user.organizationId,
    organizationSlug: user.organization.slug,
    agentId: agent.id,
    agentName: agent.name,
  })

  return NextResponse.json({ success: true, data: { path } })
}
