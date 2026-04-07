import { NextResponse } from "next/server"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { db } from "@/lib/db"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"

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
  const claimPending = ["1", "true", "yes"].includes((url.searchParams.get("claimPending") || "").toLowerCase())

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

  let claimedIds = new Set<string>()
  if (claimPending && manualOrders.length > 0) {
    const ids = manualOrders.map((o) => o.id)
    await db.order.updateMany({
      where: {
        id: { in: ids },
        status: "PENDING",
        ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
      },
      data: { status: "PROCESSING" },
    })

    claimedIds = new Set(ids)

    await db.auditLog.create({
      data: {
        actorId: authResult.user.id,
        actorName: authResult.user.email,
        action: "ORDER_MANUAL_CLAIM_EXPORT",
        targetType: "SYSTEM",
        targetId: `manual-queue-${Date.now()}`,
        organizationId: organizationId ?? undefined,
        meta: JSON.stringify({
          network: network || "ALL",
          claimedCount: ids.length,
        }),
      },
    })
  }

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
    const rowStatus = claimPending && claimedIds.has(order.id) ? "PROCESSING" : order.status
    const items = order.items
      .map((i) => i.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? i.product.name)
      .join(" | ")
    const row = [
      order.id,
      order.createdAt.toISOString(),
      rowStatus,
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
  const fileNamePrefix = claimPending ? "manual-claimed" : "manual-queue"
  const fileName = network
    ? `${fileNamePrefix}-${network.toLowerCase()}-${Date.now()}.csv`
    : `${fileNamePrefix}-${Date.now()}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${fileName}`,
    },
  })
}
