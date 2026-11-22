import { PageHeader } from "@/components/ui/page-header"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { ProviderConnectionCard } from "@/components/admin/provider-connection-card"
import { DispatchPolicyCard } from "@/components/admin/dispatch-policy-card"
import { DispatchHealthCard } from "@/components/admin/dispatch-health-card"
import { ProviderProductMappingCard } from "@/components/dashboard/provider-product-mapping-card"
import { getSettingsContext } from "../_lib"

export default async function DeliverySettingsPage() {
  const user = await getSettingsContext()
  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization yet." />
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Delivery" description="Provider connection and order processing." />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-5">
          <ProviderConnectionCard endpoint="/api/dashboard/provider-connection" />
          <DispatchPolicyCard endpoint="/api/dashboard/dispatch-policy" />
          <ProviderProductMappingCard />
        </div>
        <div className="min-w-0">
          <DispatchHealthCard endpoint="/api/dashboard/dispatch-health" />
        </div>
      </div>
    </div>
  )
}
