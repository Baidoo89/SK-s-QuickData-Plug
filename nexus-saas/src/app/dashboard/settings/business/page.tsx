import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { SettingsForm } from "@/components/dashboard/settings-form"
import { getSettingsContext } from "../_lib"

export default async function BusinessSettingsPage() {
  const user = await getSettingsContext()
  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization yet." />
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Business" description="Shop name and public identity." actions={<Button asChild variant="outline" size="sm"><Link href="/dashboard/setup">Open setup</Link></Button>} />
      <div className="max-w-2xl">
        <SettingsForm initialName={user.organization.name} />
      </div>
    </div>
  )
}
