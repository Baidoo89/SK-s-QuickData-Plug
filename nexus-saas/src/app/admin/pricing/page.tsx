import { redirect } from "next/navigation"

export default function AdminPricingScopeRedirect() {
  redirect("/admin/subscriptions")
}
