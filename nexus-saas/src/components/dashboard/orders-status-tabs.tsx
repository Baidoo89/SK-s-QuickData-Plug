"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_VALUES = ["ALL", "PENDING", "PROCESSING", "COMPLETED", "PENDING_PAYMENT", "PAYMENT_FAILED", "FAILED"] as const;

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
    <Tabs value={normalized} onValueChange={handleChange} className="min-w-0 max-w-full">
      <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
        <TabsTrigger value="ALL">All</TabsTrigger>
        <TabsTrigger value="PENDING">Pending</TabsTrigger>
        <TabsTrigger value="PROCESSING">Processing</TabsTrigger>
        <TabsTrigger value="COMPLETED">Delivered</TabsTrigger>
        <TabsTrigger value="PENDING_PAYMENT">Awaiting Payment</TabsTrigger>
        <TabsTrigger value="PAYMENT_FAILED">Payment Failed</TabsTrigger>
        <TabsTrigger value="FAILED">Failed</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
