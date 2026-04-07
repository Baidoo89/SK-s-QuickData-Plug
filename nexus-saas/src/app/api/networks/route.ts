import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId

    // Get unique providers from active products in this organization
    const products = await db.product.findMany({
      where: {
        organizationId,
        active: true,
        category: "DATA_BUNDLE",
      },
      distinct: ["provider"],
      select: {
        provider: true,
      },
    })

    // Map providers to network names
    const providerNames: Record<string, string> = {
      MTN: "MTN",
      AIRTELTIGO: "AirtelTigo",
      TELECEL: "Telecel",
    }

    const networks = products
      .map((p) => ({
        id: p.provider,
        name: providerNames[p.provider] || p.provider,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return apiSuccess(networks)
  } catch (error) {
    console.error("[NETWORKS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
