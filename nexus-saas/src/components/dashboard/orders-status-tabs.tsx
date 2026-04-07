"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_VALUES = ["ALL", "COMPLETED", "PENDING", "FAILED"] as const;

type StatusValue = (typeof STATUS_VALUES)[number];

interface OrdersStatusTabsProps {
  currentStatus?: string;
}

export function OrdersStatusTabs({ currentStatus }: OrdersStatusTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const normalized: StatusValue =
    STATUS_VALUES.includes((currentStatus || "ALL") as StatusValue)
      ? ((currentStatus || "ALL") as StatusValue)
      : "ALL";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    const query = params.toString();
    const url = query ? `/dashboard/orders?${query}` : "/dashboard/orders";
    router.push(url);
  }

  return (
    <Tabs value={normalized} onValueChange={handleChange} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="ALL">All</TabsTrigger>
        <TabsTrigger value="COMPLETED">Delivered</TabsTrigger>
        <TabsTrigger value="PENDING">Pending</TabsTrigger>
        <TabsTrigger value="FAILED">Failed</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
