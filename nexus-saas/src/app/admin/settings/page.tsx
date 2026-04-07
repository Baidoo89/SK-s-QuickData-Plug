import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DispatchPolicyCard } from "@/components/admin/dispatch-policy-card";
import { DispatchHealthCard } from "@/components/admin/dispatch-health-card";

function EnvCard({ label, envKey, description }: { label: string; envKey: string; description: string }) {
  const isSet = Boolean(process.env[envKey]);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
          {label}
          <Badge
            variant="secondary"
            className={isSet ? "bg-green-100 text-green-800 text-xs" : "bg-red-100 text-red-800 text-xs"}
          >
            {isSet ? "Set" : "Missing"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{envKey}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      <p className="text-sm text-muted-foreground">
        Configure API settings and core system behaviour for the platform.
      </p>

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Environment Variables</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <EnvCard
          label="Auth Secret"
          envKey="NEXTAUTH_SECRET"
          description="Secret key used to sign and verify JWT tokens for NextAuth."
        />
        <EnvCard
          label="App URL"
          envKey="NEXTAUTH_URL"
          description="Base URL for the application, used in auth callbacks and email links."
        />
        <EnvCard
          label="Database URL"
          envKey="DATABASE_URL"
          description="Connection string for the production PostgreSQL database."
        />
        <EnvCard
          label="Paystack Secret"
          envKey="PAYSTACK_SECRET_KEY"
          description="Secret key for processing payments and verifying transactions via Paystack."
        />
        <EnvCard
          label="Resend API Key"
          envKey="RESEND_API_KEY"
          description="API key for sending transactional emails via Resend (password reset, etc.)."
        />
        <EnvCard
          label="Resend From Email"
          envKey="RESEND_FROM_EMAIL"
          description="Verified sender address/domain used by Resend for outgoing invite/reset emails."
        />
        <EnvCard
          label="Provider Order URL"
          envKey="PROVIDER_ORDER_URL"
          description="Endpoint used to submit API-routed orders to your external provider."
        />
        <EnvCard
          label="Provider API Key"
          envKey="PROVIDER_API_KEY"
          description="Bearer token used when submitting orders to your provider endpoint."
        />
        <EnvCard
          label="Provider Webhook Secret"
          envKey="PROVIDER_WEBHOOK_SECRET"
          description="Secret required by /api/provider/callback to accept provider status callbacks."
        />
        <EnvCard
          label="Provider Webhook HMAC Secret"
          envKey="PROVIDER_WEBHOOK_HMAC_SECRET"
          description="HMAC secret for x-provider-signature verification on callback requests."
        />
        <EnvCard
          label="Retry Max Attempts"
          envKey="DISPATCH_RETRY_MAX_ATTEMPTS"
          description="Maximum number of admin retry attempts per API-routed order."
        />
        <EnvCard
          label="Retry Backoff Seconds"
          envKey="DISPATCH_RETRY_BACKOFF_SECONDS"
          description="Minimum wait time between retry attempts for the same order."
        />
        <EnvCard
          label="Health Pending Age Minutes"
          envKey="DISPATCH_HEALTH_PENDING_AGE_MINUTES"
          description="Threshold used to flag stale API-routed pending orders."
        />
        <EnvCard
          label="Health Fail Alert Threshold"
          envKey="DISPATCH_HEALTH_ALERT_FAIL_THRESHOLD"
          description="Alert threshold for failed dispatch attempts in the last 24 hours."
        />
        <EnvCard
          label="Health Stale Alert Threshold"
          envKey="DISPATCH_HEALTH_ALERT_STALE_THRESHOLD"
          description="Alert threshold for stale API-routed pending orders."
        />
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dispatch Control</h3>
      <DispatchPolicyCard />

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dispatch Monitoring</h3>
      <DispatchHealthCard />
    </div>
  );
}
