import { z } from "zod"

import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { normalizeProviderKey } from "@/lib/provider-connection"
import { listStoredProviderConnections } from "@/lib/provider-connection"

export const dynamic = "force-dynamic"

const updateMappingSchema = z.object({
  providerKey: z.string().optional().default("primary"),
  productId: z.string().min(1),
  externalProductCode: z.string().optional().default(""),
  notes: z.string().optional().default(""),
})

type MappingRow = {
  productId: string
  externalProductCode: string
  notes: string | null
}

function toBundleSizeMb(name: string) {
  const match = name.match(/\b(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)\b/i)
  if (!match) return Number.POSITIVE_INFINITY
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return Number.POSITIVE_INFINITY
  const unit = match[2].toUpperCase()
  if (unit === "TB") return amount * 1024 * 1024
  if (unit === "GB") return amount * 1024
  if (unit === "MB") return amount
  if (unit === "KB") return amount / 1024
  return Number.POSITIVE_INFINITY
}

export async function GET(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const organizationId = authResult.user.organizationId!
    const providerKey = normalizeProviderKey(new URL(req.url).searchParams.get("providerKey") || "primary")

    const [products, mappings, connections] = await Promise.all([
      db.product.findMany({
        where: {
          organizationId,
          active: true,
          category: "DATA_BUNDLE",
        },
        select: {
          id: true,
          name: true,
          provider: true,
          price: true,
        },
      }),
      db.$queryRaw<MappingRow[]>`
        SELECT "productId", "externalProductCode", "notes"
        FROM "ProviderProductMapping"
        WHERE "organizationId" = ${organizationId}
          AND "providerKey" = ${providerKey}
      `,
      listStoredProviderConnections(organizationId),
    ])

    const mappingByProductId = new Map(mappings.map((mapping) => [mapping.productId, mapping]))
    const rows = products
      .map((product) => {
        const mapping = mappingByProductId.get(product.id)
        return {
          productId: product.id,
          name: product.name,
          network: product.provider,
          price: product.price,
          externalProductCode: mapping?.externalProductCode || "",
          notes: mapping?.notes || "",
        }
      })
      .sort((a, b) => {
        const networkDelta = a.network.localeCompare(b.network)
        if (networkDelta !== 0) return networkDelta
        const sizeDelta = toBundleSizeMb(a.name) - toBundleSizeMb(b.name)
        if (sizeDelta !== 0) return sizeDelta
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      })

    return apiSuccess({
      providerKey,
      rows,
      connections: connections.map((connection) => ({
        providerKey: connection.providerKey,
        providerName: connection.providerName,
        templateKey: connection.templateKey,
        active: connection.active,
      })),
    })
  } catch (error) {
    logApiError("[DASHBOARD_PROVIDER_PRODUCT_MAPPINGS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const body = await req.json().catch(() => null)
    const parsed = updateMappingSchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const organizationId = authResult.user.organizationId!
    const providerKey = normalizeProviderKey(parsed.data.providerKey)
    const externalProductCode = parsed.data.externalProductCode.trim()
    const notes = parsed.data.notes.trim()

    const product = await db.product.findFirst({
      where: { id: parsed.data.productId, organizationId },
      select: { id: true },
    })

    if (!product) {
      return ApiErrors.NOT_FOUND("Product")
    }

    if (!externalProductCode) {
      await db.$executeRaw`
        DELETE FROM "ProviderProductMapping"
        WHERE "organizationId" = ${organizationId}
          AND "providerKey" = ${providerKey}
          AND "productId" = ${parsed.data.productId}
      `

      return apiSuccess({ providerKey, productId: parsed.data.productId, externalProductCode: "", notes: "" }, "Provider mapping removed")
    }

    await db.$executeRaw`
      INSERT INTO "ProviderProductMapping" (
        "id",
        "organizationId",
        "providerKey",
        "productId",
        "externalProductCode",
        "notes",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${organizationId},
        ${providerKey},
        ${parsed.data.productId},
        ${externalProductCode},
        ${notes || null},
        NOW(),
        NOW()
      )
      ON CONFLICT ("organizationId", "providerKey", "productId") DO UPDATE SET
        "externalProductCode" = EXCLUDED."externalProductCode",
        "notes" = EXCLUDED."notes",
        "updatedAt" = NOW()
    `

    return apiSuccess({ providerKey, productId: parsed.data.productId, externalProductCode, notes }, "Provider mapping saved")
  } catch (error) {
    logApiError("[DASHBOARD_PROVIDER_PRODUCT_MAPPINGS_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
