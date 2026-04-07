import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { getEffectiveDispatchPolicy, shouldUseProviderApi } from "@/lib/dispatch-policy"
import { dispatchOrderToProvider } from "@/lib/provider-dispatch"
import { reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"
import { z } from "zod"

const buyDataSchema = z.object({
  phone: z.string().min(1, "Phone number is required"),
  bundleId: z.string().min(1, "Bundle required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1").default(1),
})

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  TELECEL: ["020", "050"],
}

function normalizePhoneNumber(input: string): string | null {
  const digitsOnly = input.replace(/\D/g, "")
  if (!digitsOnly) return null

  if (digitsOnly.length === 12 && digitsOnly.startsWith("233")) {
    return `0${digitsOnly.slice(3)}`
  }

  if (digitsOnly.length === 10) {
    return digitsOnly
  }

  return null
}

function phoneMatchesProvider(phone: string, provider: string): boolean {
  const prefixes = NETWORK_PREFIXES[provider.toUpperCase()] || []
  if (prefixes.length === 0) return true
  return prefixes.includes(phone.slice(0, 3))
}

function buildPhoneVariants(normalizedPhone: string): string[] {
  const withoutZero = normalizedPhone.startsWith("0") ? normalizedPhone.slice(1) : normalizedPhone
  return Array.from(new Set([normalizedPhone, `233${withoutZero}`, `+233${withoutZero}`]))
}

function formatBundleLabel(name: string) {
  const match = name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)
  return match ? match[0].replace(/\s+/g, "").toUpperCase() : name
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const user = authResult.user

    if (!user.organizationId) {
      return ApiErrors.UNAUTHORIZED()
    }

    const body = await req.json()
    const validation = buyDataSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors
      return ApiErrors.VALIDATION_ERROR(errors)
    }

    const { phone, bundleId, quantity } = validation.data

    const normalizedPhone = normalizePhoneNumber(phone)
    if (!normalizedPhone || normalizedPhone.length !== 10) {
      return ApiErrors.BAD_REQUEST("Phone number must be exactly 10 digits")
    }

    // Fetch full user with agentId and parentAgentId
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: { agentId: true, parentAgentId: true },
    })

    // Get product
    const product = await db.product.findUnique({
      where: { id: bundleId },
    })

    if (!product) {
      return ApiErrors.NOT_FOUND("Bundle not found")
    }

    if (!phoneMatchesProvider(normalizedPhone, product.provider)) {
      return ApiErrors.BAD_REQUEST("Phone number does not match selected network")
    }

    // Get pricing: reseller override > parent-agent override > base price > product price
    let agentId = fullUser?.agentId || fullUser?.parentAgentId
    let effectivePrice = product.price

    const resellerPrice = await db.resellerPrice.findFirst({
      where: {
        resellerId: user.id,
        productId: product.id,
        organizationId: user.organizationId,
      },
    })

    if (resellerPrice) {
      effectivePrice = resellerPrice.price
    }
    
    if (!resellerPrice && agentId) {
      const agentPrice = await db.agentPrice.findFirst({
        where: { agentId, productId: product.id, organizationId: user.organizationId },
      })
      if (agentPrice) {
        effectivePrice = agentPrice.price
      } else {
        const basePrice = await db.basePrice.findFirst({
          where: { productId: product.id, organizationId: user.organizationId },
        })
        if (basePrice) {
          effectivePrice = basePrice.price
        }
      }
    }

    // Create order
    const dispatchPolicy = await getEffectiveDispatchPolicy(user.organizationId)
    const dispatchDecision = shouldUseProviderApi(dispatchPolicy, product.provider)

    const total = effectivePrice * quantity
    const phoneVariants = buildPhoneVariants(normalizedPhone)

    const order = await db.$transaction(async (tx) => {
      const existingInProgress = await tx.order.findFirst({
        where: {
          organizationId: user.organizationId,
          phoneNumber: { in: phoneVariants },
          status: { in: ["PENDING", "PROCESSING"] },
        },
        select: { id: true, status: true },
      })

      if (existingInProgress) {
        throw new Error("PHONE_ORDER_IN_PROGRESS")
      }

      const balanceAgg = await tx.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { userId: user.id, status: "success" },
      })
      const balance: number = balanceAgg._sum.amount ?? 0
      if (balance < total) {
        throw new Error("INSUFFICIENT_FUNDS")
      }

      const debit = await tx.walletTransaction.create({
        data: {
          userId: user.id,
          performedByEmail: null,
          performedByRole: user.role,
          method: "manual",
          amount: -total,
          status: "success",
        },
      })

      const created = await tx.order.create({
        data: {
          organizationId: user.organizationId,
          agentId,
          userId: user.id,
          phoneNumber: normalizedPhone,
          total,
          status: "PENDING",
          items: {
            create: {
              productId: product.id,
              quantity,
              price: effectivePrice,
            },
          },
        },
        include: {
          items: { include: { product: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          action: "ORDER_WALLET_DEBIT",
          targetType: "ORDER",
          targetId: created.id,
          organizationId: user.organizationId,
          meta: JSON.stringify({
            walletTransactionId: debit.id,
            amount: total,
            userId: user.id,
          }),
        },
      })

      return created
    })

    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_DECISION",
        targetType: "ORDER",
        targetId: order.id,
        organizationId: user.organizationId,
        meta: JSON.stringify({
          mode: dispatchDecision.useApi ? "API" : "MANUAL",
          provider: dispatchDecision.providerName,
          reason: dispatchDecision.reason,
          network: product.provider,
        }),
      },
    })

    let finalStatus = order.status
    let dispatchMessage = dispatchDecision.reason

    if (dispatchDecision.useApi) {
      const dispatchResult = await dispatchOrderToProvider({
        orderId: order.id,
        organizationId: user.organizationId,
        productId: product.id,
        network: product.provider,
        phone: normalizedPhone,
        quantity,
        amount: order.total,
        providerName: dispatchDecision.providerName,
      })

      dispatchMessage = dispatchResult.message

      if (dispatchResult.immediateStatus !== "PENDING") {
        const updatedOrder = await db.order.update({
          where: { id: order.id },
          data: { status: dispatchResult.immediateStatus },
          select: { status: true },
        })
        finalStatus = updatedOrder.status

        if (dispatchResult.immediateStatus === "FAILED") {
          await reverseOrderWalletDebitIfNeeded({
            orderId: order.id,
            organizationId: user.organizationId,
            reason: "Immediate provider failure",
          })
        }
      }
    }

    return apiSuccess(
      {
        orderId: order.id,
        phone: normalizedPhone,
        bundle: formatBundleLabel(product.name),
        quantity,
        pricePerUnit: effectivePrice,
        total: order.total,
        status: finalStatus,
        dispatchMode: dispatchDecision.useApi ? "API" : "MANUAL",
        dispatchProvider: dispatchDecision.providerName,
        dispatchReason: dispatchMessage,
        network: product.provider,
      },
      "Order created successfully",
      201
    )
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
      return ApiErrors.BAD_REQUEST("Insufficient wallet balance. Please top up before placing this order.")
    }
    if (error instanceof Error && error.message === "PHONE_ORDER_IN_PROGRESS") {
      return ApiErrors.BAD_REQUEST("This phone number already has an order in progress (pending/processing).")
    }
    console.error("[RESELLER_BUY_DATA]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
