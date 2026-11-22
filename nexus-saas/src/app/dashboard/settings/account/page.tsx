import { PageHeader } from "@/components/ui/page-header"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { PhoneVerificationCard } from "@/components/auth/phone-verification-card"
import { getSettingsContext } from "../_lib"

export default async function AccountSettingsPage() {
  const user = await getSettingsContext()
  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization yet." />
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Account" description="Phone verification for security and alerts." />
      <div className="max-w-2xl">
        <PhoneVerificationCard initialPhoneNumber={user.phoneNumber} verified={Boolean(user.phoneVerified)} />
      </div>
    </div>
  )
}
