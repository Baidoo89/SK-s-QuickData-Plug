import { redirect } from "next/navigation"

export default function DashboardManualQueueRedirectPage() {
  redirect("/dashboard/orders")
}
