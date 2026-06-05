import { PrismaClient } from "@prisma/client"

import { db } from "@/lib/db"

type DbClient = typeof db | PrismaClient

export function slugifyStorefrontHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

async function uniqueSlug(client: DbClient, base: string) {
  const cleanBase = slugifyStorefrontHandle(base) || "store"
  let candidate = cleanBase
  let suffix = 2

  while (await client.storefrontLink.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${cleanBase}-${suffix}`
    suffix += 1
  }

  return candidate
}

export async function getOrCreateSubscriberStorefrontLink(input: {
  organizationId: string
  organizationName: string
  organizationSlug: string
}) {
  const existing = await db.storefrontLink.findFirst({
    where: { organizationId: input.organizationId, ownerType: "SUBSCRIBER", agentId: null, resellerId: null },
    select: { slug: true },
  })

  if (existing) return `/shop/${existing.slug}`

  const slug = await uniqueSlug(db, input.organizationSlug || input.organizationName)
  const row = await db.storefrontLink.create({
    data: {
      slug,
      organizationId: input.organizationId,
      ownerType: "SUBSCRIBER",
    },
    select: { slug: true },
  })

  return `/shop/${row.slug}`
}

export async function getOrCreateAgentStorefrontLink(input: {
  organizationId: string
  organizationSlug: string
  agentId: string
  agentName: string
}) {
  const existing = await db.storefrontLink.findFirst({
    where: { organizationId: input.organizationId, ownerType: "AGENT", agentId: input.agentId },
    select: { slug: true },
  })

  if (existing) return `/shop/${existing.slug}`

  const slug = await uniqueSlug(db, `${input.agentName || input.organizationSlug}`)
  const row = await db.storefrontLink.create({
    data: {
      slug,
      organizationId: input.organizationId,
      ownerType: "AGENT",
      agentId: input.agentId,
    },
    select: { slug: true },
  })

  return `/shop/${row.slug}`
}

export async function getOrCreateResellerStorefrontLink(input: {
  organizationId: string
  organizationSlug: string
  resellerId: string
  resellerName: string
}) {
  const existing = await db.storefrontLink.findFirst({
    where: { organizationId: input.organizationId, ownerType: "RESELLER", resellerId: input.resellerId },
    select: { slug: true },
  })

  if (existing) return `/shop/${existing.slug}`

  const slug = await uniqueSlug(db, `${input.resellerName || input.organizationSlug}`)
  const row = await db.storefrontLink.create({
    data: {
      slug,
      organizationId: input.organizationId,
      ownerType: "RESELLER",
      resellerId: input.resellerId,
    },
    select: { slug: true },
  })

  return `/shop/${row.slug}`
}
