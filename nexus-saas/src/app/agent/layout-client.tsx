"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  Package2,
  Home,
  Users,
  Store,
  Wallet,
  ShoppingBag,
  FileText,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  CircleUser,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type NavChild = {
  href: string
  label: string
}

type NavItem =
  | {
      href: string
      label: string
      icon: React.ComponentType<{ className?: string }>
    }
  | {
      label: string
      icon: React.ComponentType<{ className?: string }>
      key: string
      children: NavChild[]
    }

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const navItems = useMemo<NavItem[]>(
    () => [
      { href: "/agent", label: "Dashboard", icon: Home },
      {
        label: "Finance",
        icon: Wallet,
        key: "wallet",
        children: [
          { href: "/agent/wallet", label: "Wallet Top Up" },
          { href: "/agent/withdrawals", label: "Withdrawals" },
        ],
      },
      {
        label: "Sales",
        icon: ShoppingBag,
        key: "buy",
        children: [
          { href: "/agent/buy/single", label: "Single Purchase" },
          { href: "/agent/buy/bulk", label: "Bulk Purchase" },
        ],
      },
      { href: "/agent/orders", label: "Orders", icon: FileText },
      {
        label: "Reseller Network",
        icon: Users,
        key: "resellers",
        children: [
          { href: "/agent/resellers", label: "Manage Resellers" },
          { href: "/agent/approvals", label: "Reseller Approvals" },
        ],
      },
      { href: "/agent/customers", label: "Customers", icon: Users },
      {
        label: "Storefront",
        icon: Store,
        key: "storefront",
        children: [
          { href: "/agent/storefronts", label: "Share Links" },
          { href: "/agent/storefront-pricing", label: "Customer Prices" },
          { href: "/agent/service-requests", label: "Service Requests" },
        ],
      },
      { href: "/agent/api-docs", label: "API Docs", icon: FileText },
      { href: "/agent/account", label: "Account", icon: CreditCard },
    ],
    [],
  )

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const renderNavItem = (item: NavItem, mobile = false, collapsed = false) => {
    if ("children" in item) {
      const sectionKey = item.key || item.label.toLowerCase()
      const isSectionActive = item.children.some((child) => pathname.startsWith(child.href))
      const isOpen = openSections[sectionKey] || isSectionActive
      const Icon = item.icon

      if (collapsed && !mobile) {
        const href = item.children[0]?.href || "/agent"
        return (
          <Link
            key={sectionKey}
            href={href}
            title={item.label}
            className={[
              "flex items-center justify-center rounded-lg px-3 py-2 transition-colors",
              isSectionActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-primary",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            <span className="sr-only">{item.label}</span>
          </Link>
        )
      }

      return (
        <div key={sectionKey} className="space-y-0.5">
          <button
            type="button"
            onClick={() => toggleSection(sectionKey)}
            className={[
              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
              isSectionActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-primary",
            ].join(" ")}
          >
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="portal-sidebar-label">{item.label}</span>
            </span>
            {isOpen ? <ChevronDown className="portal-sidebar-chevron h-3 w-3" /> : <ChevronRight className="portal-sidebar-chevron h-3 w-3" />}
          </button>
          {isOpen && !collapsed && (
            <div className="portal-sidebar-subnav ml-6 space-y-0.5">
              {item.children.map((child) => {
                const isChildActive = pathname === child.href
                const link = (
                  <Link
                    href={child.href}
                    className={[
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors",
                      isChildActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-primary",
                    ].join(" ")}
                  >
                    <span>{child.label}</span>
                  </Link>
                )

                return mobile ? <SheetClose asChild key={child.href}>{link}</SheetClose> : link
              })}
            </div>
          )}
        </div>
      )
    }

    const Icon = item.icon
    const isActive = pathname === item.href
    const link = (
      <Link
        href={item.href}
        title={item.label}
        className={[
          "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : mobile
            ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            : "text-muted-foreground hover:text-primary",
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
        <span className="portal-sidebar-label">{item.label}</span>
      </Link>
    )

    return mobile ? <SheetClose asChild key={item.href}>{link}</SheetClose> : link
  }

  return (
    <div className="app-shell-bg min-h-screen w-full overflow-x-hidden">
      <aside data-collapsed={sidebarCollapsed} className={`portal-sidebar app-sidebar hidden border-r border-border/70 backdrop-blur-xl md:fixed md:left-0 md:top-0 md:z-30 md:block md:h-screen ${sidebarCollapsed ? "md:w-[72px]" : "md:w-[220px] lg:w-[260px]"}`}>
        <div className="flex h-full max-h-screen flex-col">
          <div className={`flex h-14 items-center border-b border-border/70 px-4 lg:h-[60px] ${sidebarCollapsed ? "justify-center lg:px-3" : "lg:px-6"}`}>
            <Link href="/agent" className={`${sidebarCollapsed ? "hidden" : "flex"} min-w-0 items-center gap-3 font-extrabold text-xl tracking-normal`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Package2 className="h-5 w-5" />
              </span>
              <span className="portal-sidebar-label truncate text-primary">Agent Panel</span>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={sidebarCollapsed ? "h-8 w-8" : "ml-auto h-8 w-8"}
              onClick={() => setSidebarCollapsed((value) => !value)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              <span className="sr-only">{sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
            </Button>
          </div>
          <nav className={`flex-1 space-y-1 overflow-y-auto px-3 py-3 text-xs font-medium ${sidebarCollapsed ? "lg:px-3" : "lg:px-4"}`}>
            {navItems.map((item) => renderNavItem(item, false, sidebarCollapsed))}
          </nav>
        </div>
      </aside>

      <div className={`flex min-h-screen min-w-0 flex-col ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[220px] lg:pl-[260px]"}`}>
        <header className={`app-topbar fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border/70 px-3 backdrop-blur-xl sm:px-4 lg:h-[60px] lg:px-6 ${sidebarCollapsed ? "md:left-[72px]" : "md:left-[220px] lg:left-[260px]"}`}>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="app-sidebar w-[280px] border-r border-border/70 p-0 backdrop-blur-xl">
                <div className="flex h-14 items-center border-b border-border/70 px-4">
                  <Link href="/agent" className="flex items-center gap-2 font-bold text-lg tracking-tight text-primary">
                    <Package2 className="h-5 w-5" />
                    <span>Agent Panel</span>
                  </Link>
                </div>
                <nav className="max-h-[calc(100vh-3.5rem)] space-y-1 overflow-y-auto px-3 py-4 text-sm">
                  {navItems.map((item) => renderNavItem(item, true))}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex flex-col">
              <span className="truncate text-sm font-semibold leading-tight">Agent Portal</span>
              <span className="hidden truncate text-xs leading-tight text-muted-foreground sm:block">
                Sell data, manage resellers, and track wallet activity.
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full">
                <CircleUser className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Agent</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/agent/storefronts">Storefront Links</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onSelect={(event) => {
                  event.preventDefault()
                  void signOut({ callbackUrl: "/login" })
                }}
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="content-sheen flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden p-4 pt-16 lg:gap-6 lg:p-6 lg:pt-[76px]">
          {children}
        </main>
      </div>
    </div>
  )
}
