import { auth } from "@/auth"
import { db } from "@/lib/db"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { Users } from "lucide-react"

type CustomerRow = {
  id: string
  name: string
  email: string
  phone: string | null
  createdAt: Date
  _count?: {
    orders: number
  }
}

type CustomerFilters = {
  q?: string
}

export default async function ResellerCustomersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined
  const filters: CustomerFilters = { q }

  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to view customers." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      role: true,
      organizationId: true,
      parentAgentId: true,
    },
  })

  if (!user || user.role !== "RESELLER" || !user.organizationId) {
    return <PortalAccessMessage title="Reseller profile unavailable" description="This account is not linked to an approved reseller profile. Ask your agent or subscriber admin to review the account." />
  }

  const where: any = {
    organizationId: user.organizationId,
    orders: {
      some: {
        sellerUserId: user.id,
      },
    },
  }

  if (filters.q) {
    const search = filters.q
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ]
  }

  const customers = await db.customer.findMany({
    where,
    include: {
      _count: {
        select: {
          orders: {
            where: {
              sellerUserId: user.id,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  }) as CustomerRow[]

  // Calculate aggregate stats
  const totalCustomers = customers.length
  const totalOrders = customers.reduce((sum, c) => sum + (c._count?.orders ?? 0), 0)
  const avgOrdersPerCustomer =
    totalCustomers > 0 ? (totalOrders / totalCustomers).toFixed(1) : "0"

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1 max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Track customers who have purchased through your storefront link.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">guest customers</p>
          </CardContent>
        </Card>

        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">from customers</p>
          </CardContent>
        </Card>

        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Orders/Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgOrdersPerCustomer}</div>
            <p className="text-xs text-muted-foreground mt-1">repeat rate indicator</p>
          </CardContent>
        </Card>
      </div>

      {/* Customers Table */}
      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="text-sm font-semibold">Customer directory</CardTitle>
              <CardDescription className="text-xs">
                Browse all customers who have made purchases using your storefront link.
              </CardDescription>
            </div>
            <form className="flex flex-wrap gap-2 md:gap-3 items-end" method="GET">
              <div className="flex flex-col flex-1 min-w-[200px]">
                <span className="text-xs text-muted-foreground mb-1">Search</span>
                <Input
                  type="text"
                  name="q"
                  placeholder="Name, email, or phone"
                  defaultValue={q}
                  className="h-9 text-xs"
                />
              </div>
              <Button type="submit" className="h-9 text-xs">
                Search
              </Button>
              <Button asChild type="button" variant="outline" className="h-9 text-xs">
                <a href="/reseller/customers">Clear</a>
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-hidden">
          {customers.length === 0 && (
            <EmptyState
              icon={Users}
              title={q ? "No customers match your search" : "No customers yet"}
              description={
                q
                  ? "Clear the search or try a different name, email, or phone number."
                  : "Customers appear here after buyers place orders through your reseller storefront."
              }
              action={q ? { label: "Clear Search", href: "/reseller/customers" } : { label: "Share Storefront", href: "/reseller/storefronts" }}
              secondaryAction={q ? undefined : { label: "View Orders", href: "/reseller/orders" }}
              className="py-6"
            />
          )}
          {customers.length > 0 && (
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Customers table
              </div>
              <div className="ops-table-surface table-scroll rounded-lg">
                <Table className="min-w-[600px] text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Customer Name</TableHead>
                      <TableHead className="whitespace-nowrap">Phone</TableHead>
                      <TableHead className="whitespace-nowrap">Email</TableHead>
                      <TableHead className="whitespace-nowrap text-center">Orders</TableHead>
                      <TableHead className="whitespace-nowrap">First Purchase</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer: CustomerRow) => {
                      const date = new Date(customer.createdAt)
                      const orderCount = customer._count?.orders ?? 0

                      return (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium text-xs">
                            {customer.name}
                            {customer.name === "Guest Customer" && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                Guest
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {customer.phone || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {customer.email}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={orderCount > 1 ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {orderCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {date.toLocaleDateString()}
                          </TableCell>
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
