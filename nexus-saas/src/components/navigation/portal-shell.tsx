"use client"

import { Suspense, useState, type ReactNode, type ComponentType } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { signOut } from "next-auth/react"
import { ChevronDown, CircleUser, FileText, Home, Menu, Package, Package2, PanelLeftClose, PanelLeftOpen, Rocket, Search, Settings, ShoppingBag, Store, Users, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type Role = "owner" | "agent" | "reseller"
type NavLink = { label: string; href: string; icon: ComponentType<{ className?: string }> }
type NavGroup = { label: string; links: NavLink[] }

const link = (label: string, href: string, icon: NavLink["icon"] = FileText): NavLink => ({ label, href, icon })

function navigation(role: Role): { home: string; title: string; primary: NavLink[]; groups: NavGroup[] } {
  if (role === "owner") return {
    home: "/dashboard", title: "Store owner",
    primary: [link("Overview", "/dashboard", Home), link("Setup", "/dashboard/setup", Rocket), link("Buy", "/dashboard/buy/single", ShoppingBag), link("Orders", "/dashboard/orders", FileText), link("Products", "/dashboard/products", Package), link("Wallet", "/dashboard/wallet", Wallet)],
    groups: [
      { label: "Team", links: [link("Team home", "/dashboard/team", Users), link("Agents", "/dashboard/agents", Users), link("Resellers", "/dashboard/users/resellers", Users), link("Approvals", "/dashboard/approvals"), link("Directory", "/dashboard/users")] },
      { label: "Sales", links: [link("Sales overview", "/dashboard/analytics"), link("Services", "/dashboard/service-requests"), link("Payments", "/dashboard/payments"), link("Pricing", "/dashboard/products?tab=pricing_profiles"), link("Review", "/dashboard/reconciliation", FileText)] },
      { label: "Finance", links: [link("Withdrawals", "/dashboard/withdrawals"), link("Credit", "/dashboard/credit", Wallet), link("Subscription", "/dashboard/subscription")] },
      { label: "Settings", links: [link("Business", "/dashboard/settings/business", Settings), link("Account", "/dashboard/settings/account"), link("Payments", "/dashboard/settings/payments"), link("Delivery", "/dashboard/settings/delivery"), link("API", "/dashboard/settings/api"), link("Activity", "/dashboard/system/logs"), link("Support", "/dashboard/support")] },
    ],
  }
  const base = `/${role}`
  return {
    home: base, title: role === "agent" ? "Agent" : "Reseller",
    primary: [link("Overview", base, Home), link("Buy", `${base}/buy/single`, ShoppingBag), link("Orders", `${base}/orders`, FileText), link("Wallet", `${base}/wallet`, Wallet), link("Shop link", `${base}/storefronts`, Store)],
    groups: [
      ...(role === "agent" ? [{ label: "Team", links: [link("Resellers", "/agent/resellers", Users), link("Approvals", "/agent/approvals"), link("Customers", "/agent/customers")] }] : []),
      { label: "Sales", links: [...(role === "agent" ? [link("Bulk buy", "/agent/buy/bulk")] : []), link("Prices", `${base}/storefront-pricing`), link("Services", `${base}/service-requests`), link("Withdrawals", `${base}/withdrawals`), link("Credit", `${base}/credit`, Wallet), link("API", `${base}/api-docs`)] },
      { label: "Account", links: [link("Profile", `${base}/account`, CircleUser)] },
    ],
  }
}

function PortalShellInner({ role, children }: { role: Role; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const config = navigation(role)
  const isActive = (item: NavLink) => {
    if (item.href.includes("#")) return false
    const [path, query] = item.href.split("?")
    if (pathname !== path && !(path !== config.home && pathname.startsWith(`${path}/`))) return false
    if (query) return new URLSearchParams(query).get("tab") === searchParams.get("tab")
    return !searchParams.get("tab")
  }

  function renderLink(item: NavLink, mobile: boolean) {
    const Icon = item.icon
    const active = isActive(item)
    const body = (
      <Link key={item.href} href={item.href} title={item.label} aria-current={active ? "page" : undefined}
        className={`flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"} ${collapsed && !mobile ? "justify-center" : ""}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className={collapsed && !mobile ? "sr-only" : "min-w-0 break-words"}>{item.label}</span>
      </Link>
    )
    return mobile ? <SheetClose asChild key={item.href}>{body}</SheetClose> : body
  }

  function nav(mobile = false) {
    return (
      <nav aria-label={`${config.title} navigation`} className="space-y-3 px-3 py-4">
        <div className="space-y-0.5">{config.primary.map(item => renderLink(item, mobile))}</div>
        {config.groups.map(group => (
          <details key={`${group.label}-${pathname}-${searchParams.toString()}`} open={group.links.some(isActive) || undefined} className="group pt-2">
            <summary title={group.label} className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className={collapsed && !mobile ? "sr-only" : ""}>{group.label}</span>
              <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" />
            </summary>
            <div className="mt-0.5 space-y-0.5">{group.links.map(item => renderLink(item, mobile))}</div>
          </details>
        ))}
      </nav>
    )
  }

  return (
    <div className="app-shell-bg min-h-screen w-full overflow-x-hidden">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-30 hidden border-r border-border/70 md:flex md:flex-col ${collapsed ? "w-[72px]" : "w-[240px]"}`}>
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border/70 px-3">
          {!collapsed && <Link href={config.home} className="flex min-w-0 flex-1 items-center gap-2 font-bold text-primary"><Package2 className="h-6 w-6 shrink-0" />TechDalt</Link>}
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">{nav()}</div>
      </aside>
      <div className={collapsed ? "md:pl-[72px]" : "md:pl-[240px]"}>
        <header className="app-topbar sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-border/60 px-4 backdrop-blur-xl">
          <Sheet>
            <SheetTrigger asChild><Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent side="left" aria-describedby={undefined} className="app-sidebar w-[280px] overflow-y-auto p-0">
              <SheetTitle className="border-b border-border px-6 py-5 text-base font-bold">TechDalt · {config.title}</SheetTitle>
              {nav(true)}
            </SheetContent>
          </Sheet>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{config.title}</p>
          {role === "owner" && <form action="/dashboard/orders" method="get" className="hidden w-full max-w-xs sm:block">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input type="search" name="q" aria-label="Search orders" placeholder="Search orders or phone numbers" className="pl-9" /></div>
          </form>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="Open account menu"><CircleUser className="h-5 w-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{config.title}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href={role === "owner" ? "/dashboard/settings/account" : `/${role}/account`}>My account</Link></DropdownMenuItem>
              {role === "owner" && <DropdownMenuItem asChild><Link href="/dashboard/support">Support</Link></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { void signOut({ callbackUrl: "/login" }) }}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main id="main-content" tabIndex={-1} className="content-sheen flex min-w-0 flex-col gap-4 p-3 outline-none sm:gap-6 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}

export function PortalShell(props: { role: Role; children: ReactNode }) {
  return <Suspense fallback={<div className="p-4 text-sm">Loading your workspace...</div>}><PortalShellInner {...props} /></Suspense>
}
