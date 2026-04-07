import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AgentLayoutClient from "@/app/agent/layout-client";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  // Check authentication
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;

  // Check for AGENT or RESELLER role
  if (role !== "AGENT" && role !== "RESELLER") {
    redirect("/");
  }

  return <AgentLayoutClient>{children}</AgentLayoutClient>;
}
