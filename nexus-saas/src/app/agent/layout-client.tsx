"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Package2,
  Home,
  Users,
  Wallet,
  ShoppingBag,
  FileText,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Menu,
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

  const navItems = useMemo<NavItem[]>(
    () => [
      { href: "/agent", label: "Dashboard", icon: Home },
      { href: "/agent/wallet", label: "Wallet", icon: Wallet },
      {
        label: "Buy data",
        icon: ShoppingBag,
        key: "buy",
        children: [
          { href: "/agent/buy/single", label: "Single purchase" },
          { href: "/agent/buy/bulk", label: "Bulk purchase" },
        ],
      },
      { href: "/agent/orders", label: "Orders", icon: FileText },
      { href: "/agent/resellers", label: "Resellers", icon: Users },
      { href: "/agent/api-docs", label: "API docs", icon: FileText },
      { href: "/agent/account", label: "Account", icon: CreditCard },
    ],
    [],
  )

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const renderNavItem = (item: NavItem, mobile = false) => {
    if ("children" in item) {
      const sectionKey = item.key || item.label.toLowerCase()
      const isSectionActive = item.children.some((child) => pathname.startsWith(child.href))
      const isOpen = openSections[sectionKey] || isSectionActive
      const Icon = item.icon

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
              <span>{item.label}</span>
            </span>
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {isOpen && (
            <div className="ml-6 space-y-0.5">
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
        className={[
          "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : mobile
            ? "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
            : "text-muted-foreground hover:text-primary",
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
      </Link>
    )

    return mobile ? <SheetClose asChild key={item.href}>{link}</SheetClose> : link
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.10),transparent_24%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--background)))]">
      <aside className="hidden border-r border-border/70 bg-[hsl(var(--blue-ice))]/85 backdrop-blur-xl md:fixed md:left-0 md:top-0 md:z-30 md:block md:h-screen md:w-[220px] lg:w-[260px]">
        <div className="flex h-full max-h-screen flex-col">
          <div className="flex h-14 items-center border-b border-border/70 px-4 lg:h-[60px] lg:px-6">
            <Link href="/agent" className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <Package2 className="h-6 w-6 text-primary" />
              <span className="text-primary">Agent Panel</span>
            </Link>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3 text-xs font-medium lg:px-4">
            {navItems.map((item) => renderNavItem(item, false))}
          </nav>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col md:pl-[220px] lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-[hsl(var(--blue-ice))]/70 px-3 sm:px-4 lg:h-[60px] lg:px-6 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] border-r border-border/70 bg-[hsl(var(--blue-ice))]/85 p-0 backdrop-blur-xl">
                <div className="flex h-14 items-center border-b border-border/70 px-4">
                  <Link href="/agent" className="flex items-center gap-2 font-bold text-lg tracking-tight text-primary">
                    <Package2 className="h-5 w-5" />
                    <span>Agent Panel</span>
                  </Link>
                </div>
                <nav className="space-y-1 px-3 py-4 text-sm">
                  {navItems.map((item) => renderNavItem(item, true))}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex flex-col">
              <span className="truncate text-sm font-semibold leading-tight">Agent Portal</span>
              <span className="hidden truncate text-xs leading-tight text-muted-foreground sm:block">
                Buy data, manage resellers, and track wallet activity.
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
                <Link href="/store">Open store</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/login">Logout</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex flex-1 flex-col gap-4 overflow-x-hidden bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.4))] p-4 lg:gap-6 lg:p-6 dark:bg-[linear-gradient(to_bottom,rgba(15,23,42,0.0),rgba(15,23,42,0.32))]">
          {children}
        </main>
      </div>
    </div>
  )
}
