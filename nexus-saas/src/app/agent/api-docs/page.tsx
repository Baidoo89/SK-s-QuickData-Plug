import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function AgentApiDocsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">API Docs</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Agent integration guide for your organization queue. Orders created from your systems are accepted in-app,
          then processed through your operational flow to Admin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security model (current backend)</CardTitle>
          <CardDescription className="text-xs">
            Endpoints are protected with authenticated sessions and role guards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="text-xs space-y-1 list-disc pl-4">
            <li>Only authenticated users can call protected endpoints.</li>
            <li>Only AGENT and RESELLER roles can create VTU orders.</li>
            <li>Requests are org-scoped; users cannot place orders for another organization.</li>
            <li>Wallet balance is validated before order creation and debit happens transactionally.</li>
          </ul>
          <div className="flex flex-wrap gap-2 text-xs mt-1">
            <Badge variant="outline">requireAuth()</Badge>
            <Badge variant="outline">Role guard</Badge>
            <Badge variant="outline">Org scoped</Badge>
            <Badge variant="outline">Transactional debit</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order flow policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Your queue model is:
            <span className="font-medium text-foreground"> Reseller -&gt; Agent -&gt; Admin</span>.
          </p>
          <p className="text-xs">
            Integrations should submit into your platform queue only. Do not connect directly to external providers from
            reseller/agent systems in a way that bypasses your internal controls.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Core endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="text-xs space-y-1 list-disc pl-4">
            <li><span className="font-medium text-foreground">POST /api/vtu/order</span> - Create single or bulk VTU order (quantity controls batch size).</li>
            <li><span className="font-medium text-foreground">GET /api/agent/orders</span> - List organization orders.</li>
            <li><span className="font-medium text-foreground">GET /api/agent/wallet</span> - Read wallet balance and top ups.</li>
            <li><span className="font-medium text-foreground">GET /api/resellers</span> - List resellers owned by the current agent.</li>
            <li><span className="font-medium text-foreground">POST /api/resellers</span> - Create reseller account + invite link + email attempt.</li>
            <li><span className="font-medium text-foreground">GET /api/resellers/:id</span> - Get reseller profile (agent-owned only).</li>
            <li><span className="font-medium text-foreground">PUT /api/resellers/:id</span> - Update reseller name or active status.</li>
            <li><span className="font-medium text-foreground">DELETE /api/resellers/:id</span> - Remove reseller account.</li>
            <li><span className="font-medium text-foreground">GET /api/reseller-prices?resellerId=:id</span> - Read reseller price overrides.</li>
            <li><span className="font-medium text-foreground">POST /api/reseller-prices</span> - Upsert reseller price override.</li>
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Invite links are always returned in response data. If email delivery fails, copy the link from the portal and send manually.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Example: create VTU order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>Endpoint: <span className="font-mono">POST /api/vtu/order</span></p>
          <pre className="overflow-x-auto rounded-md bg-muted/60 p-2 text-[11px]">
{`{
  "productId": "prod_xxx",
  "phoneNumber": "0244000000",
  "quantity": 1
}`}
          </pre>
          <p>For bulk, keep one representative phone number and set a higher quantity to create one batch order.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommended queue statuses</CardTitle>
          <CardDescription className="text-xs">Use these in downstream dashboards/reports for clarity.</CardDescription>
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
  )
}
