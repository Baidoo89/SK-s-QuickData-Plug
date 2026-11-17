import { claimManualOrders } from "@/lib/manual-order-claim"
import { NextResponse } from "next/server"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { db } from "@/lib/db"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"
import { getStorefrontPaymentMap } from "@/lib/storefront-payment-map"
import { getOrderSourceLogMap, ORDER_SOURCE_LABELS, resolveOrderSource } from "@/lib/order-source"
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
  const authResult = await requireOrgManager()
  if (isAuthError(authResult)) {
    return authResult
  }

  const isSuperAdmin = authResult.user.role === "SUPERADMIN"
  const organizationId = authResult.user.organizationId

  const url = new URL(req.url)
  const network = (url.searchParams.get("network") || "").trim().toUpperCase()
  const status = (url.searchParams.get("status") || "PENDING").trim().toUpperCase()
  const source = (url.searchParams.get("source") || "").trim().toUpperCase()
  const sellerRole = (url.searchParams.get("sellerRole") || "").trim().toUpperCase()
  const paymentOwner = (url.searchParams.get("paymentOwner") || "").trim().toUpperCase()
  const claimPending = ["1", "true", "yes"].includes((url.searchParams.get("claimPending") || "").toLowerCase())
  const statusFilter = status === "PROCESSING" ? ["PROCESSING"] : status === "ALL" ? ["PENDING", "PROCESSING"] : ["PENDING"]

  const orders = await db.order.findMany({
    where: {
      status: { in: statusFilter },
      paymentStatus: "PAID",
      fulfillmentMode: "MANUAL",
      ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
      ...(source ? { source } : {}),
      ...(sellerRole ? { sellerRole } : {}),
      ...(paymentOwner ? { paymentOwner } : {}),
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
  const sourceMap = await getOrderSourceLogMap(orders.map((o) => o.id))

  let manualOrders = orders.filter((order) => {
    const meta = dispatchMap.get(order.id) || { mode: order.fulfillmentMode || "MANUAL", network: "", provider: "Manual fulfillment" }
    const mode = meta.mode || order.fulfillmentMode || "MANUAL"
    const orderNetwork = (meta.network || "").toUpperCase()
    const orderSource = resolveOrderSource(order, sourceMap)
    if (mode !== "MANUAL") return false
    if (network && orderNetwork !== network) return false
    if (source && orderSource !== source && !(source === "DASHBOARD_BUY" && orderSource === "DASHBOARD")) return false
    return true
  })

  let claimedIds = new Set<string>()
  if (claimPending) {
    claimedIds = new Set(await claimManualOrders(manualOrders.map(order => order.id), authResult.user))
    manualOrders = manualOrders.filter(order => claimedIds.has(order.id))
  }

  const header = [
    "orderId",
    "createdAt",
    "status",
    "source",
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
    const orderSource = resolveOrderSource(order, sourceMap)
    const rowStatus = claimPending && claimedIds.has(order.id) ? "PROCESSING" : order.status
    const items = order.items
      .map((i) => i.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? i.product.name)
      .join(" | ")
    const row = [
      order.publicOrderCode || order.id,
      order.createdAt.toISOString(),
      rowStatus,
      ORDER_SOURCE_LABELS[orderSource],
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
