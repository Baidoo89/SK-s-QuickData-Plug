import Link from "next/link"
import type { ReactNode } from "react"

const sections = [
  ["Business", "/dashboard/settings/business"],
  ["Account", "/dashboard/settings/account"],
  ["Payments", "/dashboard/settings/payments"],
  ["Delivery", "/dashboard/settings/delivery"],
  ["API", "/dashboard/settings/api"],
] as const

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="portal-page flex min-w-0 flex-col gap-5 overflow-x-hidden sm:gap-6">
      <nav aria-label="Settings sections" className="flex min-w-0 flex-wrap gap-1.5 rounded-lg border border-border/70 bg-card p-2">
        {sections.map(([label, href]) => (
          <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
