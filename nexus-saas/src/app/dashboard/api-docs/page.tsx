import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ApiKeys } from "@/components/dashboard/api-keys";

export default async function ApiDocsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: {
      organization: {
        include: {
          apiKeys: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!user?.organization) {
    return <div className="px-4 py-6 md:p-8">No organization found.</div>;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:gap-8 md:p-8 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-1">API Docs</h1>
        <p className="text-muted-foreground max-w-2xl">
          Integrate programmatic access to your store. Use API keys to authenticate and call endpoints for checking products, creating orders, and more.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Base URL</CardTitle>
          <CardDescription>Your tenant-specific public endpoints.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-mono bg-muted px-3 py-2 rounded-md break-all">
              {baseUrl}/store/{user.organization.slug}
            </p>
            <p className="text-muted-foreground mt-1">
              This is your public storefront URL. You can share it with customers or call it from your systems.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold">Example API endpoints</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <span className="font-mono">GET /api/shop/{"{tenantSlug}"}/products</span> 
                – list available products and bundles.
              </li>
              <li>
                <span className="font-mono">GET /api/shop/{"{tenantSlug}"}/agent/{"{agentId}"}/products</span> 
                – list products with agent pricing.
              </li>
              <li>
                <span className="font-mono">POST /api/orders</span> – create an order from your backend.
              </li>
              <li>
                <span className="font-mono">GET /api/dashboard/orders/manual/export</span>
                {" "}– export manual queue CSV from the dashboard portal.
              </li>
              <li>
                <span className="font-mono">POST /api/dashboard/orders/manual/import</span>
                {" "}– import manual processing results (orderId,status).
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <ApiKeys apiKeys={user.organization.apiKeys} />
    </div>
  );
}
