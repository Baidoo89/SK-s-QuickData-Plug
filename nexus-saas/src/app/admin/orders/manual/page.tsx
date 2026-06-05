import { redirect } from "next/navigation"

export default function AdminManualOrdersRedirect() {
  redirect("/admin/orders?dispatch=MANUAL")
}
