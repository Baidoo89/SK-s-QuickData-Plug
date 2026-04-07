"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/reseller/buy/single", label: "Single purchase" },
  { href: "/reseller/buy/bulk", label: "Bulk purchase" },
];

export default function ResellerBuyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="w-full max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Buy data</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Use your reseller wallet to send single or bulk data bundles. Choose a mode below and confirm the numbers carefully.
          </p>
        </div>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">Purchase mode</CardTitle>
          </CardHeader>
          <CardContent className="border-b px-0 pb-0 pt-0">
            <div className="flex gap-4 px-4">
              {tabs.map((tab) => {
                const active = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "relative inline-flex items-center justify-center px-0 py-2 text-xs font-medium text-muted-foreground transition-colors",
                      active
                        ? "text-foreground after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-primary"
                        : "hover:text-foreground"
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </CardContent>
          <CardContent className="pt-4">
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
