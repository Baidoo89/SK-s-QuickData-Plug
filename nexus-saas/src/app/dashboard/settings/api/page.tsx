import { PageHeader } from "@/components/ui/page-header"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { ApiKeys } from "@/components/dashboard/api-keys"
import { getSettingsContext } from "../_lib"

export default async function ApiSettingsPage() {
  const user = await getSettingsContext()
  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization yet." />
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="API" description="Keys for external checkout integrations." />
      <div className="max-w-4xl">
        <ApiKeys apiKeys={user.organization.apiKeys} />
      </div>
    </div>
  )
}
