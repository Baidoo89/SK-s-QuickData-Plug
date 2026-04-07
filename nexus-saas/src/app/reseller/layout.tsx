import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ResellerLayoutClient from "./_layout-client";

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  // Check authentication
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  // Check for RESELLER role (also allow AGENT for backwards compatibility)
  if (role !== "RESELLER" && role !== "AGENT") {
    redirect("/");
  }

  return <ResellerLayoutClient>{children}</ResellerLayoutClient>;
}
