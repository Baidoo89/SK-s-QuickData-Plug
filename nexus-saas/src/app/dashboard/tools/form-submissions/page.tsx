import { redirect } from "next/navigation"

export default function DashboardFormSubmissionsRedirectPage() {
  redirect("/dashboard/orders")
}
