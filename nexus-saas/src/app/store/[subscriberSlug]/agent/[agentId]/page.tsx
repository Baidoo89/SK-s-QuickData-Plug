import { notFound, redirect } from "next/navigation"

import { db } from "@/lib/db"
import { getOrCreateAgentStorefrontLink } from "@/lib/storefront-links"

type SearchParams = Record<string, string | string[] | undefined>

function appendSearch(path: string, searchParams?: SearchParams) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item))
    } else if (value) {
      params.set(key, value)
    }
  }

  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export default async function LegacyAgentStorefrontPage({
  params,
  searchParams,
}: {
  params: { subscriberSlug: string; agentId: string }
  searchParams?: SearchParams
}) {
  const organization = await db.organization.findUnique({
    where: { slug: params.subscriberSlug },
    select: { id: true, slug: true },
  })

  if (!organization) return notFound()

  const agent = await db.agent.findFirst({
    where: { id: params.agentId, organizationId: organization.id, active: true },
    select: { id: true, name: true },
  })

  if (!agent) return notFound()

  const path = await getOrCreateAgentStorefrontLink({
    organizationId: organization.id,
    organizationSlug: organization.slug,
    agentId: agent.id,
    agentName: agent.name,
  })

  redirect(appendSearch(path, searchParams))
}
