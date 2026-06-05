import { notFound, redirect } from "next/navigation"

import { db } from "@/lib/db"
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links"

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

export default async function LegacySubscriberStorefrontPage({
  params,
  searchParams,
}: {
  params: { subscriberSlug: string }
  searchParams?: SearchParams
}) {
  const organization = await db.organization.findUnique({
    where: { slug: params.subscriberSlug },
    select: { id: true, name: true, slug: true },
  })

  if (!organization) return notFound()

  const path = await getOrCreateSubscriberStorefrontLink({
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
  })

  redirect(appendSearch(path, searchParams))
}
