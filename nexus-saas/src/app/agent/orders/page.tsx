import { auth } from "@/auth"
import { db } from "@/lib/db"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type AgentOrderItemRow = {
  quantity: number
  product: {
    name: string
  }
}

function formatItemName(name: string) {
  const sizeMatch = name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)
  if (sizeMatch) {
    return sizeMatch[0].replace(/\s+/g, "").toUpperCase()
  }

  return name
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
}

type AgentOrderRow = {
  id: string
  createdAt: Date
  customer: {
    name: string | null
    phone: string | null
  } | null
  phoneNumber: string | null
  total: number
  status: string
  items: AgentOrderItemRow[]
}

type OrderFilters = {
  status?: string
  from?: string
  to?: string
  q?: string
}

export default async function AgentOrdersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined
  const from = typeof searchParams?.from === "string" ? searchParams.from : undefined
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined
  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined

  const filters: OrderFilters = { status, from, to, q }

  const session = await auth()
  if (!session?.user?.email) {
    return null
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, role: true, agentId: true, organizationId: true },
  })

  if (!user || user.role !== "AGENT" || !user.organizationId) {
    return null
  }

  let agentId = user.agentId
  if (!agentId) {
    const fallbackAgent = await db.agent.findFirst({
      where: {
        organizationId: user.organizationId,
        name: user.name ?? undefined,
      },
      orderBy: { createdAt: "asc" },
    })

    if (fallbackAgent) {
      agentId = fallbackAgent.id
      await db.user.update({ where: { id: user.id }, data: { agentId } })
    }
  }

  if (!agentId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find an agent profile linked to your account yet. Ask your admin to create an agent record for you.
        </p>
      </div>
    )
  }

  const where: any = {
    organizationId: user.organizationId,
    OR: [
      { agentId },
      { userId: user.id },
    ],
  }

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status
  }

  if (filters.from || filters.to) {
    where.createdAt = {}
    if (filters.from) {
      where.createdAt.gte = new Date(filters.from)
    }
    if (filters.to) {
      const toDate = new Date(filters.to)
      toDate.setHours(23, 59, 59, 999)
      where.createdAt.lte = toDate
    }
  }

  if (filters.q) {
    const search = filters.q
    where.OR = [
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
      { phoneNumber: { contains: search } },
    ]
  }

  const orders = await db.order.findMany({
    where,
    include: {
      customer: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  }) as AgentOrderRow[]

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="space-y-1 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          All completed storefront orders that used your agent link will appear here.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="text-sm font-semibold">Order history</CardTitle>
              <CardDescription className="text-xs">
                This list is backed by the real orders database. Admin and subscribers can also see these orders in their own views.
              </CardDescription>
            </div>
            <form className="flex flex-wrap gap-2 md:gap-3 items-end" method="GET">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Status</span>
                <select
                  name="status"
                  defaultValue={status || "ALL"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs md:w-auto"
                >
                  <option value="ALL">All</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">From</span>
                <Input type="date" name="from" defaultValue={from} className="h-9 text-xs md:w-auto" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">To</span>
                <Input type="date" name="to" defaultValue={to} className="h-9 text-xs md:w-auto" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Search</span>
                <Input
                  type="text"
                  name="q"
                  placeholder="Name, email, phone"
                  defaultValue={q}
                  className="h-9 w-full text-xs md:w-56"
                />
              </div>
              <Button type="submit" className="h-9 w-full text-xs md:w-auto">Apply</Button>
              <Button asChild type="button" variant="outline" className="h-9 text-xs">
                <a href="/agent/orders">Reset</a>
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-hidden">
          {orders.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No orders yet. Share your storefront link with customers to start receiving orders.
            </p>
          )}
          {orders.length > 0 && (
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Orders table
              </div>
              <div className="w-full max-w-full overflow-x-auto rounded-md border bg-background">
                <Table className="min-w-[720px] text-xs">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Time</TableHead>
                      <TableHead className="whitespace-nowrap">Customer</TableHead>
                      <TableHead className="whitespace-nowrap">Phone</TableHead>
                      <TableHead className="whitespace-nowrap">Items</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Total (GH₵)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order: AgentOrderRow) => {
                      const date = new Date(order.createdAt)
                      const customerName = order.customer?.name || "Walk-in customer"
                      const phone = order.phoneNumber || order.customer?.phone || "-"
                      const itemsLabel = order.items
                        .map((item: AgentOrderItemRow) => formatItemName(item.product.name))
                        .join(" · ")

                      return (
                        <TableRow key={order.id} className="hover:bg-muted/20">
                          <TableCell className="whitespace-nowrap text-xs">{date.toLocaleString()}</TableCell>
                          <TableCell className="text-xs font-medium">
                            {customerName}
                            <div className="text-[11px] text-muted-foreground">
                              {order.customer?.name ? "Registered customer" : "Guest checkout"}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{phone}</TableCell>
                          <TableCell className="max-w-[260px] text-xs">
                            <span className="line-clamp-2 break-words">{itemsLabel}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant={
                                order.status === "COMPLETED"
                                  ? "default"
                                  : order.status === "PENDING" || order.status === "PROCESSING"
                                  ? "secondary"
                                  : order.status === "FAILED"
                                  ? "destructive"
                                  : "outline"
                              }
                              className={
                                order.status === "COMPLETED"
                                  ? "bg-emerald-500/90"
                                  : order.status === "PENDING"
                                  ? "border-amber-500 text-amber-600"
                                  : order.status === "PROCESSING"
                                  ? "border-sky-500 text-sky-600"
                                  : order.status === "FAILED"
                                  ? ""
                                  : "border-muted-foreground/40 text-muted-foreground"
                              }
                            >
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-xs font-semibold">GH₵ {order.total.toFixed(2)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
