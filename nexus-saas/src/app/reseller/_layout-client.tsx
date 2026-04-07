"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package2, LayoutDashboard, Wallet, ShoppingBag, FileText, ListChecks, User, CircleUser, Menu } from "lucide-react";
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
  { href: "/reseller/wallet", label: "Wallet", icon: Wallet },
  { href: "/reseller/buy/single", label: "Buy data", icon: ShoppingBag },
  { href: "/reseller/orders", label: "View orders", icon: ListChecks },
  { href: "/reseller/api-docs", label: "API docs", icon: FileText },
  { href: "/reseller/account", label: "Account", icon: User },
];

export default function ResellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.08),transparent_24%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--background)))]">
      <aside className="hidden border-r border-border/70 bg-[hsl(var(--blue-ice))]/85 backdrop-blur-xl md:fixed md:left-0 md:top-0 md:z-30 md:block md:h-screen md:w-[220px] lg:w-[260px]">
        <div className="flex h-full max-h-screen flex-col">
          <div className="flex h-14 items-center border-b border-border/70 px-4 lg:h-[60px] lg:px-6">
            <Link href="/reseller" className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <Package2 className="h-6 w-6 text-primary" />
              <span className="text-primary">TeChDalt</span>
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
            <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Storefronts for all
            </p>
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col md:pl-[220px] lg:pl-[260px]">
        <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border/70 bg-[hsl(var(--blue-ice))]/70 px-3 sm:px-4 md:left-[220px] lg:left-[260px] lg:h-[60px] lg:px-6 backdrop-blur-xl">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] border-r border-border/70 bg-[hsl(var(--blue-ice))]/85 p-0 backdrop-blur-xl">
                <div className="flex h-14 items-center border-b border-border/70 px-4">
                  <Link href="/reseller" className="flex items-center gap-2 font-bold text-lg tracking-tight text-primary">
                    <Package2 className="h-5 w-5" />
                    <span>TeChDalt</span>
                  </Link>
                </div>
                <nav className="space-y-1 px-3 py-4 text-sm">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
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
              <DropdownMenuItem asChild>
                <Link href="/login">Logout</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 overflow-x-hidden bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.4))] p-4 pt-16 lg:gap-6 lg:p-6 lg:pt-[76px] dark:bg-[linear-gradient(to_bottom,rgba(15,23,42,0.0),rgba(15,23,42,0.32))]">
          {children}
        </main>
      </div>
    </div>
  );
}
