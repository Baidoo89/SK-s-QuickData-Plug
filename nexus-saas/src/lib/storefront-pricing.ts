import crypto from "crypto"
import { db } from "@/lib/db"

type StorefrontPriceRow = {
  productId: string
  price: number
}

export function mapStorefrontPrices(rows: StorefrontPriceRow[]) {
  return new Map(rows.map((row) => [row.productId, Number(row.price)]))
}

export async function getAgentStorefrontPrices(agentId: string, organizationId: string) {
  return db.$queryRaw<StorefrontPriceRow[]>`
    SELECT "productId", "price"
    FROM "AgentStorefrontPrice"
    WHERE "agentId" = ${agentId}
      AND "organizationId" = ${organizationId}
  `
}

export async function getSubscriberStorefrontPrices(organizationId: string) {
  return db.$queryRaw<StorefrontPriceRow[]>`
    SELECT "productId", "price"
    FROM "SubscriberStorefrontPrice"
    WHERE "organizationId" = ${organizationId}
  `
}

export async function getResellerStorefrontPrices(resellerId: string, organizationId: string) {
  return db.$queryRaw<StorefrontPriceRow[]>`
    SELECT "productId", "price"
    FROM "ResellerStorefrontPrice"
    WHERE "resellerId" = ${resellerId}
      AND "organizationId" = ${organizationId}
  `
}

export async function upsertSubscriberStorefrontPrice(input: {
  productId: string
  organizationId: string
  price: number
}) {
  const id = crypto.randomUUID()
  const rows = await db.$queryRaw<Array<{ id: string; price: number; productId: string; organizationId: string }>>`
    INSERT INTO "SubscriberStorefrontPrice" ("id", "price", "productId", "organizationId", "createdAt", "updatedAt")
    VALUES (${id}, ${input.price}, ${input.productId}, ${input.organizationId}, NOW(), NOW())
    ON CONFLICT ("productId", "organizationId")
    DO UPDATE SET "price" = EXCLUDED."price", "updatedAt" = NOW()
    RETURNING "id", "price", "productId", "organizationId"
  `

  return rows[0]
}

export async function upsertAgentStorefrontPrice(input: {
  agentId: string
  productId: string
  organizationId: string
  price: number
}) {
  const id = crypto.randomUUID()
  const rows = await db.$queryRaw<Array<{ id: string; price: number; agentId: string; productId: string; organizationId: string }>>`
    INSERT INTO "AgentStorefrontPrice" ("id", "price", "agentId", "productId", "organizationId", "createdAt", "updatedAt")
    VALUES (${id}, ${input.price}, ${input.agentId}, ${input.productId}, ${input.organizationId}, NOW(), NOW())
    ON CONFLICT ("agentId", "productId")
    DO UPDATE SET "price" = EXCLUDED."price", "updatedAt" = NOW()
    RETURNING "id", "price", "agentId", "productId", "organizationId"
  `

  return rows[0]
}

export async function upsertResellerStorefrontPrice(input: {
  resellerId: string
  productId: string
  organizationId: string
  price: number
}) {
  const id = crypto.randomUUID()
  const rows = await db.$queryRaw<Array<{ id: string; price: number; resellerId: string; productId: string; organizationId: string }>>`
    INSERT INTO "ResellerStorefrontPrice" ("id", "price", "resellerId", "productId", "organizationId", "createdAt", "updatedAt")
    VALUES (${id}, ${input.price}, ${input.resellerId}, ${input.productId}, ${input.organizationId}, NOW(), NOW())
    ON CONFLICT ("resellerId", "productId")
    DO UPDATE SET "price" = EXCLUDED."price", "updatedAt" = NOW()
    RETURNING "id", "price", "resellerId", "productId", "organizationId"
  `

  return rows[0]
}
