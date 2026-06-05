import { redirect } from "next/navigation";
import { auth } from "@/auth";
import DashboardLayoutClient from "./_layout-client";
import { getRoleLandingPath } from "@/lib/role-landing";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  if (role !== "SUBSCRIBER") {
    redirect(getRoleLandingPath(role));
  }

  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
