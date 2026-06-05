import { redirect } from "next/navigation"

export default function DashboardComplaintsRedirectPage() {
  redirect("/dashboard/orders")
}
