import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

export async function POST(req: Request) {
  try {
    const { productId, quantity = 1, phoneNumber, subscriberSlug, agentId } = await req.json()

    if (!productId) {
      return ApiErrors.BAD_REQUEST("Product ID required")
    }

    if (!phoneNumber) {
      return ApiErrors.BAD_REQUEST("Phone number required")
    }

    if (!subscriberSlug) {
      return ApiErrors.BAD_REQUEST("Subscriber slug required")
    }

    const subscriber = await db.organization.findUnique({
      where: { slug: subscriberSlug },
      include: { subscription: true },
    })

    if (!subscriber) {
      return ApiErrors.NOT_FOUND("Subscriber")
    }

    if (!subscriber.active) {
      return ApiErrors.FORBIDDEN()
    }

    const product = await db.product.findFirst({
      where: { id: productId, organizationId: subscriber.id, active: true },
    })
    
    if (!product) {
      return ApiErrors.NOT_FOUND("Product")
    }
    
    // Resolve pricing: agent override > base price
    // Resolve base price using dynamic client (prisma types may be out-of-date until regenerate)
    const basePriceRecord = await db.basePrice.findUnique({
      where: {
        productId_organizationId: {
          productId: product.id,
          organizationId: subscriber.id,
        },
      },
    })
    let basePrice = basePriceRecord?.price ?? product.price
    let chargePrice = basePrice
    let resolvedAgentId: string | null = null

    if (agentId) {
      const agent = await db.agent.findFirst({
        where: { id: agentId, organizationId: subscriber.id, active: true },
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
      // Find or Create Customer
      let customer = await tx.customer.findFirst({
        where: {
          phone: phoneNumber,
          organizationId: subscriber.id,
        },
      })

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: "Guest Customer",
            email: `${phoneNumber}@placeholder.com`,
            phone: phoneNumber,
            organizationId: subscriber.id,
          },
        })
      }

      const newOrder = await tx.order.create({
        data: {
          organizationId: subscriber.id,
          customerId: customer.id,
          agentId: resolvedAgentId ?? undefined,
          total: total,
          status: "PENDING",
          phoneNumber: phoneNumber,
          items: {
            create: {
              productId: product.id,
              quantity: quantity,
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
    console.error("[STORE_ORDER]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
