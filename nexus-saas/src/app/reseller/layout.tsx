import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ResellerLayoutClient from "./_layout-client";
import { getRoleLandingPath } from "@/lib/role-landing";

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  // Check authentication
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  // Reseller portal is only for resellers. Agents use /agent.
  if (role !== "RESELLER") {
    redirect(getRoleLandingPath(role));
  }

  return <ResellerLayoutClient>{children}</ResellerLayoutClient>;
}
