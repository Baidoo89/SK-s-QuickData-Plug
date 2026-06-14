"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  UserCheck,
  CreditCard,
  Wallet,
  Wrench,
  ServerCog,
  Settings,
  CircleUser,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function NavLink({ href, label, icon: Icon, closeOnClick = false }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; closeOnClick?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href;
  const link = (
    <Link
      href={href}
      title={label}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
        active ? "border-primary/30 bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:text-primary"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="portal-sidebar-label">{label}</span>
    </Link>
  );

  return closeOnClick ? <SheetClose asChild>{link}</SheetClose> : link;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const renderNavigation = (mobile = false) => (
    <>
      <div>
        <p className="portal-sidebar-section px-3 pb-1 text-[11px] font-bold uppercase text-muted-foreground">Control</p>
        <NavLink href="/admin" label="Businesses" icon={LayoutDashboard} closeOnClick={mobile} />
      </div>

      <div>
        <p className="portal-sidebar-section px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-muted-foreground">Users</p>
        <NavLink href="/admin/users" label="Users" icon={Users} closeOnClick={mobile} />
        <NavLink href="/admin/approvals" label="Approvals" icon={UserCheck} closeOnClick={mobile} />
      </div>

      <div>
        <p className="portal-sidebar-section px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-muted-foreground">Plans</p>
        <NavLink href="/admin/subscriptions" label="Plans" icon={CreditCard} closeOnClick={mobile} />
      </div>

      <div>
        <p className="portal-sidebar-section px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-muted-foreground">Money</p>
        <NavLink href="/admin/payments" label="Payments" icon={CreditCard} closeOnClick={mobile} />
        <NavLink href="/admin/wallet" label="Wallets" icon={Wallet} closeOnClick={mobile} />
        <NavLink href="/admin/withdrawals" label="Withdrawals" icon={Wallet} closeOnClick={mobile} />
      </div>

      <div>
        <p className="portal-sidebar-section px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-muted-foreground">Orders</p>
        <NavLink href="/admin/orders" label="Orders" icon={ShoppingCart} closeOnClick={mobile} />
      </div>

      <div>
        <p className="portal-sidebar-section px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-muted-foreground">Tools</p>
        <NavLink href="/admin/tools" label="Tools" icon={Wrench} closeOnClick={mobile} />
      </div>

      <div>
        <p className="portal-sidebar-section px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-muted-foreground">System</p>
        <NavLink href="/admin/system" label="Health" icon={ServerCog} closeOnClick={mobile} />
      </div>

      <div>
        <p className="portal-sidebar-section px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-muted-foreground">Settings</p>
        <NavLink href="/admin/settings" label="Settings" icon={Settings} closeOnClick={mobile} />
      </div>
    </>
  );

  return (
    <div className="app-shell-bg min-h-screen w-full max-w-full overflow-x-hidden">
      <aside data-collapsed={sidebarCollapsed} className={`portal-sidebar app-sidebar hidden border-r border-border/70 backdrop-blur-xl md:fixed md:left-0 md:top-0 md:z-30 md:block md:h-screen ${sidebarCollapsed ? "md:w-[72px]" : "md:w-[220px] xl:w-[260px]"}`}>
        <div className={`flex h-[60px] items-center border-b border-border/70 px-4 ${sidebarCollapsed ? "justify-center" : ""}`}>
          <div className="portal-sidebar-label flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-xs font-extrabold text-primary">
              SA
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-bold uppercase text-muted-foreground">Superadmin</span>
              <span className="block truncate text-sm font-extrabold tracking-normal">Owner</span>
            </div>
          </div>
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
        <div className="flex h-[calc(100vh-60px)] flex-col gap-4 overflow-y-auto px-3 py-4">
          {renderNavigation()}
        </div>
      </aside>

      <div className={`flex min-h-screen min-w-0 flex-col ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[220px] xl:pl-[260px]"}`}>
        <header className={`app-topbar fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border/70 px-3 backdrop-blur-xl sm:px-4 lg:h-[60px] lg:px-6 ${sidebarCollapsed ? "md:left-[72px]" : "md:left-[220px] xl:left-[260px]"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="app-sidebar w-[min(88vw,320px)] border-r border-border/70 p-0 backdrop-blur-xl">
                <div className="flex h-14 items-center border-b border-border/70 px-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-xs font-extrabold text-primary">
                      SA
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase text-muted-foreground">Superadmin</span>
                      <span className="block truncate text-sm font-extrabold tracking-normal">Owner</span>
                    </div>
                  </div>
                </div>
                <nav className="flex max-h-[calc(100vh-3.5rem)] flex-col gap-4 overflow-y-auto px-3 py-4 text-sm">
                  {renderNavigation(true)}
                </nav>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-normal">Owner</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">Businesses, plans, money, and health.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:inline-flex">Owner View</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="rounded-full">
                  <CircleUser className="h-5 w-5" />
                  <span className="sr-only">Toggle admin menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Superadmin</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/admin/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onSelect={(event) => {
                    event.preventDefault();
                    void signOut({ callbackUrl: "/login" });
                  }}
                >
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="content-sheen min-w-0 flex-1 overflow-x-hidden px-3 py-4 pt-16 sm:px-4 md:p-6 md:pt-[76px]">
          {children}
        </main>
      </div>
    </div>
  );
}
