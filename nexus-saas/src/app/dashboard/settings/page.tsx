import { auth } from "@/auth";
import { db as prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { ApiKeys } from "@/components/dashboard/api-keys";
import { ProviderConnectionCard } from "@/components/admin/provider-connection-card";
import { DispatchPolicyCard } from "@/components/admin/dispatch-policy-card";
import { DispatchHealthCard } from "@/components/admin/dispatch-health-card";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { 
      organization: {
        include: {
          apiKeys: {
            orderBy: { createdAt: 'desc' }
          }
        }
      } 
    },
  });

  if (!user?.organization) {
    return <div>No organization found</div>;
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:gap-10 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Settings</h1>
          <p className="text-muted-foreground max-w-xl">Manage your organization details and API keys. Keep your business information up to date and control external access securely.</p>
        </div>
      </div>
      <div className="grid gap-6 max-w-4xl">
        <SettingsForm initialName={user.organization.name} />
        <ApiKeys apiKeys={user.organization.apiKeys} />

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Provider Connection
          </h2>
          <ProviderConnectionCard />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dispatch Control
          </h2>
          <DispatchPolicyCard />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dispatch Monitoring
          </h2>
          <DispatchHealthCard />
        </div>
      </div>
    </div>
  );
}
