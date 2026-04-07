"use client";
import React, { Suspense } from "react";
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { signOut } from "next-auth/react"
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import {
  Bell,
  CircleUser,
  FileText,
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
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isProductsPage = pathname === "/dashboard/products";
  const tab = searchParams.get("tab");
  const [ordersOpen, setOrdersOpen] = React.useState(false);
  const [usersOpen, setUsersOpen] = React.useState(false);
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const [walletOpen, setWalletOpen] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [systemOpen, setSystemOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.10),transparent_24%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--background)))]">
      <div className="sticky top-0 hidden h-screen border-r border-border/70 bg-[hsl(var(--blue-ice))]/85 backdrop-blur-xl md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b border-border/70 px-4 lg:h-[60px] lg:px-6">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <Package2 className="h-7 w-7 text-primary" />
              <span className="text-primary">TeChDalt</span>
            </Link>
            <Button variant="outline" size="icon" className="ml-auto h-8 w-8">
              <Bell className="h-4 w-4" />
              <span className="sr-only">Toggle notifications</span>
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <nav className="grid items-start px-2 text-xs font-medium lg:px-4 gap-1.5">
              {/* Core */}
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground transition-all hover:text-primary"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/dashboard/analytics"
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground transition-all hover:text-primary"
              >
                <LineChart className="h-4 w-4" />
                Advanced Analytics
              </Link>

              <span className="mt-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Management</span>

              {/* Orders */}
              <button
                type="button"
                onClick={() => setOrdersOpen((prev) => !prev)}
                className="mt-1 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span>Orders</span>
                <span className={`transition-transform ${ordersOpen ? "rotate-180" : "rotate-0"}`}>
                  ▾
                </span>
              </button>
              {ordersOpen && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/orders"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    All Orders
                  </Link>
                  <Link
                    href="/dashboard/orders?status=PENDING"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Pending Orders
                  </Link>
                  <Link
                    href="/dashboard/orders?status=FAILED"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Failed Orders
                  </Link>
                  <Link
                    href="/dashboard/orders/manual"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Manual Queue
                  </Link>
                </div>
              )}

              {/* Users */}
              <button
                type="button"
                onClick={() => setUsersOpen((prev) => !prev)}
                className="mt-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span>Users</span>
                <span className={`transition-transform ${usersOpen ? "rotate-180" : "rotate-0"}`}>
                  ▾
                </span>
              </button>
              {usersOpen && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/customers"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Customers
                  </Link>
                  <Link
                    href="/dashboard/agents"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Agents
                  </Link>
                  <Link
                    href="/dashboard/users/resellers"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Resellers
                  </Link>
                </div>
              )}

              {/* Pricing */}
              <button
                type="button"
                onClick={() => setPricingOpen((prev) => !prev)}
                className="mt-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span>Pricing</span>
                <span className={`transition-transform ${pricingOpen ? "rotate-180" : "rotate-0"}`}>
                  ▾
                </span>
              </button>
              {pricingOpen && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/products"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Bundle Pricing
                  </Link>
                  <Link
                    href="/dashboard/products?tab=network_pricing"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Network Pricing
                  </Link>
                </div>
              )}

              {/* Wallet */}
              <button
                type="button"
                onClick={() => setWalletOpen((prev) => !prev)}
                className="mt-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span>Wallet</span>
                <span className={`transition-transform ${walletOpen ? "rotate-180" : "rotate-0"}`}>
                  ▾
                </span>
              </button>
              {walletOpen && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/wallet"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Overview
                  </Link>
                  <Link
                    href="/dashboard/wallet?tab=manual_credit"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Manual Credit
                  </Link>
                </div>
              )}

              <span className="mt-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Platform</span>

              {/* Platform Tools */}
              <button
                type="button"
                onClick={() => setToolsOpen((prev) => !prev)}
                className="mt-1 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span>Platform Tools</span>
                <span className={`transition-transform ${toolsOpen ? "rotate-180" : "rotate-0"}`}>
                  ▾
                </span>
              </button>
              {toolsOpen && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/tools/forms"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Custom Forms
                  </Link>
                  <Link
                    href="/dashboard/tools/form-submissions"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Form Submissions
                  </Link>
                  <Link
                    href="/dashboard/tools/result-checkers"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Result Checkers
                  </Link>
                </div>
              )}

              <span className="mt-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">System</span>

              {/* System */}
              <button
                type="button"
                onClick={() => setSystemOpen((prev) => !prev)}
                className="mt-1 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span>System</span>
                <span className={`transition-transform ${systemOpen ? "rotate-180" : "rotate-0"}`}>
                  ▾
                </span>
              </button>
              {systemOpen && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5">
                  <Link
                    href="/dashboard/system/notifications"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Notifications
                  </Link>
                  <Link
                    href="/dashboard/system/complaints"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Complaints
                  </Link>
                  <Link
                    href="/dashboard/system/logs"
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    Logs
                  </Link>
                </div>
              )}

              <span className="mt-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Settings</span>

              {/* Settings */}
              <button
                type="button"
                onClick={() => setSettingsOpen((prev) => !prev)}
                className="mt-1 mb-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
              >
                <span>Settings</span>
                <span className={`transition-transform ${settingsOpen ? "rotate-180" : "rotate-0"}`}>
                  ▾
                </span>
              </button>
              {settingsOpen && (
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
      <div className="flex flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border/70 bg-[hsl(var(--blue-ice))]/70 px-4 lg:h-[60px] lg:px-6 backdrop-blur-xl">
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
            <SheetContent side="left" className="flex flex-col border-r border-border/70 bg-[hsl(var(--blue-ice))]/85 backdrop-blur-xl">
              <nav className="grid gap-1.5 text-sm font-medium max-h-[calc(100vh-4rem)] overflow-y-auto pr-1">
                <SheetClose asChild>
                  <Link
                    href="/"
                    className="flex items-center gap-2 text-lg font-bold text-primary"
                  >
                    <Package2 className="h-7 w-7" />
                    TeChDalt
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
                    href="/dashboard/analytics"
                    className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <LineChart className="h-5 w-5" />
                    Advanced Analytics
                  </Link>
                </SheetClose>

                <span className="mt-3 px-1 text-[10px] font-semibold uppercase text-muted-foreground">Management</span>

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
                  <span className={`transition-transform ${ordersOpen ? "rotate-180" : "rotate-0"}`}>
                    ▾
                  </span>
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
                        href="/dashboard/orders?status=PENDING"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Pending Orders
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/orders?status=FAILED"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Failed Orders
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/orders/manual"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Manual Queue
                      </Link>
                    </SheetClose>
                  </div>
                )}

                {/* Users */}
                <button
                  type="button"
                  onClick={() => setUsersOpen((prev) => !prev)}
                  className="mt-2 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Users className="h-5 w-5" />
                    Users
                  </span>
                  <span className={`transition-transform ${usersOpen ? "rotate-180" : "rotate-0"}`}>
                    ▾
                  </span>
                </button>
                {usersOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/customers"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Customers
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

                {/* Pricing */}
                <button
                  type="button"
                  onClick={() => setPricingOpen((prev) => !prev)}
                  className="mt-2 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Package className="h-5 w-5" />
                    Pricing
                  </span>
                  <span className={`transition-transform ${pricingOpen ? "rotate-180" : "rotate-0"}`}>
                    ▾
                  </span>
                </button>
                {pricingOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/products"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Bundle Pricing
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/products?tab=network_pricing"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Network Pricing
                      </Link>
                    </SheetClose>
                  </div>
                )}

                {/* Wallet */}
                <button
                  type="button"
                  onClick={() => setWalletOpen((prev) => !prev)}
                  className="mt-2 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Wallet className="h-5 w-5" />
                    Wallet
                  </span>
                  <span className={`transition-transform ${walletOpen ? "rotate-180" : "rotate-0"}`}>
                    ▾
                  </span>
                </button>
                {walletOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/wallet"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Overview
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/wallet?tab=manual_credit"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Manual Credit
                      </Link>
                    </SheetClose>
                  </div>
                )}

                <span className="mt-3 px-1 text-[10px] font-semibold uppercase text-muted-foreground">Platform</span>

                {/* Platform Tools */}
                <button
                  type="button"
                  onClick={() => setToolsOpen((prev) => !prev)}
                  className="mt-1 mx-[-0.65rem] flex w-[calc(100%+1.3rem)] items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <FileText className="h-5 w-5" />
                    Platform Tools
                  </span>
                  <span className={`transition-transform ${toolsOpen ? "rotate-180" : "rotate-0"}`}>
                    ▾
                  </span>
                </button>
                {toolsOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/tools/forms"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Custom Forms
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/tools/form-submissions"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Form Submissions
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/tools/result-checkers"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Result Checkers
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
                  <span className={`transition-transform ${systemOpen ? "rotate-180" : "rotate-0"}`}>
                    ▾
                  </span>
                </button>
                {systemOpen && (
                  <div className="mt-1 ml-6 flex flex-col gap-0.5">
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/system/notifications"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Notifications
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/system/complaints"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Complaints
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/dashboard/system/logs"
                        className="rounded-xl px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Logs
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
                  <span className={`transition-transform ${settingsOpen ? "rotate-180" : "rotate-0"}`}>
                    ▾
                  </span>
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
          <div className="w-full flex-1">
            <form>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search products..."
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
              <DropdownMenuItem>Support</DropdownMenuItem>
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
        <main className="flex flex-1 flex-col gap-4 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.4))] p-4 lg:gap-6 lg:p-6 dark:bg-[linear-gradient(to_bottom,rgba(15,23,42,0.0),rgba(15,23,42,0.32))]">
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
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading dashboard…</div>}>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
