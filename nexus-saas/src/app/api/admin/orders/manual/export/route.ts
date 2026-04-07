import { NextResponse } from "next/server"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { db } from "@/lib/db"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"

export const dynamic = "force-dynamic"

function csvEscape(value: string | number | null | undefined) {
  const s = String(value ?? "")
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: Request) {
  const authResult = await requireOrgManager()
  if (isAuthError(authResult)) {
    return authResult
  }

  const isSuperAdmin = authResult.user.role === "SUPERADMIN"
  const organizationId = authResult.user.organizationId

  const url = new URL(req.url)
  const network = (url.searchParams.get("network") || "").trim().toUpperCase()

  const orders = await db.order.findMany({
    where: {
      status: "PENDING",
      ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
    },
    include: {
      items: { include: { product: true } },
      organization: true,
      customer: true,
      user: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  })

  const dispatchMap = await getDispatchMetaByOrderIds(orders.map((o) => o.id))

  const manualOrders = orders.filter((order) => {
    const meta = dispatchMap.get(order.id) || { mode: "MANUAL" }
    const mode = meta.mode || "MANUAL"
    const orderNetwork = (meta.network || "").toUpperCase()
    if (mode !== "MANUAL") return false
    if (network && orderNetwork !== network) return false
    return true
  })

  const header = [
    "orderId",
    "createdAt",
    "status",
    "network",
    "provider",
    "phone",
    "organization",
    "customer",
    "userEmail",
    "total",
    "items",
  ]

  const lines = [header.join(",")]

  for (const order of manualOrders) {
    const meta = dispatchMap.get(order.id) || {}
    const items = order.items
      .map((i) => i.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? i.product.name)
      .join(" | ")
    const row = [
      order.id,
      order.createdAt.toISOString(),
      order.status,
      meta.network || "",
      meta.provider || "Manual Queue",
      order.phoneNumber || "",
      order.organization?.name || "",
      order.customer?.name || "",
      order.user?.email || "",
      order.total,
      items,
    ].map(csvEscape)

    lines.push(row.join(","))
  }

  const csv = lines.join("\n")
  const fileName = network
    ? `manual-queue-${network.toLowerCase()}-${Date.now()}.csv`
    : `manual-queue-${Date.now()}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${fileName}`,
    },
  })
}
