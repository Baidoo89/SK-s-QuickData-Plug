import Link from "next/link"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"
import { getStorefrontPaymentMap } from "@/lib/storefront-payment-map"
import { getOrderSourceLogMap, ORDER_SOURCE_LABELS, resolveOrderSource } from "@/lib/order-source"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/ui/metric-card"
import { ManualResultsImport } from "@/components/admin/manual-results-import"
import { ManualQueueWorkspace, type ManualQueueRow } from "@/components/dashboard/manual-queue-workspace"
import { CheckCircle2, Clock, CopyCheck, Network } from "lucide-react"

type Filters = {
  network?: string
  status?: string
  source?: string
  sellerRole?: string
  paymentOwner?: string
  paymentStatus?: string
}

async function getManualPendingOrders(filters: Filters = {}) {
  const session = await auth()
  if (!session?.user?.email) return []

  const actor = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, organizationId: true },
  })

  if (!actor?.organizationId) return []
  if (actor.role !== "SUBSCRIBER" && actor.role !== "SUPERADMIN") return []

  const orders = await db.order.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      paymentStatus: "PAID",
      fulfillmentMode: "MANUAL",
      ...(actor.role === "SUPERADMIN" ? {} : { organizationId: actor.organizationId }),
      ...(filters.source && filters.source !== "ALL" ? { source: filters.source } : {}),
      ...(filters.sellerRole && filters.sellerRole !== "ALL" ? { sellerRole: filters.sellerRole } : {}),
      ...(filters.paymentOwner && filters.paymentOwner !== "ALL" ? { paymentOwner: filters.paymentOwner } : {}),
      ...(filters.paymentStatus && filters.paymentStatus !== "ALL" ? { paymentStatus: filters.paymentStatus } : {}),
    },
    include: {
      items: { include: { product: true } },
      organization: true,
      customer: true,
      agent: true,
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  })

  const dispatchMap = await getDispatchMetaByOrderIds(orders.map((order) => order.id))
  const paymentMap = await getStorefrontPaymentMap(
    orders.map((order) => order.id),
    actor.role === "SUPERADMIN" ? null : actor.organizationId,
  )
  const sourceMap = await getOrderSourceLogMap(orders.map((order) => order.id))

  let rows = orders
    .map((order) => ({
      ...order,
      dispatch: dispatchMap.get(order.id) || { mode: order.fulfillmentMode === "API" ? "API" as const : "MANUAL" as const },
      payment: paymentMap.get(order.id) || {
        owner: order.paymentOwner === "EXTERNAL" ? "EXTERNAL" as const : "WALLET" as const,
        status: order.paymentStatus,
        reference: order.externalReference || (order.paymentOwner === "EXTERNAL" ? "External/API" : "Wallet/Internal"),
        amount: order.total,
        paidAt: null,
      },
      source: resolveOrderSource(order, sourceMap),
    }))
    .filter((order) => (order.dispatch.mode || order.fulfillmentMode || "MANUAL") === "MANUAL")

  if (filters.network && filters.network !== "ALL") {
    rows = rows.filter((row) => (row.dispatch.network || "").toUpperCase() === filters.network)
  }

  if (filters.status && filters.status !== "ALL") {
    rows = rows.filter((row) => row.status === filters.status)
  }

  if (filters.source && filters.source !== "ALL") {
    rows = rows.filter((row) => row.source === filters.source || (row.source === "DASHBOARD" && filters.source === "DASHBOARD_BUY"))
  }

  return rows
}

export async function DashboardManualQueueSection({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const network = typeof searchParams?.network === "string" ? searchParams.network : "ALL"
  const status = typeof searchParams?.status === "string" ? searchParams.status : "ALL"
  const source = typeof searchParams?.source === "string" ? searchParams.source : "ALL"
  const sellerRole = typeof searchParams?.sellerRole === "string" ? searchParams.sellerRole : "ALL"
  const paymentOwner = typeof searchParams?.paymentOwner === "string" ? searchParams.paymentOwner : "ALL"
  const paymentStatus = typeof searchParams?.paymentStatus === "string" ? searchParams.paymentStatus : "PAID"
  const rows = await getManualPendingOrders({ network, status, source, sellerRole, paymentOwner, paymentStatus })

  const pendingCount = rows.filter((order) => order.status === "PENDING").length
  const processingCount = rows.filter((order) => order.status === "PROCESSING").length
  const mtnCount = rows.filter((order) => (order.dispatch.network || "").toUpperCase() === "MTN").length
  const otherNetworkCount = rows.length - mtnCount
  const apiSourceCount = rows.filter((order) => order.source === "API").length
  const storefrontSourceCount = rows.filter((order) => order.source === "STOREFRONT").length
  const agentSellerCount = rows.filter((order) => order.sellerRole === "AGENT").length
  const resellerSellerCount = rows.filter((order) => order.sellerRole === "RESELLER").length

  const workspaceRows: ManualQueueRow[] = rows.map((order) => ({
    id: order.id,
    publicOrderCode: order.publicOrderCode || order.id.slice(-8),
    createdAt: order.createdAt.toISOString(),
    customerName: order.customer?.name || "Guest",
    phoneNumber: resolveOrderRecipientPhone(order),
    network: order.dispatch.network || "",
    source: order.source === "DASHBOARD" ? "DASHBOARD_BUY" : order.source,
    sourceLabel: ORDER_SOURCE_LABELS[order.source],
    sellerRole: order.sellerRole || "SUBSCRIBER",
    sellerName: order.agent?.name || (order.sellerRole === "SUBSCRIBER" ? "Subscriber" : null),
    provider: order.dispatch.provider || "Manual fulfillment",
    paymentOwner: order.payment.owner,
    paymentStatus: order.payment.status,
    paymentReference: order.payment.reference,
    agentName: order.agent?.name || null,
    status: order.status,
    total: order.total,
    itemsLabel: order.items
      .map((item) => item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name)
      .join(", "),
  }))

  const exportParams = new URLSearchParams()
  if (network && network !== "ALL") exportParams.set("network", network)
  if (status && status !== "ALL") exportParams.set("status", status)
  if (source && source !== "ALL") exportParams.set("source", source)
  if (sellerRole && sellerRole !== "ALL") exportParams.set("sellerRole", sellerRole)
  if (paymentOwner && paymentOwner !== "ALL") exportParams.set("paymentOwner", paymentOwner)
  if (paymentStatus && paymentStatus !== "ALL") exportParams.set("paymentStatus", paymentStatus)

  const exportHref = exportParams.toString()
    ? `/api/dashboard/orders/manual/export?${exportParams.toString()}`
    : "/api/dashboard/orders/manual/export"

  const claimParams = new URLSearchParams(exportParams)
  claimParams.set("claimPending", "true")
  const claimHref = `/api/dashboard/orders/manual/export?${claimParams.toString()}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Order actions</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Copy, claim, deliver, or fail paid orders.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Link href={exportHref}>
            <Button variant="outline" className="w-full justify-center text-xs">Download CSV</Button>
          </Link>
          <Link href={claimHref}>
            <Button className="w-full justify-center text-xs">Claim + Download</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Ready Orders" value={rows.length} description="Paid orders" icon={CopyCheck} tone={rows.length > 0 ? "warning" : "success"} />
        <MetricCard label="Pending" value={pendingCount} description={`${processingCount} claimed or processing`} icon={Clock} tone={pendingCount > 0 ? "warning" : "success"} />
        <MetricCard label="Network Split" value={`${mtnCount} / ${otherNetworkCount}`} description="MTN / other networks" icon={Network} tone="info" />
        <MetricCard label="Online Sales" value={apiSourceCount + storefrontSourceCount} description={`${apiSourceCount} website, ${storefrontSourceCount} shop`} icon={CheckCircle2} tone="primary" />
        <MetricCard label="Team Sales" value={`${agentSellerCount} / ${resellerSellerCount}`} description="Agent / reseller" icon={CheckCircle2} tone="info" />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-4">
            <div className="max-w-3xl">
              <CardTitle className="text-lg">Orders to process ({rows.length})</CardTitle>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Select orders, copy details, and update status.
              </p>
            </div>
            <form method="GET" action="/dashboard/orders" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
              <select name="network" defaultValue={network} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs">
                <option value="ALL">All networks</option>
                <option value="MTN">MTN</option>
                <option value="AIRTELTIGO">AirtelTigo</option>
                <option value="TELECEL">Telecel</option>
              </select>
              <select name="status" defaultValue={status} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs">
                <option value="ALL">Pending + processing</option>
                <option value="PENDING">Pending</option>
                <option value="PROCESSING">Processing</option>
              </select>
              <select name="source" defaultValue={source} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs">
                <option value="ALL">All sources</option>
                <option value="API">API</option>
                <option value="STOREFRONT">Storefront</option>
                <option value="DASHBOARD_BUY">Dashboard buy</option>
              </select>
              <select name="sellerRole" defaultValue={sellerRole} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs">
                <option value="ALL">All sellers</option>
                <option value="SUBSCRIBER">Subscriber</option>
                <option value="AGENT">Agent</option>
                <option value="RESELLER">Reseller</option>
              </select>
              <select name="paymentOwner" defaultValue={paymentOwner} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs">
                <option value="ALL">All payments</option>
                <option value="WALLET">Wallet</option>
                <option value="STOREFRONT">Storefront</option>
                <option value="EXTERNAL">External/API</option>
              </select>
              <select name="paymentStatus" defaultValue={paymentStatus} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs">
                <option value="PAID">Paid only</option>
              </select>
              <Button type="submit" variant="outline" className="h-9 w-full text-xs">Apply</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <ManualQueueWorkspace rows={workspaceRows} />
        </CardContent>
      </Card>

      <ManualResultsImport importEndpoint="/api/dashboard/orders/manual/import" />
    </div>
  )
}
