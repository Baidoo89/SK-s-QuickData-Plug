import { db } from "@/lib/db"

export type ResellerPricingProfileContext = {
  pricingProfileId: string | null
  strictPricing: boolean
  profilePriceMap: Map<string, number>
}

export async function getResellerPricingProfileContext(
  organizationId: string,
  resellerId: string
): Promise<ResellerPricingProfileContext> {
  const assignment = await db.userPricingProfileAssignment.findFirst({
    where: { organizationId, userId: resellerId },
    select: {
      pricingProfileId: true,
      strictPricing: true,
      pricingProfile: {
        select: {
          items: {
            select: {
              productId: true,
              price: true,
            },
          },
        },
      },
    },
  })

  return {
    pricingProfileId: assignment?.pricingProfileId ?? null,
    strictPricing: Boolean(assignment?.strictPricing),
    profilePriceMap: new Map(
      assignment?.pricingProfile.items.map((item) => [item.productId, item.price]) ?? []
    ),
  }
}

export function resolveResellerBuyPrice(input: {
  overridePrice?: number | null
  profilePrice?: number | null
  parentCost: number
  strictPricing?: boolean
}) {
  if (input.strictPricing) {
    return typeof input.profilePrice === "number" ? input.profilePrice : null
  }

  if (typeof input.overridePrice === "number") return input.overridePrice
  if (typeof input.profilePrice === "number") return input.profilePrice
  return input.parentCost
}
