"use client"

import type { ReactNode } from "react"
import { PortalShell } from "@/components/navigation/portal-shell"

export default function Layout({ children }: { children: ReactNode }) {
  return <PortalShell role="reseller">{children}</PortalShell>
}
