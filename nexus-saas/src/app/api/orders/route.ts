import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || undefined
    const from = searchParams.get("from") || undefined
    const to = searchParams.get("to") || undefined
    const q = searchParams.get("q") || undefined
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

    if (format === "csv") {
      // Export should be read-only by default. Status transitions only happen when explicitly requested.
      if (claimPending) {
        const pendingIds = orders.filter((o) => o.status === "PENDING").map((o) => o.id)
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
        }
      }

      const header = ["id", "date", "buyer", "email", "phone", "status", "total", "items"]
      const rows = orders.map((order) => {
        const buyerName = order.customer?.name || order.user?.name || "Guest Customer"
        const buyerEmail = order.customer?.email || order.user?.email || ""
        const itemsSummary = order.items
          .map((item) => item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name)
          .join("; ")

        return [
          order.id,
          order.createdAt.toISOString(),
          buyerName,
          buyerEmail,
          order.phoneNumber || "",
          order.status,
          order.total.toString(),
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

    return apiSuccess(orders)
  } catch (error) {
    logApiError("[ORDERS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
