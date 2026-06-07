import { auth } from "@/auth"
import Link from "next/link"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { ServiceRequestsWorkspace, type ServiceRequestRow } from "@/components/dashboard/service-requests-workspace"
import { EmptyState } from "@/components/ui/empty-state"
import { MetricCard } from "@/components/ui/metric-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/lib/db"
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

async function getResellerServiceRequests(userId: string, organizationId: string, status?: string, serviceId?: string) {
  const where: any = {
    organizationId,
    OR: [{ sellerUserId: userId }, { userId }],
  }

  if (status && status !== "ALL") {
    where.status = status
  }

  if (serviceId && serviceId !== "ALL") {
    where.productId = serviceId
  }

  const requests = await db.serviceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  const productIds = Array.from(new Set(requests.map((request) => request.productId).filter(Boolean)))
  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, provider: true },
      })
    : []

  const productMap = new Map(products.map((product) => [product.id, product]))
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
      sellerRole: request.sellerRole || "RESELLER",
      sellerName: "Your storefront",
      paymentStatus: request.paymentStatus,
      status: request.status,
      total: request.total,
      profit: request.profit,
    }
  })
}

export default async function ResellerServiceRequestsPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined
  const serviceId = typeof searchParams?.service === "string" ? searchParams.service : undefined
  const session = await auth()

  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to view service requests." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, organizationId: true },
  })

  if (!user || user.role !== "RESELLER" || !user.organizationId) {
    return <PortalAccessMessage title="Reseller profile unavailable" description="This account is not linked to an approved reseller profile." />
  }

  await expireAbandonedStorefrontPayments(user.organizationId)

  const [rows, allRowsForStatus] = await Promise.all([
    getResellerServiceRequests(user.id, user.organizationId, status, serviceId),
    getResellerServiceRequests(user.id, user.organizationId, status),
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
    return query ? `/reseller/service-requests?${query}` : "/reseller/service-requests"
  }
  const pending = rows.filter((row) => row.status === "PENDING_REVIEW").length
  const completed = rows.filter((row) => row.status === "COMPLETED").length
  const revenue = rows.reduce((sum, row) => sum + row.total, 0)

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Service Requests</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            View registration and service requests submitted through your reseller storefront.
          </p>
        </div>
        <form className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-auto" method="GET">
          <select name="status" defaultValue={status || "ALL"} className="h-9 rounded-md border border-input bg-background px-3 text-xs">
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
              <p className="text-xs text-muted-foreground">View each registration service submitted through your storefront separately.</p>
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
                {service.name} - {service.provider} ({service.count})
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Visible Requests" value={rows.length} description={hasFilters ? "Matching active filters" : "All service requests"} icon={ListFilter} tone="primary" />
        <MetricCard label="Pending Review" value={pending} description="Paid requests awaiting subscriber action" icon={Clock} tone={pending > 0 ? "warning" : "success"} />
        <MetricCard label="Completed" value={completed} description="Fulfilled service requests" icon={CheckCircle2} tone="success" />
        <MetricCard label="Revenue" value={formatGhanaCedis(revenue)} description="Customer checkout value" icon={FileText} tone="info" />
      </div>

      <Card className="min-w-0 max-w-full overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardContent className="p-3 sm:p-6">
          {rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={hasFilters ? "No service requests match this filter" : "No service requests yet"}
              description={hasFilters ? "Change the filter to see more service requests." : "Requests will appear here after customers submit and pay from your storefront."}
              action={hasFilters ? { label: "Show All", href: "/reseller/service-requests" } : { label: "Share Storefront", href: "/reseller/storefronts" }}
            />
          ) : (
            <ServiceRequestsWorkspace rows={rows} readOnly />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
