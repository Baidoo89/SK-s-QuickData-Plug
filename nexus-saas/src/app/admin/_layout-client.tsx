"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Tag,
  Wallet,
  Wrench,
  ServerCog,
  Settings,
  CircleUser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen w-full grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_30%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--background)))]">
      <aside className="sticky top-0 h-screen border-r border-border/70 bg-[hsl(var(--blue-ice))]/85 backdrop-blur-xl">
        <div className="flex h-[60px] items-center border-b border-border/70 px-4">
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Admin Portal</span>
            <span className="text-sm font-bold tracking-tight">Operations Console</span>
          </div>
        </div>
        <div className="flex h-[calc(100vh-60px)] flex-col gap-4 overflow-y-auto px-3 py-4">
          <div>
            <p className="px-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">Dashboard</p>
            <NavLink href="/admin" label="Overview" icon={LayoutDashboard} />
          </div>

          <div>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Orders</p>
            <NavLink href="/admin/orders" label="All Orders" icon={ShoppingCart} />
            <NavLink href="/admin/orders/manual" label="Manual Queue" icon={ShoppingCart} />
          </div>

          <div>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Users</p>
            <NavLink href="/admin/users" label="Users & Agents" icon={Users} />
          </div>

          <div>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Pricing</p>
            <NavLink href="/admin/pricing" label="Pricing Controls" icon={Tag} />
          </div>

          <div>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Wallet</p>
            <NavLink href="/admin/wallet" label="Wallet & Balances" icon={Wallet} />
          </div>

          <div>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Platform Tools</p>
            <NavLink href="/admin/tools" label="Forms & Tools" icon={Wrench} />
          </div>

          <div>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">System</p>
            <NavLink href="/admin/system" label="System Health" icon={ServerCog} />
          </div>

          <div>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Settings</p>
            <NavLink href="/admin/settings" label="Admin Settings" icon={Settings} />
          </div>
        </div>
      </aside>

      <div className="flex flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-border/70 bg-[hsl(var(--blue-ice))]/70 px-4 backdrop-blur-xl">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Admin Portal</h1>
            <p className="text-xs text-muted-foreground">Core controls for daily platform operations.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">Operations View</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="rounded-full">
                  <CircleUser className="h-5 w-5" />
                  <span className="sr-only">Toggle admin menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Admin</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/admin/settings">Admin Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/login">Logout</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.4))] p-4 md:p-6 dark:bg-[linear-gradient(to_bottom,rgba(15,23,42,0.0),rgba(15,23,42,0.32))]">
          {children}
        </main>
      </div>
    </div>
  );
}
