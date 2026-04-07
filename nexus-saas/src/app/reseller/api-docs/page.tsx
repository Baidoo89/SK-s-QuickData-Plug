import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ResellerApiDocsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">API Docs</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Reseller integration guide for submitting orders into your organization queue.
          These endpoints use your normal login session (cookies); API keys can be added later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The portal uses cookie-based authentication via the normal login page. When you make
            API calls from a browser tab where you are logged in, your requests automatically
            include the required cookies.
          </p>
          <p className="text-xs">
            For backend or server-to-server integrations, you can forward the session cookie from a
            logged-in browser, or later use organization-level API keys when enabled by your admin.
          </p>
          <div className="flex flex-wrap gap-2 text-xs mt-1">
            <Badge variant="outline">Cookie-based auth</Badge>
            <Badge variant="outline">Future API keys</Badge>
            <Badge variant="outline">Role-scoped access</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order flow policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Queue model:
            <span className="font-medium text-foreground"> Reseller -&gt; Agent -&gt; Admin</span>.
          </p>
          <p className="text-xs">
            Reseller integrations should submit to your platform queue only. External provider passthroughs that bypass
            agent/admin governance are not supported.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VTU purchase (single/bulk)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Create VTU orders via the same endpoint the portal uses. Your reseller wallet is
            debited automatically and the order appears under your Orders.
          </p>
          <ul className="text-xs space-y-1 list-disc pl-4">
            <li>
              <span className="font-medium text-foreground">Endpoint:</span> <span className="font-mono">POST /api/vtu/order</span>
            </li>
            <li>
              <span className="font-medium text-foreground">Body:</span>{" "}
              <span className="font-mono">&#123; productId, phoneNumber, quantity &#125;</span>
            </li>
            <li>
              Quantity can be 1 for single VTU, or a higher number for a batch order.
            </li>
            <li>
              On success, the response includes the created order and your wallet is debited atomically if
              balance is sufficient.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallet balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The reseller wallet page and dashboard use a simple wallet API that sums successful
            transactions for your user.
          </p>
          <ul className="text-xs space-y-1 list-disc pl-4">
            <li>
              <span className="font-medium text-foreground">Endpoint:</span> <span className="font-mono">GET /api/agent/wallet</span>
            </li>
            <li>
              <span className="font-medium text-foreground">Response fields:</span> balance,
              topups[] (recent credits)
            </li>
            <li>
              Your agent or admin can also credit your wallet manually using this API.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommended queue statuses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <p><span className="font-medium text-foreground">QUEUED</span> - Accepted in platform queue</p>
          <p><span className="font-medium text-foreground">FORWARDED_TO_AGENT</span> - Routed to agent stage</p>
          <p><span className="font-medium text-foreground">FORWARDED_TO_ADMIN</span> - Escalated to admin stage</p>
          <p><span className="font-medium text-foreground">COMPLETED</span> - Fulfilled successfully</p>
          <p><span className="font-medium text-foreground">FAILED</span> - Processing failed</p>
        </CardContent>
      </Card>
    </div>
  );
}