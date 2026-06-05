import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AgentLayoutClient from "@/app/agent/layout-client";
import { getRoleLandingPath } from "@/lib/role-landing";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  // Check authentication
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  // Agent portal is only for agents. Resellers use /reseller.
  if (role !== "AGENT") {
    redirect(getRoleLandingPath(role));
  }

  return <AgentLayoutClient>{children}</AgentLayoutClient>;
}
