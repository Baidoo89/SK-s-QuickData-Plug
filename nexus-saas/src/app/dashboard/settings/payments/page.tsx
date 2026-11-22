import { PageHeader } from "@/components/ui/page-header"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { PaymentSettingsCard } from "@/components/dashboard/payment-settings-card"
import { getSettingsContext } from "../_lib"

export default async function PaymentSettingsPage() {
  const user = await getSettingsContext()
  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization yet." />
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Payments" description="Paystack for customer checkout and wallet funding." />
      <div className="max-w-3xl">
        <PaymentSettingsCard />
      </div>
    </div>
  )
}
