import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ResellerAccountPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      parentAgentId: true,
      organizationId: true,
    },
  });

  if (!user || user.role !== "RESELLER") {
    return null;
  }

  const agent = user.parentAgentId
    ? await db.agent.findUnique({
        where: { id: user.parentAgentId },
        include: { organization: true },
      })
    : null;

  const fallbackOrg = user.organizationId
    ? await db.organization.findUnique({ where: { id: user.organizationId } })
    : null;

  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString()
    : "Unknown";

  const org = agent?.organization ?? fallbackOrg;
  const orgName = org?.name ?? "Not linked";
  const orgSlug = org?.slug ?? null;
  const storefrontPath = orgSlug ? `/store/${orgSlug}` : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Your reseller profile, linked agent, and storefront information.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Name:</span> {user.name || "Unnamed reseller"}</p>
            <p><span className="font-medium text-foreground">Email:</span> {user.email}</p>
            <p><span className="font-medium text-foreground">Role:</span> {user.role}</p>
            <p><span className="font-medium text-foreground">Joined:</span> {joined}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked agent & organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Parent agent:</span>{" "}
              {agent ? agent.name : "Not linked to a parent agent"}
            </p>
            <p>
              <span className="font-medium text-foreground">Organization:</span>{" "}
              {orgName}
            </p>
            {storefrontPath ? (
              <p>
                <span className="font-medium text-foreground">Storefront link:</span>{" "}
                <span className="font-mono text-xs break-all">{storefrontPath}</span>
              </p>
            ) : org ? (
              <p className="text-xs">
                This organization has no storefront slug yet. Ask your agent or admin to finish storefront setup.
              </p>
            ) : (
              <p className="text-xs">
                You&apos;re not yet linked to an organization. Contact your agent or admin if this is unexpected.
              </p>
            )}
            <p className="text-[11px]">
              API keys are managed at the organization level. Ask your parent agent or admin if you need
              organization-wide API access.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}