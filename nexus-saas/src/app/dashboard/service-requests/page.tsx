import { auth } from "@/auth"
import Link from "next/link"
import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { MetricCard } from "@/components/ui/metric-card"
import { ServiceRequestsWorkspace, type ServiceRequestRow } from "@/components/dashboard/service-requests-workspace"
import { formatGhanaCedis } from "@/lib/currency"
import { expireAbandonedStorefrontPayments } from "@/lib/storefront-payment-cleanup"
import { CheckCircle2, Clock, FileText, ListFilter } from "lucide-react"

function parseDetails(value: string | null) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function buildFormDetails(details: Record<string, unknown>) {
  const values = details.formValues && typeof details.formValues === "object" && !Array.isArray(details.formValues)
    ? details.formValues as Record<string, unknown>
    : {}
  const fields = Array.isArray(details.formFields) ? details.formFields : []

  return fields
    .filter((field: any) => field && typeof field.id === "string" && typeof field.label === "string")
    .map((field: any) => ({
      label: field.label,
      value: typeof values[field.id] === "string" ? values[field.id] as string : "",
    }))
    .filter((detail) => detail.value)
}

type ServiceRequestFilters = {
  status?: string
  serviceId?: string
}

async function getServiceRequests(filters: ServiceRequestFilters = {}) {
  const session = await auth()
  if (!session?.user?.email) return []

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { organizationId: true },
  })

  if (!user?.organizationId) return []
  await expireAbandonedStorefrontPayments(user.organizationId)

  const where: any = {
    organizationId: user.organizationId,
  }

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status
  }

  if (filters.serviceId && filters.serviceId !== "ALL") {
    where.productId = filters.serviceId
  }

  const requests = await db.serviceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  const productIds = Array.from(new Set(requests.map((request) => request.productId).filter(Boolean)))
  const agentIds = Array.from(new Set(requests.map((request) => request.agentId).filter(Boolean))) as string[]
  const userIds = Array.from(new Set(requests.map((request) => request.userId).filter(Boolean))) as string[]

  const [products, agents, sellers] = await Promise.all([
    productIds.length
      ? db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, provider: true },
        })
      : [],
    agentIds.length
      ? db.agent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        })
      : [],
    userIds.length
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
  ])

  const productMap = new Map(products.map((product) => [product.id, product]))
  const agentMap = new Map(agents.map((agent) => [agent.id, agent.name]))
  const sellerMap = new Map(sellers.map((seller) => [seller.id, seller.name || seller.email || "Seller"]))

  return requests.map((request): ServiceRequestRow => {
    const details = parseDetails(request.details)
    const product = productMap.get(request.productId)
    return {
      id: request.id,
      productId: request.productId,
      createdAt: request.createdAt.toISOString(),
      type: request.type,
      serviceName: product?.name || "Service request",
      provider: product?.provider || (typeof details.serviceProvider === "string" ? details.serviceProvider : "SERVICE"),
      customerName: request.customerName,
      phoneNumber: request.phoneNumber,
      location: request.location || "",
      dateOfBirth: request.dateOfBirth ? request.dateOfBirth.toISOString().slice(0, 10) : "",
      ghanaCardNumber: typeof details.ghanaCardNumber === "string" ? details.ghanaCardNumber : "",
      formDetails: buildFormDetails(details),
      sellerRole: request.sellerRole || "SUBSCRIBER",
      sellerName: request.userId ? sellerMap.get(request.userId) || "Seller" : request.agentId ? agentMap.get(request.agentId) || "Agent" : "Direct",
      paymentStatus: request.paymentStatus,
      status: request.status,
      total: request.total,
      profit: request.profit,
    }
  })
}

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined
  const serviceId = typeof searchParams?.service === "string" ? searchParams.service : undefined
  const [rows, allRowsForStatus] = await Promise.all([
    getServiceRequests({ status, serviceId }),
    getServiceRequests({ status }),
  ])
  const hasFilters = Boolean((status && status !== "ALL") || (serviceId && serviceId !== "ALL"))
  const serviceOptions = Array.from(
    allRowsForStatus.reduce((map, row) => {
      const existing = map.get(row.productId)
      map.set(row.productId, {
        id: row.productId,
        name: row.serviceName,
        provider: row.provider,
        count: (existing?.count || 0) + 1,
      })
      return map
    }, new Map<string, { id: string; name: string; provider: string; count: number }>()),
  ).map(([, value]) => value)

  const queryFor = (nextServiceId?: string) => {
    const params = new URLSearchParams()
    if (status && status !== "ALL") params.set("status", status)
    if (nextServiceId && nextServiceId !== "ALL") params.set("service", nextServiceId)
    const query = params.toString()
    return query ? `/dashboard/service-requests?${query}` : "/dashboard/service-requests"
  }
  const pending = rows.filter((row) => row.status === "PENDING_REVIEW").length
  const processing = rows.filter((row) => row.status === "PROCESSING").length
  const completed = rows.filter((row) => row.status === "COMPLETED").length
  const totalRevenue = rows.reduce((sum, row) => sum + row.total, 0)

  return (
    <div className="portal-page flex-1 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Service Requests</h2>
          <p className="text-muted-foreground max-w-xl">
            Review and process registration and service requests separately from VTU/data orders.
          </p>
        </div>
        <form className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-auto" method="GET">
          <select
            name="status"
            defaultValue={status || "ALL"}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING_PAYMENT">Awaiting payment</option>
            <option value="PENDING_REVIEW">Pending review</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button className="h-9 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground" type="submit">
            Apply
          </button>
        </form>
      </div>

      <Card className="border border-border bg-card/95 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Service tables</p>
              <p className="text-xs text-muted-foreground">Each service can be reviewed separately while still using one operations workflow.</p>
            </div>
            {serviceId && serviceId !== "ALL" ? <Badge variant="outline">Filtered service</Badge> : null}
          </div>
          <div className="table-scroll flex gap-2 pb-1">
            <Link
              href={queryFor("ALL")}
              className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${!serviceId || serviceId === "ALL" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-primary"}`}
            >
              All services ({allRowsForStatus.length})
            </Link>
            {serviceOptions.map((service) => (
              <Link
                key={service.id}
                href={queryFor(service.id)}
                className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${serviceId === service.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-primary"}`}
              >
                {service.name} · {service.provider} ({service.count})
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Visible Requests" value={rows.length} description={hasFilters ? "Matching active filters" : "All service requests"} icon={ListFilter} tone="primary" />
        <MetricCard label="Pending Review" value={pending} description="Paid requests awaiting action" icon={Clock} tone={pending > 0 ? "warning" : "success"} />
        <MetricCard label="Completed" value={completed} description={`${processing} currently processing`} icon={CheckCircle2} tone="success" />
        <MetricCard label="Visible Revenue" value={formatGhanaCedis(totalRevenue)} description="Service checkout value" icon={FileText} tone="info" />
      </div>

      <Card className="min-w-0 max-w-full overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardContent className="p-3 sm:p-6">
          {rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={hasFilters ? "No service requests match this filter" : "No service requests yet"}
              description={
                hasFilters
                  ? "Change the status filter to see more service requests."
                  : "Registration services will appear here after customers submit and pay from a storefront."
              }
              action={hasFilters ? { label: "Show All", href: "/dashboard/service-requests" } : { label: "Manage Products", href: "/dashboard/products" }}
            />
          ) : (
            <ServiceRequestsWorkspace rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
