import { notFound, redirect } from "next/navigation"

import { db } from "@/lib/db"
import { getOrCreateResellerStorefrontLink } from "@/lib/storefront-links"

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

export default async function LegacyResellerStorefrontPage({
  params,
  searchParams,
}: {
  params: { subscriberSlug: string; resellerId: string }
  searchParams?: SearchParams
}) {
  const organization = await db.organization.findUnique({
    where: { slug: params.subscriberSlug },
    select: { id: true, slug: true },
  })

  if (!organization) return notFound()

  const reseller = await db.user.findFirst({
    where: {
      id: params.resellerId,
      organizationId: organization.id,
      role: "RESELLER",
      active: true,
      signupStatus: "APPROVED",
    },
    select: { id: true, name: true, email: true, parentAgentId: true },
  })

  if (!reseller?.parentAgentId) return notFound()

  const parentAgent = await db.agent.findFirst({
    where: { id: reseller.parentAgentId, organizationId: organization.id, active: true },
    select: { id: true },
  })

  if (!parentAgent) return notFound()

  const path = await getOrCreateResellerStorefrontLink({
    organizationId: organization.id,
    organizationSlug: organization.slug,
    resellerId: reseller.id,
    resellerName: reseller.name || reseller.email || "Store",
  })

  redirect(appendSearch(path, searchParams))
}
