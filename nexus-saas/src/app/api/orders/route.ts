import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getOrderSourceLogMap, ORDER_SOURCE_LABELS, resolveOrderSource } from "@/lib/order-source"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"
import { expireAbandonedStorefrontPayments } from "@/lib/storefront-payment-cleanup"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    await expireAbandonedStorefrontPayments(organizationId)

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || undefined
    const from = searchParams.get("from") || undefined
    const to = searchParams.get("to") || undefined
    const q = searchParams.get("q") || undefined
    const source = searchParams.get("source") || undefined
    const format = searchParams.get("format") || undefined
    const claimPending = ["1", "true", "yes"].includes((searchParams.get("claimPending") || "").toLowerCase())

    const where: any = { organizationId }

    if (status && status !== "ALL") {
      where.status = status
    }

    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        where.createdAt.lte = toDate
      }
    }

    if (q) {
      where.OR = [
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { customer: { phone: { contains: q } } },
        { phoneNumber: { contains: q } },
        { agent: { name: { contains: q, mode: "insensitive" } } },
      ]
    }

    let orders = await db.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        customer: true,
        agent: true,
        user: true,
      },
      orderBy: { createdAt: "desc" },
    })

    const sourceMap = await getOrderSourceLogMap(orders.map((order) => order.id))
    let enrichedOrders = orders.map((order) => ({
      ...order,
      source: resolveOrderSource(order, sourceMap),
    }))

    if (source && source !== "ALL") {
      enrichedOrders = enrichedOrders.filter((order) => order.source === source)
    }

    if (format === "csv") {
      // Export should be read-only by default. Status transitions only happen when explicitly requested.
      if (claimPending) {
        const pendingIds = enrichedOrders.filter((o) => o.status === "PENDING").map((o) => o.id)
        if (pendingIds.length > 0) {
          await db.order.updateMany({
            where: { id: { in: pendingIds } },
            data: { status: "PROCESSING" },
          })

          orders = await db.order.findMany({
            where,
            include: {
              items: { include: { product: true } },
              customer: true,
              agent: true,
              user: true,
            },
            orderBy: { createdAt: "desc" },
          })

          const refreshedSourceMap = await getOrderSourceLogMap(orders.map((order) => order.id))
          enrichedOrders = orders.map((order) => ({
            ...order,
            source: resolveOrderSource(order, refreshedSourceMap),
          }))

          if (source && source !== "ALL") {
            enrichedOrders = enrichedOrders.filter((order) => order.source === source)
          }
        }
      }

      const header = ["id", "date", "source", "buyer", "email", "phone", "status", "total", "profit", "items"]
      const rows = enrichedOrders.map((order) => {
        const buyerName = order.customer?.name || order.user?.name || "Guest Customer"
        const buyerEmail = order.customer?.email || order.user?.email || ""
        const itemsSummary = order.items
          .map((item) => item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name)
          .join("; ")
        const profit = order.items.reduce((sum, item) => sum + item.profit, 0)

        return [
          order.id,
          order.createdAt.toISOString(),
          ORDER_SOURCE_LABELS[order.source],
          buyerName,
          buyerEmail,
          resolveOrderRecipientPhone(order),
          order.status,
          order.total.toString(),
          profit.toString(),
          itemsSummary,
        ]
      })

      const csv = [header, ...rows].map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")).join("\n")

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=orders.csv",
        },
      })
    }

    return apiSuccess(enrichedOrders)
  } catch (error) {
    logApiError("[ORDERS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
