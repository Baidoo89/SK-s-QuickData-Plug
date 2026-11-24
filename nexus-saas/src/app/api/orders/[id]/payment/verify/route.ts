import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const organizationId = authResult.user.organizationId!
    const order = await db.order.findFirst({
      where: {
        id: params.id,
        organizationId,
        paymentOwner: "STOREFRONT",
      },
      select: { id: true, publicOrderCode: true },
    })

    if (!order) return ApiErrors.NOT_FOUND("Order")

    const payments = await db.storefrontPayment.findMany({
      where: { organizationId, orderIds: { contains: order.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { reference: true, status: true, orderIds: true },
    })

    const payment = payments.find((row) => {
      try {
        const orderIds = JSON.parse(row.orderIds)
        return Array.isArray(orderIds) && orderIds.includes(order.id)
      } catch {
        return false
      }
    })

    if (!payment) return ApiErrors.NOT_FOUND("Storefront payment")

    if (payment.status === "SUCCESS") {
      return apiSuccess({ verified: true, reference: payment.reference, orderCode: order.publicOrderCode }, "Payment is already verified")
    }

    const verifyUrl = new URL("/api/store/paystack/verify", req.url)
    verifyUrl.searchParams.set("reference", payment.reference)
    verifyUrl.searchParams.set("organizationId", organizationId)

    const response = await fetch(verifyUrl, {
      redirect: "manual",
      cache: "no-store",
    })
    const redirectLocation = response.headers.get("location") || ""

    if (redirectLocation.includes("checkout=success")) {
      return apiSuccess({ verified: true, reference: payment.reference, orderCode: order.publicOrderCode }, "Payment verified and order recovered")
    }

    return ApiErrors.BAD_REQUEST("Paystack has not confirmed a successful payment for this reference. Check the customer's payment status before retrying.")
  } catch (error) {
    logApiError("[ORDER_PAYMENT_VERIFY]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
