import { redirect } from "next/navigation";

export default function DashboardCustomersRedirectPage() {
  redirect("/dashboard/users");
}
