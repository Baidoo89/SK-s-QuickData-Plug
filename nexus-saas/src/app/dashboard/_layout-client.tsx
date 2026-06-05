"use client";
import React, { Suspense } from "react";
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import {
  Bell,
  ChevronDown,
  CircleUser,
  Home,
  LogOut,
  Menu,
  Package,
  Package2,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [ordersOpen, setOrdersOpen] = React.useState(false);
  const [usersOpen, setUsersOpen] = React.useState(false);
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const [walletOpen, setWalletOpen] = React.useState(false);
  const [systemOpen, setSystemOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  return (
    <div className="app-shell-bg min-h-screen w-full max-w-full overflow-x-hidden">
      <div data-collapsed={sidebarCollapsed} className={`portal-sidebar app-sidebar hidden border-r border-border/70 backdrop-blur-xl transition-[width] md:fixed md:left-0 md:top-0 md:z-30 md:block md:h-screen ${sidebarCollapsed ? "md:w-[72px]" : "md:w-[220px] lg:w-[280px]"}`}>
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className={`flex h-14 items-center border-b border-border/70 px-4 lg:h-[60px] ${sidebarCollapsed ? "justify-center lg:px-3" : "lg:px-6"}`}>
            <Link href="/" className={`${sidebarCollapsed ? "hidden" : "flex"} items-center gap-2 font-bold text-xl tracking-tight`}>
              <Package2 className="h-7 w-7 text-primary" />
              <span className="portal-sidebar-label text-primary">TechDalt</span>
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
          <div className="flex-1 overflow-y-auto">
            <nav className={`grid items-start px-2 text-xs font-medium gap-1.5 ${sidebarCollapsed ? "lg:px-2 pt-8" : "lg:px-4"}`}>
              {/* Core */}
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground transition-all hover:text-primary"
              >
                <Home className="h-4 w-4" />
                <span className="portal-sidebar-label">Dashboard</span>
              </Link>
              <Link
                href="/dashboard/setup"
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground transition-all hover:text-primary"
              >
                <Rocket className="h-4 w-4" />
                <span className="portal-sidebar-label">Launch Setup</span>
              </Link>
              <Link
                href="/dashboard/analytics"
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground transition-all hover:text-primary"
              >
                <LineChart className="h-4 w-4" />
                <span className="portal-sidebar-label">Advanced Analytics</span>
              </Link>

              <span className="mt-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Selling</span>

              {/* Orders */}
              <button
                type="button"
                onClick={() => sidebarCollapsed ? router.push("/dashboard/orders") : setOrdersOpen((prev) => !prev)}
                title="Orders"
                className="mt-1 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  <span className="portal-sidebar-label">Orders</span>
                </span>
                <ChevronDown className={`portal-sidebar-chevron h-3.5 w-3.5 transition-transform ${ordersOpen ? "rotate-180" : "rotate-0"}`} />
              </button>
              {ordersOpen && !sidebarCollapsed && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/orders"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    All Orders
                  </Link>
                  <Link
                    href="/dashboard/service-requests"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Service Requests
                  </Link>
                  <Link
                    href="/dashboard/payments"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Payment Records
                  </Link>
                </div>
              )}

              {/* Channels */}
              <button
                type="button"
                onClick={() => sidebarCollapsed ? router.push("/dashboard/agents") : setUsersOpen((prev) => !prev)}
                title="Channels"
                className="mt-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="portal-sidebar-label">Channels</span>
                </span>
                <ChevronDown className={`portal-sidebar-chevron h-3.5 w-3.5 transition-transform ${usersOpen ? "rotate-180" : "rotate-0"}`} />
              </button>
              {usersOpen && !sidebarCollapsed && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/users"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    User Directory
                  </Link>
                  <Link
                    href="/dashboard/agents"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Agents
                  </Link>
                  <Link
                    href="/dashboard/approvals"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Channel Approvals
                  </Link>
                  <Link
                    href="/dashboard/users/resellers"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Resellers
                  </Link>
                </div>
              )}

              {/* Catalog */}
              <button
                type="button"
                onClick={() => sidebarCollapsed ? router.push("/dashboard/products") : setPricingOpen((prev) => !prev)}
                title="Catalog"
                className="mt-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span className="portal-sidebar-label">Catalog</span>
                </span>
                <ChevronDown className={`portal-sidebar-chevron h-3.5 w-3.5 transition-transform ${pricingOpen ? "rotate-180" : "rotate-0"}`} />
              </button>
              {pricingOpen && !sidebarCollapsed && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/products"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Products & Prices
                  </Link>
                  <Link
                    href="/dashboard/products?tab=pricing_profiles"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Pricing Profiles
                  </Link>
                </div>
              )}

              {/* Finance */}
              <button
                type="button"
                onClick={() => sidebarCollapsed ? router.push("/dashboard/wallet") : setWalletOpen((prev) => !prev)}
                title="Finance"
                className="mt-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  <span className="portal-sidebar-label">Finance</span>
                </span>
                <ChevronDown className={`portal-sidebar-chevron h-3.5 w-3.5 transition-transform ${walletOpen ? "rotate-180" : "rotate-0"}`} />
              </button>
              {walletOpen && !sidebarCollapsed && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/withdrawals"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Withdrawals
                  </Link>
                  <Link
                    href="/dashboard/wallet?tab=manual_credit"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Wallet Top Up
                  </Link>
                  <Link
                    href="/dashboard/subscription"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Subscription
                  </Link>
                </div>
              )}

              <span className="mt-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">System</span>

              {/* System */}
              <button
                type="button"
                onClick={() => sidebarCollapsed ? router.push("/dashboard/system/logs") : setSystemOpen((prev) => !prev)}
                title="System"
                className="mt-1 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <LineChart className="h-4 w-4" />
                  <span className="portal-sidebar-label">System</span>
                </span>
                <ChevronDown className={`portal-sidebar-chevron h-3.5 w-3.5 transition-transform ${systemOpen ? "rotate-180" : "rotate-0"}`} />
              </button>
              {systemOpen && !sidebarCollapsed && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/system/logs"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Audit Logs
                  </Link>
                </div>
              )}

              <span className="mt-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Settings</span>

              {/* Settings */}
              <button
                type="button"
                onClick={() => sidebarCollapsed ? router.push("/dashboard/settings") : setSettingsOpen((prev) => !prev)}
                title="Settings"
                className="mt-1 mb-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="portal-sidebar-label">Settings</span>
                </span>
                <ChevronDown className={`portal-sidebar-chevron h-3.5 w-3.5 transition-transform ${settingsOpen ? "rotate-180" : "rotate-0"}`} />
              </button>
              {settingsOpen && !sidebarCollapsed && (
                <div className="mt-1 ml-4 mb-2 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/settings?tab=api"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    API Settings
                  </Link>
                  <Link
                    href="/dashboard/settings?tab=system"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    System Settings
                  </Link>
                </div>
              )}
            </nav>
          </div>
          {/* Upgrade card hidden while subscriptions are disabled */}
        </div>
      </div>
      <div className={`flex min-h-screen min-w-0 flex-col ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[220px] lg:pl-[280px]"}`}>
        <header className={`app-topbar fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-4 border-b border-border/70 px-4 backdrop-blur-xl lg:h-[60px] lg:px-6 ${sidebarCollapsed ? "md:left-[72px]" : "md:left-[220px] lg:left-[280px]"}`}>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="app-sidebar flex flex-col border-r border-border/70 backdrop-blur-xl">
              <nav className="grid gap-1.5 text-sm font-medium max-h-[calc(100vh-4rem)] overflow-y-auto pr-1">
                <SheetClose asChild>
                  <Link
                    href="/"
                    className="flex items-center gap-2 text-lg font-bold text-primary"
                  >
                    <Package2 className="h-7 w-7" />
                    TechDalt
                  </Link>
                </SheetClose>

                {/* Dashboard */}
                <SheetClose asChild>
                  <Link
                    href="/dashboard"
                    className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <Home className="h-5 w-5" />
                    Dashboard
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href="/dashboard/setup"
                    className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <Rocket className="h-5 w-5" />
                    Launch Setup
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href="/dashboard/analytics"
                    className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <LineChart className="h-5 w-5" />
                    Advanced Analytics
                  </Link>
                </SheetClose>

                <span className="mt-3 px-1 text-[10px] font-semibold uppercase text-muted-foreground">Selling</span>

                {/* Orders */}
                <button
                  type="button"
                  onClick={() => setOrdersOpen((prev) => !prev)}
                  className="mt-1 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <ShoppingCart className="h-5 w-5" />
                    Orders
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ordersOpen ? "rotate-180" : "rotate-0"}`} />
                </button>
                {ordersOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/orders"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        All Orders
                      </Link>
                    </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/dashboard/service-requests"
                      className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Service Requests
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/dashboard/payments"
                      className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Payment Records
                    </Link>
                  </SheetClose>
                </div>
              )}

                {/* Channels */}
                <button
                  type="button"
                  onClick={() => setUsersOpen((prev) => !prev)}
                  className="mt-2 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Users className="h-5 w-5" />
                    Channels
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${usersOpen ? "rotate-180" : "rotate-0"}`} />
                </button>
                {usersOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/users"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        User Directory
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/approvals"
                        className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        Channel Approvals
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/agents"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Agents
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/users/resellers"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Resellers
                      </Link>
                    </SheetClose>
                  </div>
                )}

                {/* Catalog */}
                <button
                  type="button"
                  onClick={() => setPricingOpen((prev) => !prev)}
                  className="mt-2 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Package className="h-5 w-5" />
                    Catalog
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${pricingOpen ? "rotate-180" : "rotate-0"}`} />
                </button>
                {pricingOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/products"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Products & Prices
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/products?tab=pricing_profiles"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Pricing Profiles
                      </Link>
                    </SheetClose>
                  </div>
                )}

                {/* Finance */}
                <button
                  type="button"
                  onClick={() => setWalletOpen((prev) => !prev)}
                  className="mt-2 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Wallet className="h-5 w-5" />
                    Finance
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${walletOpen ? "rotate-180" : "rotate-0"}`} />
                </button>
                {walletOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/withdrawals"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Withdrawals
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/wallet?tab=manual_credit"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Wallet Top Up
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/subscription"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Subscription
                      </Link>
                    </SheetClose>
                  </div>
                )}

                <span className="mt-3 px-1 text-[10px] font-semibold uppercase text-muted-foreground">System</span>

                {/* System */}
                <button
                  type="button"
                  onClick={() => setSystemOpen((prev) => !prev)}
                  className="mt-1 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Bell className="h-5 w-5" />
                    System
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${systemOpen ? "rotate-180" : "rotate-0"}`} />
                </button>
                {systemOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/system/logs"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Audit Logs
                      </Link>
                    </SheetClose>
                  </div>
                )}

                <span className="mt-3 px-1 text-[10px] font-semibold uppercase text-muted-foreground">Settings</span>

                {/* Settings */}
                <button
                  type="button"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  className="mt-1 mb-2 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Settings className="h-5 w-5" />
                    Settings
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? "rotate-180" : "rotate-0"}`} />
                </button>
                {settingsOpen && (
                  <div className="mt-1 ml-6 mb-2 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/settings?tab=api"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        API Settings
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/settings?tab=system"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        System Settings
                      </Link>
                    </SheetClose>
                  </div>
                )}

                <span className="mt-3 px-1 text-[10px] font-semibold uppercase text-muted-foreground">Account</span>
                <SheetClose asChild>
                  <Link
                    href="/dashboard/settings"
                    className="mt-1 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="mr-3 h-5 w-5" />
                    Profile & Settings
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="mx-[-0.65rem] mt-1 flex w-[calc(100%+1.3rem)] items-center rounded-xl px-3 py-2 text-left text-[11px] font-semibold text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="mr-3 h-5 w-5" />
                    Logout
                  </button>
                </SheetClose>
              </nav>
              {/* Upgrade card hidden while subscriptions are disabled */}
            </SheetContent>
          </Sheet>
          <div className="min-w-0 w-full flex-1 overflow-x-hidden">
            <form action="/dashboard/orders" method="get">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  name="q"
                  placeholder="Search orders, customers, phones..."
                  className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
                />
              </div>
            </form>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="rounded-full">
                <CircleUser className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/support">Support</Link>
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading dashboard...</div>}>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
