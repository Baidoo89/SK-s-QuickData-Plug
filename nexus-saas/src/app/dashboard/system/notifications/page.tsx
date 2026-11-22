import { redirect } from "next/navigation"

export default function DashboardNotificationsRedirectPage() {
  redirect("/dashboard/system/logs")
}
