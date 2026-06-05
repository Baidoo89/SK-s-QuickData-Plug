import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminLayoutClient from "./_layout-client";
import { getRoleLandingPath } from "@/lib/role-landing";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  if (role !== "SUPERADMIN") {
    redirect(getRoleLandingPath(role));
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
