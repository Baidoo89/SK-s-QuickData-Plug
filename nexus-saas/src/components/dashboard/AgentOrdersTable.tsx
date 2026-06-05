"use client";

import React, { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { formatGhanaCedis } from "@/lib/currency";

export default function AgentOrdersTable({ agentId }: { agentId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      try {
        const res = await fetch(`/api/orders?role=agent&id=${agentId}`);
        if (!res.ok) throw new Error("Failed to load orders");
        setOrders(await res.json());
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [agentId]);

  return (
    <Card className="border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold md:text-xl">Recent Orders</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-muted-foreground">No orders found for this agent.</div>
        ) : (
          <div className="table-scroll rounded-md border">
            <table className="min-w-[520px] text-xs md:text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border px-3 py-2 text-left font-semibold">Order ID</th>
                  <th className="border px-3 py-2 text-left font-semibold">Amount</th>
                  <th className="border px-3 py-2 text-left font-semibold">Status</th>
                  <th className="border px-3 py-2 text-left font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 10).map((order) => (
                  <tr key={order.id}>
                    <td className="border px-3 py-2 font-mono">{order.id}</td>
                    <td className="border px-3 py-2">{formatGhanaCedis(order.total ?? 0)}</td>
                    <td className="border px-3 py-2">{order.status}</td>
                    <td className="border px-3 py-2">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
