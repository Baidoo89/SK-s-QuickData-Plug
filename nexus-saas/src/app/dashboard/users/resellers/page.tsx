import { auth } from "@/auth";
import { db } from "@/lib/db";
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

export default async function ResellersPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: { organization: true },
  });

  if (!user?.organization) {
    return <div>No organization found</div>;
  }

  const resellers = await db.user.findMany({
    where: {
      organizationId: user.organization.id,
      role: "RESELLER",
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:gap-10 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Resellers</h1>
          <p className="text-muted-foreground max-w-xl">
            View all reseller accounts under your organization. Admins can credit their wallets from the wallet manual credit tools.
          </p>
        </div>
      </div>
      <Card className="hover:shadow-lg transition-shadow overflow-hidden">
        <CardHeader>
          <CardTitle>Reseller Directory</CardTitle>
          <CardDescription>
            All users with the RESELLER role in this organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[640px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resellers.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name ?? "Unnamed"}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {resellers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-sm text-muted-foreground">
                    No resellers found yet. You can create reseller accounts under an agent and then credit their wallets from the wallet section.
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
