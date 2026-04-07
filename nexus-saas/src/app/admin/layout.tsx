import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminLayoutClient from "./_layout-client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Check authentication
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  // Check for admin portal role.
  if (role !== "SUBSCRIBER" && role !== "SUPERADMIN") {
    redirect("/");
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
