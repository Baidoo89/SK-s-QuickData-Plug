import { db } from "@/lib/db"
import { requireAuth, hasRole, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  TELECEL: ["020", "050"],
}

function normalizeNumber(input: string): string {
  return input.replace(/\D/g, "")
}

function numberBelongsToProvider(digits: string, provider: string): boolean {
  const prefixes = NETWORK_PREFIXES[provider.toUpperCase()] || []
  if (prefixes.length === 0) return true
  const prefix = digits.slice(0, 3)
  return prefixes.includes(prefix)
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const user = authResult.user

    // Only AGENT and RESELLER can place VTU orders
    if (!hasRole(user, "AGENT") && !hasRole(user, "RESELLER")) {
      return ApiErrors.FORBIDDEN()
    }

    const body = await req.json().catch(() => null)
    const { productId, quantity = 1, phoneNumber } = (body || {}) as {
      productId?: string
      quantity?: number
      phoneNumber?: string
    }

    if (!productId) {
      return ApiErrors.BAD_REQUEST("Product ID required")
    }
    if (!phoneNumber) {
      return ApiErrors.BAD_REQUEST("Phone number required")
    }

    const normalizedPhone = normalizeNumber(phoneNumber)
    if (normalizedPhone.length !== 10) {
      return ApiErrors.BAD_REQUEST("Phone number must be 10 digits")
    }

    if (!user.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = user.organizationId

    // Fetch full user record including agent/parent agent IDs
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, agentId: true, parentAgentId: true },
    })

    if (!fullUser) {
      return ApiErrors.NOT_FOUND("User")
    }

    const organization = await db.organization.findUnique({ where: { id: organizationId } })
    if (!organization || !organization.active) {
      return ApiErrors.FORBIDDEN()
    }

    const product = await db.product.findFirst({
      where: { id: productId, organizationId, active: true },
    })

    if (!product) {
      return ApiErrors.NOT_FOUND("Product")
    }

    if (!numberBelongsToProvider(normalizedPhone, product.provider)) {
      return ApiErrors.BAD_REQUEST("Phone number does not match selected network")
    }

    // Resolve pricing similar to /api/store/order: base price per org, then optional agent override
    const basePriceRecord = await db.basePrice.findUnique({
      where: {
        productId_organizationId: {
          productId: product.id,
          organizationId,
        },
      },
    })

    let basePrice = basePriceRecord?.price ?? product.price
    let chargePrice = basePrice

    let resolvedAgentId: string | null = null

    if (fullUser.role === "AGENT") {
      resolvedAgentId = fullUser.agentId ?? null
    } else if (fullUser.role === "RESELLER") {
      resolvedAgentId = fullUser.parentAgentId ?? null
    }

    if (resolvedAgentId) {
      const agent = await db.agent.findFirst({
        where: { id: resolvedAgentId, organizationId, active: true },
      })

      if (!agent) {
        return ApiErrors.NOT_FOUND("Agent")
      }

      const agentPrice = await db.agentPrice.findUnique({
        where: { agentId_productId: { agentId: agent.id, productId: product.id } },
      })

      if (agentPrice) {
        chargePrice = agentPrice.price
      }

      resolvedAgentId = agent.id
    }

    const unitPrice = chargePrice
    const profitPerUnit = unitPrice - basePrice
    const total = unitPrice * quantity

    const order = await db.$transaction(async (tx) => {
      // Check wallet balance for the actor (agent or reseller) before creating the order.
      const balanceAgg = await tx.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { userId: user.id, status: "success" },
      })
      const currentBalance: number = balanceAgg._sum.amount ?? 0

      if (currentBalance < total) {
        throw new Error("INSUFFICIENT_FUNDS")
      }

      const debit = await tx.walletTransaction.create({
        data: {
          userId: user.id,
          performedByEmail: null,
          performedByRole: fullUser.role,
          method: "manual",
          amount: -total,
        },
      })

      let customer = await tx.customer.findFirst({
        where: {
          phone: normalizedPhone,
          organizationId,
        },
      })

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: "Guest Customer",
            email: `${normalizedPhone}@placeholder.com`,
            phone: normalizedPhone,
            organizationId,
          },
        })
      }

      const newOrder = await tx.order.create({
        data: {
          organizationId,
          customerId: customer.id,
          agentId: resolvedAgentId ?? undefined,
          userId: user.id,
          total,
          status: "PENDING",
          phoneNumber: normalizedPhone,
          items: {
            create: {
              productId: product.id,
              quantity,
              price: unitPrice,
              profit: profitPerUnit * quantity,
            },
          },
        },
      })

      return newOrder
    })

    return apiSuccess(order, undefined, 201)
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
      return ApiErrors.BAD_REQUEST("Insufficient wallet balance. Please top up before placing this order.")
    }

    console.error("[VTU_ORDER]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
