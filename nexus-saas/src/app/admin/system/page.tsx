import { AlertTriangle, Boxes, Building2, CheckCircle2, ClipboardList, Package, Users } from "lucide-react";

import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ReadinessItem = {
  label: string;
  description: string;
  ok: boolean;
  required: boolean;
  envKeys: string[];
};

function hasAnyEnv(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function getReadinessItems(): ReadinessItem[] {
  return [
    {
      label: "Database",
      description: "Required for all tenant, order, wallet, and audit operations.",
      ok: hasAnyEnv(["DATABASE_URL"]),
      required: true,
      envKeys: ["DATABASE_URL"],
    },
    {
      label: "Application URL",
      description: "Required for auth callbacks, Paystack callbacks, and invite links.",
      ok: hasAnyEnv(["NEXTAUTH_URL", "APP_URL"]),
      required: true,
      envKeys: ["NEXTAUTH_URL", "APP_URL"],
    },
    {
      label: "Auth secret",
      description: "Required to sign authentication sessions securely.",
      ok: hasAnyEnv(["NEXTAUTH_SECRET", "AUTH_SECRET"]),
      required: true,
      envKeys: ["NEXTAUTH_SECRET", "AUTH_SECRET"],
    },
    {
      label: "Platform Paystack",
      description: "Required for SaaS subscription billing paid to the platform owner.",
      ok: hasAnyEnv(["PAYSTACK_SUBSCRIPTION_SECRET_KEY", "PAYSTACK_SECRET_KEY"]),
      required: true,
      envKeys: ["PAYSTACK_SUBSCRIPTION_SECRET_KEY", "PAYSTACK_SECRET_KEY"],
    },
    {
      label: "Email delivery",
      description: "Recommended for invite and password setup emails. Invite links still appear in-app if email is missing.",
      ok: hasAnyEnv(["RESEND_API_KEY"]) && hasAnyEnv(["RESEND_FROM_EMAIL"]),
      required: false,
      envKeys: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
    },
    {
      label: "Subscriber key encryption",
      description: "Recommended so stored subscriber Paystack secrets use a dedicated encryption key.",
      ok: hasAnyEnv(["PAYMENT_SETTINGS_ENCRYPTION_KEY"]),
      required: false,
      envKeys: ["PAYMENT_SETTINGS_ENCRYPTION_KEY"],
    },
    {
      label: "Provider automation",
      description: "Optional. Manual fulfillment remains available when provider API settings are not configured.",
      ok: hasAnyEnv(["PROVIDER_ORDER_URL"]) && hasAnyEnv(["PROVIDER_API_KEY"]),
      required: false,
      envKeys: ["PROVIDER_ORDER_URL", "PROVIDER_API_KEY"],
    },
  ];
}

export default async function AdminSystemPage() {
  const [orgCount, userCount, orderCount, productCount, agentCount, auditLogs] = await Promise.all([
    db.organization.count(),
    db.user.count(),
    db.order.count(),
    db.product.count(),
    db.agent.count(),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { organization: { select: { name: true } } },
    }),
  ]);

  const readinessItems = getReadinessItems();
  const requiredItems = readinessItems.filter((item) => item.required);
  const optionalItems = readinessItems.filter((item) => !item.required);
  const requiredReady = requiredItems.filter((item) => item.ok).length;
  const optionalReady = optionalItems.filter((item) => item.ok).length;
  const productionReady = requiredReady === requiredItems.length;

  return (
    <div className="portal-page space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Health</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review platform scale, production configuration, and recent audit activity across all tenants.
          </p>
        </div>
        <Badge
          variant={productionReady ? "secondary" : "outline"}
          className={productionReady ? "status-success border" : "status-warning border"}
        >
          {productionReady ? "Required config ready" : `${requiredReady}/${requiredItems.length} required ready`}
        </Badge>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3 2xl:grid-cols-5">
        {[
          { label: "Organizations", value: orgCount, icon: Building2 },
          { label: "Users", value: userCount, icon: Users },
          { label: "Orders", value: orderCount, icon: ClipboardList },
          { label: "Products", value: productCount, icon: Package },
          { label: "Agents", value: agentCount, icon: Boxes },
        ].map(({ label, value, icon }) => (
          <MetricCard key={label} label={label} value={value} icon={icon} tone="muted" />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Production Readiness</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Required checks should be green before launch. Optional checks improve operations but do not block manual-first selling.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              Optional ready: {optionalReady}/{optionalItems.length}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {readinessItems.map((item) => (
              <div key={item.label} className="rounded-md border bg-background p-3">
                <div className="flex items-start gap-3">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                  ) : (
                    <AlertTriangle className={item.required ? "mt-0.5 h-5 w-5 text-amber-700" : "mt-0.5 h-5 w-5 text-muted-foreground"} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <Badge variant={item.required ? "secondary" : "outline"} className="text-[10px]">
                        {item.required ? "Required" : "Optional"}
                      </Badge>
                      <Badge variant="outline" className={item.ok ? "border-primary/30 text-primary" : "border-amber-500/40 text-amber-800"}>
                        {item.ok ? "Set" : "Missing"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                      {item.envKeys.join(" or ")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Logs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-hidden p-0">
          <div className="grid gap-3 p-4 xl:hidden lg:grid-cols-2">
            {auditLogs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No audit logs found.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {log.action}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="truncate font-medium text-foreground">{log.actorName ?? log.actorId ?? "-"}</p>
                      <p>Actor</p>
                    </div>
                    <div>
                      <p className="truncate font-medium text-foreground">{log.organization?.name ?? "-"}</p>
                      <p>Organization</p>
                    </div>
                    <div className="col-span-2">
                      <p className="font-mono text-[11px] text-foreground">
                        {log.targetType}/{log.targetId.slice(0, 8)}...
                      </p>
                      <p>Target</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="table-scroll hidden xl:block">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No audit logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.actorName ?? log.actorId ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.targetType}/{log.targetId.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.organization?.name ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
