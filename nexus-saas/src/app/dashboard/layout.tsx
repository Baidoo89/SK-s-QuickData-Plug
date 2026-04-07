import { redirect } from "next/navigation";
import { auth } from "@/auth";
import DashboardLayoutClient from "./_layout-client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Check authentication
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  // Check for SUBSCRIBER role (organization owner/admin)
  if (role !== "SUBSCRIBER") {
    redirect("/");
  }

  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
