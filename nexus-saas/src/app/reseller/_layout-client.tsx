"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronDown, ChevronRight, Package2, LayoutDashboard, Wallet, ShoppingBag, FileText, ListChecks, User, CircleUser, Menu, Store, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/reseller", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Finance",
    icon: Wallet,
    key: "wallet",
    children: [
      { href: "/reseller/wallet", label: "Wallet Top Up" },
      { href: "/reseller/withdrawals", label: "Withdrawals" },
    ],
  },
  {
    label: "Storefront",
    icon: Store,
    key: "storefront",
    children: [
      { href: "/reseller/storefronts", label: "Share Links" },
      { href: "/reseller/storefront-pricing", label: "Customer Prices" },
      { href: "/reseller/service-requests", label: "Service Requests" },
    ],
  },
  { href: "/reseller/buy/single", label: "Sales", icon: ShoppingBag },
  { href: "/reseller/orders", label: "Orders", icon: ListChecks },
  { href: "/reseller/api-docs", label: "API Docs", icon: FileText },
  { href: "/reseller/account", label: "Account", icon: User },
];

export default function ResellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="app-shell-bg min-h-screen w-full overflow-x-hidden">
      <aside data-collapsed={sidebarCollapsed} className={`portal-sidebar app-sidebar hidden border-r border-border/70 backdrop-blur-xl md:fixed md:left-0 md:top-0 md:z-30 md:block md:h-screen ${sidebarCollapsed ? "md:w-[72px]" : "md:w-[220px] lg:w-[260px]"}`}>
        <div className="flex h-full max-h-screen flex-col">
          <div className={`flex h-14 items-center border-b border-border/70 px-4 lg:h-[60px] ${sidebarCollapsed ? "justify-center lg:px-3" : "lg:px-6"}`}>
            <Link href="/reseller" className={`${sidebarCollapsed ? "hidden" : "flex"} items-center gap-2 font-bold text-xl tracking-tight`}>
              <Package2 className="h-6 w-6 text-primary" />
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
          <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
            <p className="portal-sidebar-section mb-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Reseller Workspace
            </p>
            <div className="space-y-1">
              {navItems.map((item) => {
                if ("children" in item && Array.isArray(item.children)) {
                  const children = item.children;
                  const sectionKey = item.key || item.label.toLowerCase();
                  const isSectionActive = children.some((child) => pathname === child.href);
                  const isOpen = openSections[sectionKey] || isSectionActive;
                  const Icon = item.icon;

                  if (sidebarCollapsed) {
                    return (
                      <Link
                        key={sectionKey}
                        href={children[0]?.href || "/reseller"}
                        title={item.label}
                        className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors ${
                          isSectionActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="sr-only">{item.label}</span>
                      </Link>
                    );
                  }

                  return (
                    <div key={sectionKey} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        title={item.label}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                          isSectionActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span className="portal-sidebar-label truncate">{item.label}</span>
                          </span>
                        {isOpen ? <ChevronDown className="portal-sidebar-chevron h-3.5 w-3.5" /> : <ChevronRight className="portal-sidebar-chevron h-3.5 w-3.5" />}
                      </button>
                      {isOpen && !sidebarCollapsed && (
                        <div className="portal-sidebar-subnav ml-6 space-y-0.5">
                          {children.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                                pathname === child.href
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              }`}
                            >
                              <span>{child.label}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                if (!("href" in item) || !item.href) {
                  return null;
                }

                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="portal-sidebar-label truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>
      <div className={`flex min-h-screen min-w-0 flex-col ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[220px] lg:pl-[260px]"}`}>
        <header className={`app-topbar fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border/70 px-3 sm:px-4 lg:h-[60px] lg:px-6 backdrop-blur-xl ${sidebarCollapsed ? "md:left-[72px]" : "md:left-[220px] lg:left-[260px]"}`}>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="app-sidebar w-[280px] border-r border-border/70 p-0 backdrop-blur-xl">
                <div className="flex h-14 items-center border-b border-border/70 px-4">
                  <Link href="/reseller" className="flex items-center gap-2 font-bold text-lg tracking-tight text-primary">
                    <Package2 className="h-5 w-5" />
                    <span>TechDalt</span>
                  </Link>
                </div>
                <nav className="max-h-[calc(100vh-3.5rem)] space-y-1 overflow-y-auto px-3 py-4 text-sm">
                  {navItems.map((item) => {
                    if ("children" in item && Array.isArray(item.children)) {
                      const children = item.children;
                      const sectionKey = item.key || item.label.toLowerCase();
                      const isSectionActive = children.some((child) => pathname === child.href);
                      const isOpen = openSections[sectionKey] || isSectionActive;
                      const Icon = item.icon;

                      return (
                        <div key={sectionKey} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => toggleSection(sectionKey)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                              isSectionActive
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          {isOpen && (
                            <div className="ml-6 space-y-0.5">
                              {children.map((child) => (
                                <SheetClose asChild key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                                      pathname === child.href
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                    }`}
                                  >
                                    <span>{child.label}</span>
                                  </Link>
                                </SheetClose>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (!("href" in item) || !item.href) {
                      return null;
                    }

                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SheetClose>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex flex-col">
              <span className="truncate text-sm font-semibold leading-tight">Reseller Portal</span>
              <span className="hidden truncate text-xs text-muted-foreground leading-tight sm:block">Sell data, track wallet, manage your API.</span>
            </div>
          </div>
          <div className="ml-auto shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full">
                <CircleUser className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Reseller</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/reseller/account">Account Settings</Link>
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
        <main className="content-sheen flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden p-4 pt-16 lg:gap-6 lg:p-6 lg:pt-[76px]">
          {children}
        </main>
      </div>
    </div>
  );
}
