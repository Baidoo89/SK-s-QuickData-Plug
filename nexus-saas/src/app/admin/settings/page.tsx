import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DispatchHealthCard } from "@/components/admin/dispatch-health-card";

function EnvCard({ label, envKey, description }: { label: string; envKey: string; description: string }) {
  const isSet = Boolean(process.env[envKey]);
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-sm font-medium">
          <span className="min-w-0 break-words">{label}</span>
          <Badge
            variant="secondary"
            className={isSet ? "status-success shrink-0 border text-xs" : "shrink-0 text-xs"}
          >
            {isSet ? "Set" : "Missing"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="break-words text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{envKey}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="portal-page min-w-0 space-y-4 overflow-x-hidden">
      <div className="max-w-3xl min-w-0 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Platform configuration</p>
        <h2 className="break-words text-2xl font-bold tracking-tight">Settings</h2>
        <p className="break-words text-sm text-muted-foreground">
          Superadmin-owned platform configuration for auth, SaaS billing, email, encryption, and optional provider automation.
        </p>
      </div>

      <h3 className="break-words text-sm font-semibold uppercase tracking-wide text-muted-foreground">Launch Critical</h3>
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
          label="Platform Subscription Paystack"
          envKey="PAYSTACK_SUBSCRIPTION_SECRET_KEY"
          description="Secret key for SaaS subscription billing paid to the platform owner."
        />
        <EnvCard
          label="Subscriber Key Encryption"
          envKey="PAYMENT_SETTINGS_ENCRYPTION_KEY"
          description="Dedicated encryption key for stored subscriber Paystack settings."
        />
      </div>

      <h3 className="break-words text-sm font-semibold uppercase tracking-wide text-muted-foreground">Communication</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
      </div>

      <h3 className="break-words text-sm font-semibold uppercase tracking-wide text-muted-foreground">Optional Provider Automation</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-3">
          <h3 className="break-words text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fulfillment Ownership</h3>
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="break-words text-sm font-medium">Subscriber-Owned Routing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p className="break-words">
                Each subscriber controls their own provider connection and network routing from their dashboard settings.
              </p>
              <p className="break-words">
                Superadmin monitors platform-wide dispatch health and keeps the fallback environment variables ready for launch support.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          <h3 className="break-words text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dispatch Monitoring</h3>
          <DispatchHealthCard />
        </div>
      </div>
    </div>
  );
}
