import { auth } from "@/auth";
import { db as prisma } from "@/lib/db";
import { formatGhanaCedis } from "@/lib/currency";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";

const SEGMENTS = ["all", "high", "frequent", "new"] as const;
type Segment = (typeof SEGMENTS)[number];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { organization: true },
  });

  if (!user?.organization) {
    return <div>No organization found</div>;
  }

  const customers = await prisma.customer.findMany({
    where: {
      organizationId: user.organization.id,
      ...(typeof searchParams?.agentId === "string" && searchParams.agentId
        ? { orders: { some: { agentId: searchParams.agentId } } }
        : {}),
    },
    include: {
      _count: {
        select: { orders: true },
      },
      orders: {
        select: {
          total: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const segmentParam =
    typeof searchParams?.segment === "string" ? searchParams.segment : "all";
  const segment: Segment = SEGMENTS.includes(segmentParam as Segment)
    ? (segmentParam as Segment)
    : "all";

  const now = new Date();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const customersWithStats = customers.map((customer) => {
    const totalSpent = customer.orders.reduce(
      (acc, order) => acc + order.total,
      0
    );
    return { ...customer, totalSpent };
  });

  const filteredCustomers = customersWithStats.filter((customer) => {
    if (segment === "high") {
      return customer.totalSpent >= 1000; // high-value threshold in GHS
    }
    if (segment === "frequent") {
      return customer._count.orders >= 5;
    }
    if (segment === "new") {
      const createdAt = new Date(customer.createdAt);
      return now.getTime() - createdAt.getTime() <= THIRTY_DAYS_MS;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:gap-10 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Customers</h1>
          <p className="text-muted-foreground max-w-xl">
            View and manage your customer base (people buying through your store). Agents and resellers are managed from the Agents section.
          </p>
        </div>
      </div>
      <Card className="hover:shadow-lg transition-shadow overflow-hidden">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Customer Base</CardTitle>
              <CardDescription>
                All your customers, with order and spend insights.
              </CardDescription>
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1 text-xs md:text-sm">
              {SEGMENTS.map((value) => {
                const label =
                  value === "all"
                    ? "All"
                    : value === "high"
                    ? "High value"
                    : value === "frequent"
                    ? "Frequent"
                    : "New";
                const href =
                  value === "all"
                    ? "/dashboard/customers"
                    : `/dashboard/customers?segment=${value}`;
                const isActive = segment === value;
                return (
                  <Link
                    key={value}
                    href={href}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[720px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => {
                return (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarImage
                          src={`https://api.dicebear.com/7.x/initials/svg?seed=${customer.name}`}
                          alt={customer.name}
                        />
                        <AvatarFallback>
                          {customer.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer.name}
                    </TableCell>
                    <TableCell>{customer.email}</TableCell>
                    <TableCell>{customer._count.orders}</TableCell>
                    <TableCell>{formatGhanaCedis(customer.totalSpent)}</TableCell>
                    <TableCell className="text-right">
                      {format(new Date(customer.createdAt), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    No customers found for this segment yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
