import { NextResponse } from "next/server"
import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { db } from "@/lib/db"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"
import { getStorefrontPaymentMap } from "@/lib/storefront-payment-map"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"

export const dynamic = "force-dynamic"

function csvEscape(value: string | number | null | undefined) {
  const s = String(value ?? "")
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: Request) {
  const authResult = await requireAdmin()
  if (isAuthError(authResult)) {
    return authResult
  }

  const isSuperAdmin = authResult.user.role === "SUPERADMIN"
  const organizationId = authResult.user.organizationId

  const url = new URL(req.url)
  const network = (url.searchParams.get("network") || "").trim().toUpperCase()
  const claimPending = ["1", "true", "yes"].includes((url.searchParams.get("claimPending") || "").toLowerCase())
  const status = (url.searchParams.get("status") || "PENDING").trim().toUpperCase()
  const statusFilter = status === "PROCESSING" ? ["PROCESSING"] : status === "ALL" ? ["PENDING", "PROCESSING"] : ["PENDING"]

  const orders = await db.order.findMany({
    where: {
      status: { in: statusFilter },
      paymentStatus: "PAID",
      fulfillmentMode: "MANUAL",
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
  const paymentMap = await getStorefrontPaymentMap(orders.map((o) => o.id), isSuperAdmin ? null : organizationId)

  const manualOrders = orders.filter((order) => {
    const meta = dispatchMap.get(order.id) || { mode: order.fulfillmentMode || "MANUAL", network: "", provider: "Manual fulfillment" }
    const mode = meta.mode || order.fulfillmentMode || "MANUAL"
    const orderNetwork = (meta.network || "").toUpperCase()
    if (mode !== "MANUAL") return false
    if (network && orderNetwork !== network) return false
    return true
  })

  let claimedIds = new Set<string>()
  if (claimPending && manualOrders.length > 0) {
    const ids = manualOrders.filter((o) => o.status === "PENDING").map((o) => o.id)
    if (ids.length > 0) {
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
            status: status || "PENDING",
            claimedCount: ids.length,
          }),
        },
      })

      await db.auditLog.createMany({
        data: ids.map((orderId) => ({
          actorId: authResult.user.id,
          actorName: authResult.user.email,
          action: "ORDER_MANUAL_CLAIMED",
          targetType: "ORDER",
          targetId: orderId,
          organizationId: organizationId ?? undefined,
          meta: JSON.stringify({
            network: network || "ALL",
            exportType: "manual-queue",
          }),
        })),
      })
    }
  }

  const header = [
    "orderId",
    "createdAt",
    "status",
    "network",
    "provider",
    "paymentOwner",
    "paymentStatus",
    "paymentReference",
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
    const payment = paymentMap.get(order.id)
    const rowStatus = claimPending && claimedIds.has(order.id) ? "PROCESSING" : order.status
    const items = order.items
      .map((i) => i.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? i.product.name)
      .join(" | ")
    const row = [
      order.publicOrderCode || order.id,
      order.createdAt.toISOString(),
      rowStatus,
      meta.network || "",
      meta.provider || "Manual fulfillment",
      payment?.owner || order.paymentOwner,
      payment?.status || order.paymentStatus,
      payment?.reference || order.externalReference || (order.paymentOwner === "EXTERNAL" ? "External/API" : "Wallet/Internal"),
      resolveOrderRecipientPhone(order),
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
