import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { z } from "zod"

const validateSchema = z.object({
  phones: z.array(z.string().min(1)).min(1, "At least one phone required"),
  totalAmount: z.number().positive("Total amount must be positive"),
})

function buildPhoneVariants(normalizedPhone: string): string[] {
  const withoutZero = normalizedPhone.startsWith("0") ? normalizedPhone.slice(1) : normalizedPhone
  return Array.from(new Set([normalizedPhone, `233${withoutZero}`, `+233${withoutZero}`]))
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
    const validation = validateSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors
      return ApiErrors.VALIDATION_ERROR(errors)
    }

    const { phones, totalAmount } = validation.data

    // Check wallet balance
    const walletTable = (db as any)["walletTransaction"]
    const balanceAgg = await walletTable.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, status: "success" },
    })
    const balance: number = balanceAgg._sum.amount ?? 0

    // Check for active orders on each phone
    const allVariants = phones.flatMap((phone) => buildPhoneVariants(phone))
    const activeOrders = await db.order.findMany({
      where: {
        organizationId: user.organizationId,
        phoneNumber: { in: allVariants },
        status: { in: ["PENDING", "PROCESSING"] },
      },
      select: { phoneNumber: true, status: true },
    })

    const phonesWithActiveOrders = new Set(activeOrders.map((o) => o.phoneNumber))

    return apiSuccess(
      {
        walletBalance: balance,
        sufficientFunds: balance >= totalAmount,
        phonesWithActiveOrders: Array.from(phonesWithActiveOrders),
        warnings: {
          insufficientFunds: balance < totalAmount,
          activeOrderConflicts: phonesWithActiveOrders.size > 0,
        },
      },
      "Validation complete",
      200
    )
  } catch (error) {
    console.error("[VALIDATE_BULK_ORDERS]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
