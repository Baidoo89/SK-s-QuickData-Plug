import { NextResponse } from "next/server"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"

type SalesRangeKey = "daily" | "weekly" | "monthly"

function resolveSalesRange(input?: string | null): SalesRangeKey {
  if (input === "weekly" || input === "monthly") return input
  return "daily"
}

function getRangeStart(now: Date, range: SalesRangeKey): Date {
  if (range === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1)
  if (range === "weekly") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value)
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

export async function GET(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user } = authResult

    if (user.role !== "RESELLER" || !user.organizationId) {
      return ApiErrors.FORBIDDEN()
    }

    const { searchParams } = new URL(req.url)
    const selectedSalesRange = resolveSalesRange(searchParams.get("salesRange"))
    const now = new Date()
    const startDate = getRangeStart(now, selectedSalesRange)

    const orders = await db.order.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: "COMPLETED",
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        phoneNumber: true,
        status: true,
        total: true,
      },
    })

    const header = ["orderId", "createdAt", "phoneNumber", "status", "totalGHS"]
    const rows = orders.map((order) => [
      order.id,
      order.createdAt.toISOString(),
      order.phoneNumber ?? "",
      order.status,
      order.total.toFixed(2),
    ])

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(","))
      .join("\n")

    const filename = `reseller-sales-${selectedSalesRange}-${now.toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    })
  } catch (error) {
    console.error("[RESELLER_ANALYTICS_EXPORT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
